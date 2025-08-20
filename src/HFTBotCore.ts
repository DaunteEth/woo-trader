import { EventEmitter } from 'events';
import { WooXClient } from './exchange/WooXClient';
import { WooXWebSocket } from './exchange/WooXWebSocket';
import { SignalGenerator, SignalOutput } from './SignalGenerator';
import { PositionManager } from './managers/PositionManager';
import { RiskManager } from './managers/RiskManager';
import { MarketData, Position, Signal } from './types/trading';
import { config } from './utils/config';
import { createLogger } from './utils/logger';
import { DatabaseService } from './services/DatabaseService';
import { TrendAnalyzer, TrendContext } from './indicators/TrendAnalyzer';
import * as fs from 'fs/promises';
import * as path from 'path';

export class HFTBotCore extends EventEmitter {
  private exchange: WooXClient;
  private websocket: WooXWebSocket;
  private signalGenerator: SignalGenerator;
  private positionManager: PositionManager;
  private riskManager: RiskManager;
  private database: DatabaseService = new DatabaseService();
  private logger = createLogger('HFTBotCore');
  private isRunning: boolean = false;
  private marketDataCache: Map<string, MarketData[]> = new Map();
  private multiTimeframeCache: Map<string, Map<string, MarketData[]>> = new Map();
  private trendAnalyzer: TrendAnalyzer = new TrendAnalyzer();
  private allocatedCapital: number = 0;
  private lastSignalOutput: SignalOutput | null = null;
  private tradeHistory: any[] = [];
  private userId: string | null = null;
  private simulationId: string | null = null;
  
  getUserId(): string | null {
    return this.userId;
  }
  
  getSimulationId(): string | null {
    return this.simulationId;
  }
  
  constructor(initialBalance: number = 10000) {
    super();
    
    this.exchange = new WooXClient(
      config.exchange.apiKey,
      config.exchange.apiSecret,
      config.exchange.appId,
      config.exchange.testnet
    );
    
    this.websocket = new WooXWebSocket();
    this.signalGenerator = new SignalGenerator(this.simulationId || undefined, this.exchange);
    this.positionManager = new PositionManager(initialBalance);
    this.riskManager = new RiskManager(initialBalance);
    this.database = new DatabaseService();
  }
  
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing HFT Bot Core');
      
      // Initialize database
      await this.database.initialize();

      // Initialize signal generator with database configurations
      await this.signalGenerator.initialize();
      
      // Initialize exchange connection
      await this.exchange.initialize();
      
      // Update starting balance dynamically in live mode
      if (config.trading.mode === 'live') {
        try {
          const balances = await this.exchange.getBalance();
          // Prefer USDT balance if available; otherwise, sum all
          const usdt = balances['USDT'] || 0;
          const total = usdt > 0 
            ? usdt 
            : Object.values(balances).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
          if (total > 0) {
            this.positionManager.updateBalance(total);
            this.riskManager.updateMaxDrawdown(total);
            this.logger.info('Initialized live trading balance from exchange', { total });
          }
        } catch (e) {
          this.logger.warn('Failed to fetch live balance; falling back to configured initial balance');
        }
      }
      
      // Setup WebSocket connection
      this.websocket.on('orderbook', (data) => {
        this.logger.debug('Orderbook update', data);
      });
      
      this.websocket.on('ticker', (data) => {
        this.logger.debug('Ticker update', data);
      });
      
      this.websocket.on('trades', (data) => {
        this.logger.debug('Trade update', data);
      });
      
      await this.websocket.connect();
      
      // Subscribe to trading pairs
      for (const symbol of config.trading.symbols) {
              this.websocket.subscribeToSymbol(symbol);
      }
      
      // Load existing open positions from database
      await this.loadExistingPositions();
      
      this.logger.info('HFT Bot Core initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize bot', error);
      throw error;
    }
  }
  
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Bot is already running');
      return;
    }
    
    this.isRunning = true;
    this.logger.info('Starting HFT Bot');
    
    // Initialize market data before starting main loop
    this.logger.info('Initializing market data...');
    await this.updateMarketData();
    
    // Wait for higher timeframe data to populate and verify
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify we have multi-timeframe data
    for (const symbol of config.trading.symbols) {
      const mtf = this.multiTimeframeCache.get(symbol);
      if (!mtf || mtf.size === 0) {
        this.logger.warn('Multi-timeframe data not ready, fetching again...', { symbol });
        await this.updateMarketData();
        await new Promise(resolve => setTimeout(resolve, 2000));
        break;
      }
    }
    
    // Emit initial status
    this.emitStatus();
    
    // Main loop
    while (this.isRunning) {
      try {
        await this.runCycle();
        
        // Wait before next cycle (5 seconds to reduce noise)
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        this.logger.error('Error in main loop', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s on error
      }
    }
  }
  
  async stop(): Promise<void> {
    this.logger.info('Stopping HFT Bot');
    this.isRunning = false;
    
    // Disconnect WebSocket
    this.websocket.disconnect();
    
    // Close all positions
    const positions = this.positionManager.getOpenPositions();
    for (const position of positions) {
      try {
        await this.closePosition(position);
      } catch (error) {
        this.logger.error('Failed to close position on shutdown', {
          position: position.id,
          error
        });
      }
    }
    
    // Emit final status
    this.emitStatus();
  }
  
  private async runCycle(): Promise<void> {
    // Reset daily risk limits if needed
    this.riskManager.resetDaily();
    
    // Update market data
    await this.updateMarketData();
    
    // Get account info
    const accountInfo = this.positionManager.getAccountInfo();
    
    // Update risk metrics
    this.riskManager.updateMaxDrawdown(accountInfo.totalBalance);
    
    // Check if trading is halted
    if (this.riskManager.isTradingHalted()) {
      this.logger.warn('Trading halted by risk manager');
      return;
    }
    
    // Update position prices and check risk
    for (const position of accountInfo.positions) {
      const marketData = this.marketDataCache.get(position.symbol);
      if (marketData && marketData.length > 0) {
        const latestPrice = marketData[marketData.length - 1].close;
        this.positionManager.updatePosition(position.id, latestPrice);
        
        // Check stop loss and take profit FIRST
        const shouldCloseForSL = position.side === 'long' 
          ? latestPrice <= position.stopLoss 
          : latestPrice >= position.stopLoss;
          
        const shouldCloseForTP = position.side === 'long'
          ? latestPrice >= position.takeProfit
          : latestPrice <= position.takeProfit;
          
        if (shouldCloseForSL) {
          this.logger.info('Stop loss triggered', {
            position: position.id,
            symbol: position.symbol,
            side: position.side,
            stopLoss: position.stopLoss,
            currentPrice: latestPrice
          });
          await this.closePosition(position, 'Stop Loss');
          continue;
        }
        
        if (shouldCloseForTP) {
          this.logger.info('Take profit triggered', {
            position: position.id,
            symbol: position.symbol,
            side: position.side,
            takeProfit: position.takeProfit,
            currentPrice: latestPrice
          });
          await this.closePosition(position, 'Take Profit');
          continue;
        }
        
        // Check if position has been open too long (stale positions)
        const positionAgeMinutes = (Date.now() - position.openTime.getTime()) / 1000 / 60;
        if (positionAgeMinutes > 120) { // Close positions older than 2 hours
          this.logger.info('Closing stale position', {
            position: position.id,
            age: positionAgeMinutes,
            pnl: position.pnl
          });
          await this.closePosition(position, 'Stale Position (>2 hours)');
          continue;
        }
        
        // Check if position is profitable and should lock in profits
        if (position.pnlPercent > 1.5 && positionAgeMinutes > 10) { // 1.5% profit after 10 minutes
          this.logger.info('Locking in profits', {
            position: position.id,
            pnlPercent: position.pnlPercent
          });
          await this.closePosition(position, 'Profit Lock (1.5%+)');
          continue;
        }
        
        // Then check general risk parameters
        const riskCheck = this.riskManager.checkPositionRisk(position);
        if (riskCheck.shouldClose) {
          await this.closePosition(position, riskCheck.reason);
        }
      }
    }
    
    // Create trend context map
    const trendContextMap = new Map<string, TrendContext>();
    
    for (const symbol of config.trading.symbols) {
      const marketData = this.marketDataCache.get(symbol);
      if (marketData && marketData.length > 0) {
        const multiTimeframe = this.multiTimeframeCache.get(symbol);
        
        // Always calculate trend context, even without multi-timeframe data
        const trendContext = this.trendAnalyzer.analyzeTrend(
          marketData,
          multiTimeframe?.get('15m'),
          multiTimeframe?.get('1h'),
          multiTimeframe?.get('4h')
        );
        trendContextMap.set(symbol, trendContext);
        
        // Debug trend context
        this.logger.debug('Trend context calculated', {
          symbol,
          trend: trendContext.trend,
          higherTimeframeTrend: trendContext.higherTimeframeTrend,
          tradingConditions: trendContext.tradingConditions,
          trendAlignment: trendContext.trendAlignment,
          volatility: trendContext.volatility,
          hasMultiTimeframe: !!multiTimeframe
        });
      }
    }
    
    // Calculate truly available balance
    const trueAvailableBalance = Math.max(0, accountInfo.availableBalance - this.allocatedCapital);
    
    // Generate signals with trend context
    const signalOutput = await this.signalGenerator.generateSignals(
      this.marketDataCache,
      accountInfo.positions,
      trueAvailableBalance,
      trendContextMap
    );
    
    // Save signals to file for LLM consumption
    await this.saveSignalOutput(signalOutput);
    
    // Store for API access
    this.lastSignalOutput = signalOutput;
    
    // Emit signal update
    this.emit('signal', signalOutput);
    
    // Log signal details for debugging
    if (signalOutput.signals.length > 0) {
      this.logger.info('Signals available for execution', {
        count: signalOutput.signals.length,
        signals: signalOutput.signals.map(s => ({
          symbol: s.symbol,
          action: s.action,
          strength: s.strength,
          confidence: s.confidence,
          strategy: s.strategy
        }))
      });
    }
    
    // Add trend context to signals before saving
    for (const signal of signalOutput.signals) {
      const trendContext = trendContextMap.get(signal.symbol);
      if (trendContext) {
        signal.indicators.trendContext = {
          trend: trendContext.trend,
          higherTimeframeTrend: trendContext.higherTimeframeTrend,
          tradingConditions: trendContext.tradingConditions,
          trendAlignment: trendContext.trendAlignment
        };
      }
      await this.database.saveSignal(signal);
    }
    
    // Execute signals if in live mode
    if (config.trading.mode === 'live' || config.trading.mode === 'paper') {
      await this.executeSignals(signalOutput.signals);
    }
    
    // Emit status update
    this.emitStatus();
  }
  
  private async updateMarketData(): Promise<void> {
    for (const symbol of config.trading.symbols) {
      try {
        // Fetch multiple timeframes in parallel for trend analysis
        const [ohlcv1m, ohlcv15m, ohlcv1h, ohlcv4h, orderbook] = await Promise.all([
          this.exchange.fetchOHLCV(symbol, '1m', 100),
          this.exchange.fetchOHLCV(symbol, '15m', 50),
          this.exchange.fetchOHLCV(symbol, '1h', 50),
          this.exchange.fetchOHLCV(symbol, '4h', 50),
          this.exchange.fetchOrderBook(symbol, 20) // Fetch 20 levels for better arbitrage detection
        ]);
        
        // Process 1m data with orderbook info and add fresh timestamps
        const now = Date.now();
        const marketData = ohlcv1m.map((candle: MarketData, index: number) => ({
          ...candle,
          bid: orderbook.bids[0]?.[0] || 0,
          ask: orderbook.asks[0]?.[0] || 0,
          spread: orderbook.asks[0]?.[0] - orderbook.bids[0]?.[0] || 0,
          bidSize: orderbook.bids[0]?.[1] || 0,
          askSize: orderbook.asks[0]?.[1] || 0,
          orderbook: {
            bids: orderbook.bids,
            asks: orderbook.asks
          },
          fetchedAt: now, // Add timestamp when data was fetched
          isLatest: index === ohlcv1m.length - 1
        }));
        
        this.marketDataCache.set(symbol, marketData);
        
        // Store higher timeframe data for trend analysis
        if (!this.multiTimeframeCache.has(symbol)) {
          this.multiTimeframeCache.set(symbol, new Map());
        }
        const symbolCache = this.multiTimeframeCache.get(symbol)!;
        symbolCache.set('15m', ohlcv15m);
        symbolCache.set('1h', ohlcv1h);
        symbolCache.set('4h', ohlcv4h);
        
        // Emit market data update
        const latestData = marketData[marketData.length - 1];
        // Analyze trend context
        const trendContext = this.trendAnalyzer.analyzeTrend(
          marketData,
          ohlcv15m,
          ohlcv1h,
          ohlcv4h
        );
        
        this.emit('marketData', {
          symbol,
          price: latestData.close,
          bid: latestData.bid,
          ask: latestData.ask,
          spread: latestData.spread,
          volume24h: marketData.reduce((sum, d) => sum + d.volume, 0),
          volatility: this.calculateVolatility(marketData),
          trendContext,
          dataAge: Date.now() - (latestData.timestamp as unknown as number), // How old is this data in ms
          lastUpdated: (latestData as any).fetchedAt || Date.now() // When we fetched it
        });
      } catch (error) {
        this.logger.error(`Failed to update market data for ${symbol}`, error);
      }
    }
  }
  
  private calculateVolatility(marketData: MarketData[]): number {
    if (marketData.length < 20) return 0.02; // Default 2% if not enough data
    
    const returns = [];
    for (let i = 1; i < Math.min(marketData.length, 60); i++) {
      const ret = (marketData[i].close - marketData[i-1].close) / marketData[i-1].close;
      returns.push(ret);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }
  
  private async executeSignals(signals: Signal[]): Promise<void> {
    // First, process signals for AI autonomous execution if enabled
    const marketDataMap = new Map<string, MarketData[]>();
    
    // Use the marketDataCache which contains 1m data, or get from multiTimeframeCache
    for (const symbol of config.trading.symbols) {
      const data = this.marketDataCache.get(symbol) || 
                   this.multiTimeframeCache.get(symbol)?.get('1m') || 
                   [];
      if (data.length > 0) {
        marketDataMap.set(symbol, data);
      }
    }
    
    const autonomousDecisions = await this.signalGenerator.processSignalsForAutonomousExecution(
      signals,
      marketDataMap,
      this.positionManager.getOpenPositions(),
      this.positionManager.getAccountInfo().totalBalance
    );
    
    // Execute autonomous decisions with higher priority
    for (const { signal: aiSignal, decision } of autonomousDecisions) {
      this.logger.info('Executing AI autonomous decision', {
        symbol: aiSignal.symbol,
        action: decision.action,
        reasoning: decision.reasoning,
        strategy: aiSignal.strategy
      });
      
      // Replace the original signal with the AI-adjusted one
      const signalIndex = signals.findIndex(s => 
        s.symbol === aiSignal.symbol && s.strategy === aiSignal.strategy
      );
      if (signalIndex >= 0) {
        signals[signalIndex] = aiSignal;
      }
    }
    
    // Continue with regular signal execution
    for (const signal of signals) {
      try {
        // Check if we should execute this signal
        const minStrengthForExecution = 0.3; // Lowered from 0.5
        const minConfidenceForExecution = 0.4; // Lowered from 0.5
        
        if (signal.strength < minStrengthForExecution) {
          this.logger.info('Signal strength below execution threshold', { 
            symbol: signal.symbol,
            strategy: signal.strategy,
            strength: signal.strength,
            minRequired: minStrengthForExecution,
            confidence: signal.confidence,
            action: signal.action
          });
          continue;
        }
        
        // Also check confidence
        if (signal.confidence < minConfidenceForExecution) {
          this.logger.info('Signal confidence below execution threshold', { 
            symbol: signal.symbol,
            strategy: signal.strategy,
            strength: signal.strength,
            confidence: signal.confidence,
            minRequired: minConfidenceForExecution,
            action: signal.action
          });
          continue;
        }
        
        this.logger.info('Signal passed execution thresholds', {
          symbol: signal.symbol,
          strategy: signal.strategy,
          strength: signal.strength,
          confidence: signal.confidence,
          action: signal.action
        });
        
        // Check if we have an existing position on this symbol
        const existingPosition = this.positionManager.getPositionBySymbol(signal.symbol);
        
        // Handle signals for existing positions
        if (existingPosition && signal.hasPosition) {
          // Close signal
          if (signal.action === 'close') {
            this.logger.info('Closing position based on signal', {
              position: existingPosition.id,
              pnl: existingPosition.pnl,
              strategy: signal.strategy
            });
            await this.closePosition(existingPosition, `Signal Close: ${signal.strategy}`);
            await this.database.markSignalExecuted(signal.id);
            continue;
          }
          
          // Check for reversal signal
          const isReversal = 
            (signal.action === 'buy' && existingPosition.side === 'short') ||
            (signal.action === 'sell' && existingPosition.side === 'long');
            
          if (isReversal && signal.strength >= 0.7) { // Higher threshold for reversals
            this.logger.info('Reversing position based on strong signal', {
              position: existingPosition.id,
              currentSide: existingPosition.side,
              newSide: signal.action === 'buy' ? 'long' : 'short',
              signalStrength: signal.strength
            });
            
            // Close current position
            await this.closePosition(existingPosition, `Signal Reversal: ${signal.strategy}`);
            
            // Open new position in opposite direction
            await this.openPosition(signal, signal.action === 'buy' ? 'long' : 'short');
            await this.database.markSignalExecuted(signal.id);
            continue;
          }
          
          // Skip signals in same direction as existing position
          this.logger.debug('Signal in same direction as existing position', {
            symbol: signal.symbol,
            positionSide: existingPosition.side,
            signalAction: signal.action
          });
          continue;
        }
        
        // Handle new position signals (no existing position)
        if (!existingPosition) {
          if (signal.action === 'buy') {
            // Open LONG position
            await this.openPosition(signal, 'long');
            await this.database.markSignalExecuted(signal.id);
          } else if (signal.action === 'sell') {
            // Open SHORT position (futures trading)
            await this.openPosition(signal, 'short');
            await this.database.markSignalExecuted(signal.id);
          }
        }
      } catch (error) {
        this.logger.error('Failed to execute signal', { signal, error });
      }
    }
  }
  
  private async openPosition(signal: Signal, side: 'long' | 'short'): Promise<void> {
    const accountInfo = this.positionManager.getAccountInfo();
    
    // Check position limit
    if (accountInfo.positions.length >= config.trading.maxPositions) {
      this.logger.warn('Position limit reached', {
        current: accountInfo.positions.length,
        limit: config.trading.maxPositions
      });
      return;
    }
    
    // Check available capital
    if (accountInfo.availableBalance <= 0) {
      this.logger.warn('Insufficient available balance', {
        availableBalance: accountInfo.availableBalance,
        marginUsed: accountInfo.marginBalance
      });
      return;
    }
    
    const marketData = this.marketDataCache.get(signal.symbol);
    
    if (!marketData || marketData.length === 0) {
      this.logger.warn('No market data available', { symbol: signal.symbol });
      return;
    }
    
    const currentPrice = marketData[marketData.length - 1].close;
    
    // Calculate position size based on risk (futures formula)
    // Use total balance if available balance is negative (positions are using margin)
    const balanceForRisk = accountInfo.availableBalance > 0 
      ? accountInfo.availableBalance 
      : accountInfo.totalBalance;
      
    const riskAmount = balanceForRisk * config.risk.maxRiskPerTrade;
    const stopLossPercent = side === 'long' 
      ? (currentPrice - (signal.suggestedStopLoss || currentPrice * 0.98)) / currentPrice
      : ((signal.suggestedStopLoss || currentPrice * 1.02) - currentPrice) / currentPrice;
    
    // Position Size (in USD) = Risk Amount / Stop Loss %
    const positionValueUSD = Math.abs(stopLossPercent) > 0.001 
      ? riskAmount / Math.abs(stopLossPercent)
      : 0;
    
    // Apply position limits (max 50% of total balance, not available)
    const maxPositionValue = accountInfo.totalBalance * 0.5;
    const finalPositionValue = Math.min(positionValueUSD, maxPositionValue);
    
    // Convert to BTC/ETH units
    const size = finalPositionValue / currentPrice;
    
    const positionSizeResult = {
      canTrade: size >= config.trading.minOrderSize && finalPositionValue > 0,
      size: size
    };
    
    this.logger.info('Position sizing', {
      symbol: signal.symbol,
      side,
      currentPrice,
      riskAmount,
      stopLossPercent: Math.abs(stopLossPercent) * 100,
      positionValueUSD,
      finalPositionValue,
      calculatedSize: size,
      canTrade: positionSizeResult.canTrade
    });
    
    if (!positionSizeResult.canTrade) {
      this.logger.warn('Cannot open position', positionSizeResult);
      return;
    }
    
    // Create position
    const orderId = `order-${Date.now()}`;
    const position = this.positionManager.openPosition(
      orderId,
      signal.symbol,
      side,
      currentPrice,
      positionSizeResult.size,
      signal.suggestedStopLoss,
      signal.suggestedTakeProfit
    );
    
    // Execute trade (both paper and live modes)
    try {
      const order = await this.exchange.placeOrder(
        signal.symbol,
        'market',
        side === 'long' ? 'buy' : 'sell',
        positionSizeResult.size,
        currentPrice
      );
      
      this.logger.info('Position opened', { 
        mode: config.trading.mode,
        position: {
          id: position.id,
          symbol: position.symbol,
          side: position.side,
          entry: position.entryPrice,
          size: position.quantity,
          value: position.value
        },
        order,
        signal: {
          strategy: signal.strategy,
          strength: signal.strength,
          confidence: signal.confidence
        }
      });
    } catch (error) {
      this.logger.error('Failed to execute order', error);
      this.positionManager.closePosition(position.id, currentPrice);
      return;
    }
    
    // Save opening trade to database
    const openTrade = {
      id: `${position.id}-open`,
      symbol: position.symbol,
      type: 'open' as const,
      side: (side === 'long' ? 'buy' : 'sell') as 'buy' | 'sell',
      price: currentPrice,
      quantity: position.quantity,
      timestamp: new Date(),
      signalId: signal.id
    };
    
    await this.database.saveTrade(openTrade);
    await this.database.updatePosition(position);
    
    // Emit trade event
    this.emit('trade', openTrade);
    
    this.logger.info('Position opened', position);
  }
  
  private async closePosition(position: Position, reason?: string): Promise<void> {
    const marketData = this.marketDataCache.get(position.symbol);
    const currentPrice = marketData?.[marketData.length - 1]?.close || position.currentPrice;
    
    // Release allocated capital
    const positionMargin = position.value / config.trading.leverage;
    this.allocatedCapital = Math.max(0, this.allocatedCapital - positionMargin);
    
    // Close position in manager
    const closedPosition = this.positionManager.closePosition(position.id, currentPrice);
    
    if (!closedPosition) {
      this.logger.error('Failed to close position', { id: position.id });
      return;
    }
    
    // Execute trade (both paper and live modes)
    try {
      const order = await this.exchange.simulateOrder(
        position.symbol,
        'market',
        position.side === 'long' ? 'sell' : 'buy', // Properly close based on position side
        position.quantity,
        currentPrice
      );
      
      this.logger.info('Position closed', { 
        mode: config.trading.mode,
        position: closedPosition,
        order,
        reason
      });
    } catch (error) {
      this.logger.error('Failed to execute close order', error);
    }
    
    // Update position in database
    await this.database.closePosition(position.id, closedPosition.pnl);
    
    // Save trade
    const trade = {
      id: `${position.id}-close`,
      symbol: position.symbol,
      type: 'close' as const,
      side: (position.side === 'long' ? 'sell' : 'buy') as 'sell' | 'buy', // Correct side for closing
      price: currentPrice,
      quantity: position.quantity,
      pnl: closedPosition.pnl,
      timestamp: new Date()
    };
    
    await this.database.saveTrade(trade);
    this.tradeHistory.push(trade);
    
    // Emit trade event
    this.emit('trade', trade);
    
    this.logger.info('Position closed', {
      position: closedPosition,
      reason,
      pnl: closedPosition.pnl
    });
  }
  
  private async saveSignalOutput(output: SignalOutput): Promise<void> {
    try {
      const timestamp = new Date().toISOString();
      const filename = `signals_${timestamp}.json`;
      const filepath = path.join(process.cwd(), 'output', filename);
      
      await fs.writeFile(filepath, JSON.stringify(output, null, 2));
      
      // Also save to a fixed filename for easy access
      const latestPath = path.join(process.cwd(), 'output', 'signals.json');
      await fs.writeFile(latestPath, JSON.stringify(output, null, 2));
      
      this.logger.debug('Saved signal output', { filename });
    } catch (error) {
      this.logger.error('Failed to save signal output', error);
    }
  }
  
  private emitStatus(): void {
    const accountInfo = this.positionManager.getAccountInfo();
    const stats = this.positionManager.getStats();
    
    this.emit('statusUpdate', {
      isRunning: this.isRunning,
      mode: config.trading.mode,
      balance: accountInfo.totalBalance,
      positions: accountInfo.positions.length,
      totalTrades: stats.totalTrades,
      winRate: stats.winRate,
      pnl: stats.totalPnl,
      availableBalance: accountInfo.availableBalance,
      marginUsed: accountInfo.marginBalance,
      unrealizedPnL: accountInfo.unrealizedPnL,
      realizedPnL: accountInfo.realizedPnL
    });
  }
  
  // Public methods for API access
  getStatus() {
    const accountInfo = this.positionManager.getAccountInfo();
    const stats = this.positionManager.getStats();
    
    return {
      isRunning: this.isRunning,
      mode: config.trading.mode,
      balance: accountInfo.totalBalance,
      positions: accountInfo.positions.length,
      totalTrades: stats.totalTrades,
      winRate: stats.winRate,
      pnl: stats.totalPnl,
      availableBalance: accountInfo.availableBalance,
      marginUsed: accountInfo.marginBalance,
      unrealizedPnL: accountInfo.unrealizedPnL,
      realizedPnL: accountInfo.realizedPnL
    };
  }
  
  getTrades() {
    return this.tradeHistory.slice(-100); // Last 100 trades
  }
  
  getPositions() {
    return this.positionManager.getOpenPositions();
  }
  
  getSignals() {
    return this.lastSignalOutput?.signals || [];
  }
  
  getMarketData(): Array<{ symbol: string; price: number; bid: number; ask: number; spread: number; volume24h: number }> {
    const marketData: Array<{ symbol: string; price: number; bid: number; ask: number; spread: number; volume24h: number }> = [];
    
    for (const [symbol, data] of this.marketDataCache.entries()) {
      if (data.length > 0) {
        const latest = data[data.length - 1];
        const volume24h = data.slice(-1440).reduce((sum, d) => sum + d.volume, 0); // 24h at 1m candles
        
        marketData.push({
          symbol,
          price: latest.close,
          bid: latest.bid,
          ask: latest.ask,
          spread: latest.spread,
          volume24h
        });
      }
    }
    
    return marketData;
  }
  
  updateBalance(newBalance: number): void {
    if (this.positionManager) {
      this.positionManager.updateBalance(newBalance);
      this.logger.info('Balance updated', { newBalance });
    }
  }
  
  async reinitializeStrategies(): Promise<void> {
    this.logger.info('Reinitializing strategies with updated configurations');
    await this.signalGenerator.initialize();
  }
  
  private async loadExistingPositions(): Promise<void> {
    try {
      const positions = await this.database.getOpenPositions();
      
      for (const pos of positions) {
        // Restore position in position manager
        this.positionManager.restorePosition({
          id: pos.id,
          symbol: pos.symbol,
          side: pos.side as 'long' | 'short',
          entryPrice: pos.entryPrice,
          currentPrice: pos.currentPrice,
          quantity: pos.quantity,
          value: pos.quantity * pos.entryPrice,
          pnl: pos.unrealizedPnL || 0,
          pnlPercent: ((pos.unrealizedPnL || 0) / (pos.quantity * pos.entryPrice)) * 100,
          stopLoss: pos.stopLoss,
          takeProfit: pos.takeProfit,
          openTime: pos.openTime,
          leverage: pos.leverage || 1
        });
        
        // Track allocated capital
        const positionMargin = (pos.quantity * pos.entryPrice) / config.trading.leverage;
        this.allocatedCapital += positionMargin;
      }
      
      this.logger.info('Loaded existing positions', { 
        count: positions.length,
        allocatedCapital: this.allocatedCapital 
      });
    } catch (error) {
      this.logger.error('Failed to load existing positions', error);
    }
  }
  
  setUserId(userId: string): void {
    this.userId = userId;
    this.database.setUserId(userId);
  }
  
  setSimulationId(simulationId: string): void {
    this.simulationId = simulationId;
    this.database.setSimulationId(simulationId);
  }
}

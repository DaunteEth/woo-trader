import { Signal, MarketData, Position } from './types/trading';
import { BaseStrategy } from './strategies/BaseStrategy';
import { ScalpingStrategyEnhanced } from './strategies/ScalpingStrategyEnhanced';
import { MomentumStrategyEnhanced } from './strategies/MomentumStrategyEnhanced';
import { ArbitrageStrategy } from './strategies/ArbitrageStrategy';
import { FundingArbitrageStrategy } from './strategies/FundingArbitrageStrategy';
import { OrderBookArbitrageStrategy } from './strategies/OrderBookArbitrageStrategy';
import { createLogger } from './utils/logger';
import { config } from './utils/config';
import { TrendContext } from './indicators/TrendAnalyzer';
import { loadStrategyConfigs } from './utils/strategyLoader';
import { AIService } from './services/AIService';
import { EntryExitManager } from './managers/EntryExitManager';
import { StrategyConfig } from './types/config';
import { WooXClient } from './exchange/WooXClient';

export interface SignalOutput {
  timestamp: string;
  signals: Signal[];
  marketConditions: {
    symbol: string;
    price: number;
    bid: number;
    ask: number;
    spread: number;
    volume24h: number;
    volatility: number;
  }[];
  activePositions: {
    symbol: string;
    side: string;
    entry: number;
    current: number;
    pnl: number;
    pnlPercent: number;
    age: number; // minutes
  }[];
  riskMetrics: {
    totalExposure: number;
    availableBalance: number;
    dailyPnL: number;
    openPositions: number;
  };
}

export class SignalGenerator {
  private strategies: BaseStrategy[] = [];
  private strategyConfigs: Map<string, StrategyConfig> = new Map();
  private logger = createLogger('SignalGenerator');
  private signalHistory: Signal[] = [];
  private simulationId?: string;
  private aiService?: AIService;
  private entryExitManager: EntryExitManager;
  private exchange: WooXClient | null = null;
  
  constructor(simulationId?: string, exchange?: WooXClient) {
    this.simulationId = simulationId;
    this.entryExitManager = new EntryExitManager();
    this.exchange = exchange || null;
    
    // Initialize AI service based on environment configuration
    const openaiKey = process.env.OPENAI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    
    if (openrouterKey && openrouterKey.startsWith('sk-or-')) {
      // Prefer OpenRouter with GPT-5-Nano for tool calling support
      const aiModel = process.env.AI_MODEL || 'openai/gpt-5-nano';
      this.aiService = new AIService({
        apiKey: openrouterKey,
        provider: 'openrouter',
        model: aiModel,
        maxLatency: 100, // 100ms max for HFT
        useLocalFallback: true,
        confidenceThreshold: 0.7
      });
      this.logger.info(`AI service initialized with ${aiModel} via OpenRouter`);
    } else if (openaiKey && openaiKey.startsWith('sk-')) {
      // Fallback to OpenAI
      this.aiService = new AIService({
        apiKey: openaiKey,
        provider: 'openai',
        model: 'gpt-4o',
        maxLatency: 100, // 100ms max for HFT
        useLocalFallback: true,
        confidenceThreshold: 0.7
      });
      this.logger.info('AI service initialized with GPT-4o');
    } else {
      this.logger.warn('AI service not initialized - no valid API key available');
    }
  }
  
  async initialize(): Promise<void> {
    try {
      // Load strategy configurations from database
      const strategyConfigs = await loadStrategyConfigs(this.simulationId);
      
      // Clear existing strategies and configs
      this.strategies = [];
      this.strategyConfigs.clear();
      
      // Create strategy instances based on database configurations
      for (const config of strategyConfigs) {
        if (!config.enabled) continue;
        
        // Store the configuration
        this.strategyConfigs.set(config.name, config as StrategyConfig);
        
        let strategy: BaseStrategy | null = null;
        
        switch (config.name) {
          case 'Scalping':
            const scalpingParams = {
              emaPeriodFast: config.emaPeriodFast ?? 9,
              emaPeriodSlow: config.emaPeriodSlow ?? 21,
              rsiPeriod: config.rsiPeriod ?? 7,
              rsiOverbought: config.rsiOverbought ?? 70,
              rsiOversold: config.rsiOversold ?? 30,
              bbPeriod: config.bbPeriod ?? 20,
              bbStdDev: config.bbStdDev ?? 2,
              minSpread: config.minSpread ?? 0.0001,
              maxSpread: config.maxSpread ?? 0.001,
              stopLossPercent: config.stopLossPercent ?? 0.003,
              takeProfitPercent: config.takeProfitPercent ?? 0.006
            };
            strategy = new ScalpingStrategyEnhanced();
            if (strategy) {
              strategy.updateParams(scalpingParams);
            }
            break;
            
          case 'Momentum':
            const momentumParams = {
              vwapEnabled: config.vwapEnabled ?? true,
              bbBreakoutStdDev: config.bbBreakoutStdDev ?? 2,
              momentumPeriod: config.momentumPeriod ?? 10,
              volumeMultiplier: config.volumeMultiplier ?? 1.5,
              rsiPeriod: config.rsiPeriod ?? 14,
              rsiMomentumThreshold: config.rsiMomentumThreshold ?? 60,
              stopLossPercent: config.stopLossPercent ?? 0.004,
              takeProfitPercent: config.takeProfitPercent ?? 0.008,
              trailingStopPercent: config.trailingStopPercent ?? 0.003
            };
            strategy = new MomentumStrategyEnhanced();
            if (strategy) {
              strategy.updateParams(momentumParams);
            }
            break;
            
          case 'Arbitrage':
            const arbitrageParams = {
              minSpreadPercent: config.minSpreadPercent ?? 0.1,
              maxSpreadPercent: config.maxSpreadPercent ?? 2.0,
              executionDelay: config.executionDelay ?? 100,
              feePercent: config.feePercent ?? 0.075,
              minProfitPercent: config.minProfitPercent ?? 0.05,
              stopLossPercent: config.stopLossPercent ?? 0.002,
              takeProfitPercent: config.takeProfitPercent ?? 0.004
            };
            strategy = new ArbitrageStrategy();
            strategy.updateParams(arbitrageParams);
            break;
            
          case 'FundingArbitrage':
            const fundingParams = {
              minFundingRate: config.minFundingRate ?? 0.01,
              fundingThreshold: config.fundingThreshold ?? 0.03,
              hoursBeforeFunding: config.hoursBeforeFunding ?? 1,
              maxPositionHoldTime: config.maxPositionHoldTime ?? 28800000,
              minProfitPercent: config.minProfitPercent ?? 0.02,
              spotFeePercent: config.spotFeePercent ?? 0.1,
              perpFeePercent: config.perpFeePercent ?? 0.05,
              stopLossPercent: config.stopLossPercent ?? 0.003,
              takeProfitPercent: config.takeProfitPercent ?? 0.006
            };
            strategy = new FundingArbitrageStrategy();
            if (strategy) {
              strategy.updateParams(fundingParams);
              // Pass exchange instance if available
              if (this.exchange && 'setExchange' in strategy) {
                (strategy as FundingArbitrageStrategy).setExchange(this.exchange);
              }
            }
            break;
            
          case 'OrderBookArbitrage':
            const orderBookParams = {
              minImbalanceRatio: config.minImbalance ?? 2.0,
              depthLevels: config.depthLevels ?? 10,
              minSpreadBps: config.minSpreadBps ?? 5,
              maxSpreadBps: config.maxSpreadBps ?? 50,
              minVolumeImbalance: config.minVolumeRatio ?? 10000,
              stopLossPercent: config.stopLossPercent ?? 0.002,
              takeProfitPercent: config.takeProfitPercent ?? 0.004,
              confidenceThreshold: config.confidenceThreshold ?? 0.7
            };
            strategy = new OrderBookArbitrageStrategy();
            if (strategy) {
              strategy.updateParams(orderBookParams);
            }
            break;
        }
        
        if (strategy) {
          strategy.setWeight(config.weight);
          if (config.enabled) {
            strategy.enable();
          } else {
            strategy.disable();
          }
          this.strategies.push(strategy);
        }
      }
    
    this.logger.info('Signal generator initialized with strategies', {
        strategies: this.strategies.map(s => ({
          name: s.getName(),
          enabled: s.isEnabled(),
          weight: s.getWeight()
        }))
      });
      
    } catch (error) {
      this.logger.error('Failed to initialize strategies', error);
      // Fall back to default configuration
      this.initializeDefaultStrategies();
    }
  }
  
  private initializeDefaultStrategies(): void {
    // Initialize strategies based on config file as fallback
    this.strategies = [];
    
    // Find each strategy config and create with proper weight
    const scalpingConfig = config.strategies.find(s => s.name === 'Scalping');
    if (scalpingConfig && scalpingConfig.enabled) {
      const strategy = new ScalpingStrategyEnhanced();
      strategy.setWeight(scalpingConfig.weight);
      this.strategies.push(strategy);
    }
    
    const momentumConfig = config.strategies.find(s => s.name === 'Momentum');
    if (momentumConfig && momentumConfig.enabled) {
      const strategy = new MomentumStrategyEnhanced();
      strategy.setWeight(momentumConfig.weight);
      this.strategies.push(strategy);
    }
    
    const arbitrageConfig = config.strategies.find(s => s.name === 'Arbitrage');
    if (arbitrageConfig && arbitrageConfig.enabled) {
      const strategy = new ArbitrageStrategy();
      strategy.setWeight(arbitrageConfig.weight);
      this.strategies.push(strategy);
    }
  }
  
  async generateSignals(
    marketDataMap: Map<string, MarketData[]>,
    positions: Position[],
    availableBalance: number,
    trendContextMap?: Map<string, TrendContext>
  ): Promise<SignalOutput> {
    // Initialize strategies if not already done
    if (this.strategies.length === 0) {
      await this.initialize();
    }
    
    const allSignals: Signal[] = [];
    const marketConditions: SignalOutput['marketConditions'] = [];
    
    // Analyze each symbol
    for (const [symbol, marketData] of marketDataMap.entries()) {
      if (marketData.length === 0) continue;
      
      const latest = marketData[marketData.length - 1];
      
      // Calculate market conditions
      const volatility = this.calculateVolatility(marketData);
      const volume24h = marketData.slice(-1440).reduce((sum, d) => sum + d.volume, 0); // 24h at 1m candles
      
      marketConditions.push({
        symbol,
        price: latest.close,
        bid: latest.bid,
        ask: latest.ask,
        spread: latest.spread,
        volume24h,
        volatility
      });
      
      // Get signals from each strategy
      for (const strategy of this.strategies) {
        if (!strategy.isEnabled()) continue;
        
        try {
          const trendContext = trendContextMap?.get(symbol);
          const signal = await strategy.analyze(marketData, positions, trendContext);
          if (signal) {
            // Add metadata
            signal.positionSize = this.calculatePositionSize(
              signal,
              availableBalance,
              positions.length,
              allSignals.length // Include pending signals in calculation
            );
            
            allSignals.push(signal);
          }
        } catch (error) {
          this.logger.error('Strategy failed', {
            strategy: strategy.getName(),
            error
          });
        }
      }
    }
    
    // Log all signals before filtering
    this.logger.info('All signals generated', {
      count: allSignals.length,
      signals: allSignals.map(s => ({
        symbol: s.symbol,
        strategy: s.strategy,
        action: s.action,
        confidence: s.confidence
      }))
    });
    
    // Filter and rank signals
    const filteredSignals = this.filterSignals(allSignals, positions, marketDataMap);
    
    // Log filtered signals
    this.logger.info('Signals after filtering', {
      count: filteredSignals.length,
      filtered: allSignals.length - filteredSignals.length
    });
    
    // AI enhancement for filtered signals - temporarily disabled for efficiency
    // Only use AI for autonomous execution, not for signal enhancement
    const enhancedSignals = filteredSignals; // await this.enhanceSignalsWithAI(filteredSignals, marketDataMap);
    
    const rankedSignals = this.rankSignals(enhancedSignals);
    
    // Add filtered signals to history (only after they pass all filters)
    rankedSignals.forEach(signal => {
      this.signalHistory.push(signal);
    });
    
    // Prepare output
    const output: SignalOutput = {
      timestamp: new Date().toISOString(),
      signals: rankedSignals,
      marketConditions,
      activePositions: positions.map(p => ({
        id: p.id,
        symbol: p.symbol,
        side: p.side,
        entry: p.entryPrice,
        current: p.currentPrice,
        pnl: p.pnl,
        pnlPercent: p.pnlPercent,
        age: Math.floor((Date.now() - p.openTime.getTime()) / 1000 / 60)
      })),
      riskMetrics: {
        totalExposure: positions.reduce((sum, p) => sum + p.value, 0),
        availableBalance: availableBalance - positions.reduce((sum, p) => sum + p.value, 0),
        dailyPnL: this.calculateDailyPnL(),
        openPositions: positions.length
      }
    };
    
    this.logger.info('Signals generated', {
      totalSignals: allSignals.length,
      filteredSignals: rankedSignals.length,
      positions: positions.length
    });
    
    return output;
  }
  
  private calculateVolatility(marketData: MarketData[]): number {
    if (marketData.length < 20) return 0;
    
    const returns = [];
    for (let i = 1; i < marketData.length; i++) {
      const ret = (marketData[i].close - marketData[i - 1].close) / marketData[i - 1].close;
      returns.push(ret);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * Math.sqrt(1440) * 100; // Annualized volatility %
  }
  
  private calculatePositionSize(
    signal: Signal,
    availableBalance: number,
    openPositions: number,
    pendingSignals: number
  ): number {
    // Calculate remaining available balance after pending allocations
    const totalPendingPositions = openPositions + pendingSignals;
    const remainingSlots = Math.max(1, config.trading.maxPositions - totalPendingPositions);
    const allocatableBalance = availableBalance / remainingSlots;
    
    // Base size: 2% of allocatable balance per trade
    let baseSize = Math.min(allocatableBalance, availableBalance * 0.02);
    
    // Adjust for signal strength
    baseSize *= signal.strength;
    
    // Adjust for confidence
    baseSize *= signal.confidence;
    
    // Reduce size if multiple positions open
    if (openPositions > 0) {
      baseSize *= (1 - openPositions * 0.2); // 20% reduction per open position
    }
    
    // Minimum size check
    baseSize = Math.max(10, baseSize); // $10 minimum
    
    return Math.round(baseSize * 100) / 100;
  }
  
  private filterSignals(signals: Signal[], positions: Position[], marketDataMap?: Map<string, MarketData[]>): Signal[] {
    // Clean up old signals from history (keep only last 5 minutes)
    this.signalHistory = this.signalHistory.filter(s => 
      Date.now() - s.timestamp.getTime() < 300000 // 5 minutes
    );
    
    return signals.filter(signal => {
      // IMPORTANT: We should NOT filter out signals for symbols with existing positions
      // We need those signals to manage positions (close, adjust SL/TP, etc.)
      // The position management logic should handle whether to act on the signal
      
      // Check for existing position to add context to signal
      const existingPosition = positions.find(p => p.symbol === signal.symbol);
      if (existingPosition) {
        // Add position context to signal for better decision making
        signal.hasPosition = true;
        signal.positionSide = existingPosition.side;
        signal.positionPnL = existingPosition.pnl;
        
        // Log for monitoring but don't filter out
        this.logger.debug('Signal generated for symbol with position', {
          symbol: signal.symbol,
          existingSide: existingPosition.side,
          signalAction: signal.action,
          positionPnL: existingPosition.pnl
        });
      }
      
      // Validate entry with EntryExitManager if market data is available
      if (marketDataMap && marketDataMap.has(signal.symbol)) {
        const entryValidation = this.entryExitManager.validateEntry(signal, marketDataMap.get(signal.symbol)!);
        if (!entryValidation.isValid) {
          this.logger.info('Signal failed entry validation', {
            symbol: signal.symbol,
            reason: entryValidation.reason
          });
          return false;
        }
        
        // Update signal with improved entry if available
        if (entryValidation.improvedEntry) {
          signal.suggestedEntry = entryValidation.improvedEntry;
        }
      }
      
      // Check if this signal should be followed based on strategy configuration
      const strategyConfig = this.strategyConfigs.get(signal.strategy);
      if (strategyConfig) {
        // Check if we should follow signals from this strategy
        // Default to true if not set
        const followOwnSignals = strategyConfig.followOwnSignals ?? true;
        if (!followOwnSignals && !signal.indicators.aiEnhanced) {
          this.logger.debug('Signal filtered - strategy signals disabled', {
            symbol: signal.symbol,
            strategy: signal.strategy,
            followOwnSignals
          });
          return false;
        }
        
        // Check if we should follow AI-enhanced signals
        if (!strategyConfig.followAISignals && signal.indicators.aiEnhanced) {
          this.logger.debug('Signal filtered - AI signals disabled', {
            symbol: signal.symbol,
            strategy: signal.strategy
          });
          return false;
        }
      }
      
      // Only keep reasonable confidence signals
      if (signal.confidence < 0.01) {  // Lowered to allow more signals through
        this.logger.info('Low confidence signal filtered', { 
          symbol: signal.symbol,
          confidence: signal.confidence 
        });
        return false;
      }
      
      // Filter out duplicate signals from same strategy within 10 seconds (less than cycle time)
      const recentDuplicate = this.signalHistory.find(s => 
        s.symbol === signal.symbol &&
        s.action === signal.action &&
        s.strategy === signal.strategy &&
        Date.now() - s.timestamp.getTime() < 10000 // 10 seconds (allows signals every other cycle)
      );
      if (recentDuplicate) {
        this.logger.info('Duplicate signal filtered', { 
          symbol: signal.symbol,
          strategy: signal.strategy,
          timeSinceLast: Date.now() - recentDuplicate.timestamp.getTime()
        });
        return false;
      }
      
      // Filter out conflicting signals from last 30 seconds
      const recentSignals = this.signalHistory
        .filter(s => s.symbol === signal.symbol)
        .filter(s => Date.now() - s.timestamp.getTime() < 30000); // 30 seconds
      
      const hasConflict = recentSignals.some(s => {
        return (signal.action === 'buy' && s.action === 'sell') ||
               (signal.action === 'sell' && s.action === 'buy');
      });
      
      if (hasConflict) {
        this.logger.info('Conflicting signal filtered', { 
          symbol: signal.symbol,
          action: signal.action 
        });
        return false;
      }
      
      return true;
    });
  }
  
  private rankSignals(signals: Signal[]): Signal[] {
    // Sort by confidence and strength
    return signals.sort((a, b) => {
      const scoreA = a.confidence * a.strength;
      const scoreB = b.confidence * b.strength;
      return scoreB - scoreA;
    }).slice(0, 5); // Top 5 signals
  }
  
  private calculateDailyPnL(): number {
    // This would be calculated from actual trading history
    // For now, return 0
    return 0;
  }
  
  enableStrategy(name: string): void {
    const strategy = this.strategies.find(s => s.getName() === name);
    if (strategy) {
      strategy.enable();
      this.logger.info('Strategy enabled', { name });
    }
  }
  
  disableStrategy(name: string): void {
    const strategy = this.strategies.find(s => s.getName() === name);
    if (strategy) {
      strategy.disable();
      this.logger.info('Strategy disabled', { name });
    }
  }
  
  getStrategies(): string[] {
    return this.strategies.map(s => ({
      name: s.getName(),
      enabled: s.isEnabled(),
      weight: s.getWeight()
    }) as any);
  }
  
  /*
  private async optimizeSignalWithAI(
    signal: Signal,
    marketData: MarketData[]
  ): Promise<{ entry: number; stopLoss: number; takeProfit: number; confidence: number } | null> {
    if (!this.aiService) {
      return null;
    }
    
    try {
      // Use AI service to optimize entry/exit
      const optimized = await this.aiService.optimizeEntryExit(signal, marketData, []);
      return optimized;
    } catch (error) {
      this.logger.error('AI optimization failed', error);
      return null;
    }
  }
  */
  
  // Temporarily disabled - only using AI for autonomous execution
  /*
  private async enhanceSignalsWithAI(
    signals: Signal[],
    marketDataMap: Map<string, MarketData[]>
  ): Promise<Signal[]> {
    if (!this.aiService) {
      return signals;
    }
    
    const enhancedSignals = await Promise.all(
      signals.map(async (signal) => {
        try {
          const marketData = marketDataMap.get(signal.symbol);
          if (!marketData) return signal;
          
          // Get AI decision for this signal
          const context = {
            symbol: signal.symbol,
            currentPrice: marketData[marketData.length - 1].close,
            priceChange24h: 0, // Calculate if needed
            volume24h: marketData[marketData.length - 1].volume,
            volatility: this.calculateVolatilityFromAI(marketData),
            technicalIndicators: signal.indicators,
            recentSignals: this.signalHistory.filter(s => s.symbol === signal.symbol).slice(-5),
            openPositions: []
          };
          
          const aiDecision = await this.aiService?.getTradeDecision(context);
          
          if (aiDecision && aiDecision.confidence > signal.confidence) {
            // AI is more confident, enhance the signal
            if (aiDecision.suggestedEntry) signal.suggestedEntry = aiDecision.suggestedEntry;
            if (aiDecision.suggestedStopLoss) signal.suggestedStopLoss = aiDecision.suggestedStopLoss;
            if (aiDecision.suggestedTakeProfit) signal.suggestedTakeProfit = aiDecision.suggestedTakeProfit;
            
            // Blend confidence scores
            signal.confidence = (signal.confidence + aiDecision.confidence) / 2;
            signal.indicators.aiEnhanced = true;
            signal.indicators.aiReasoning = aiDecision.reasoning;
            
            this.logger.info('Signal enhanced by AI', {
              symbol: signal.symbol,
              originalConfidence: signal.confidence,
              aiConfidence: aiDecision.confidence,
              reasoning: aiDecision.reasoning
            });
          }
          
          // Optimize entry/exit points
          const optimized = await this.optimizeSignalWithAI(signal, marketData);
          if (optimized) {
            signal.suggestedEntry = optimized.entry;
            signal.suggestedStopLoss = optimized.stopLoss;
            signal.suggestedTakeProfit = optimized.takeProfit;
            signal.confidence = Math.max(signal.confidence, optimized.confidence);
          }
          
          return signal;
        } catch (error) {
          this.logger.error('Failed to enhance signal with AI', { symbol: signal.symbol, error });
          return signal;
        }
      })
    );
    
    return enhancedSignals;
  }
  
  private calculateVolatilityFromAI(marketData: MarketData[]): number {
    if (marketData.length < 2) return 0;
    
    const returns = [];
    for (let i = 1; i < marketData.length; i++) {
      const return_ = (marketData[i].close - marketData[i-1].close) / marketData[i-1].close;
      returns.push(return_);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Percentage volatility
  }
  */
  
  // Process signals for AI autonomous execution
  async processSignalsForAutonomousExecution(
    signals: Signal[],
    marketDataMap: Map<string, MarketData[]>,
    positions: Position[],
    balance: number
  ): Promise<{ signal: Signal; decision: any }[]> {
    if (!this.aiService) {
      return [];
    }
    
    const autonomousDecisions = [];
    
    for (const signal of signals) {
      const strategyConfig = this.strategyConfigs.get(signal.strategy);
      
      // Check if autonomous execution is enabled for this strategy
      if (!strategyConfig?.aiExecutionEnabled) {
        continue;
      }
      
      const marketData = marketDataMap.get(signal.symbol);
      if (!marketData) {
        continue;
      }
      
      try {
        const decision = await this.aiService.makeAutonomousDecision(
          signal,
          marketData,
          positions,
          balance
        );
        
        if (decision.shouldExecute) {
          this.logger.info('AI autonomous execution decision', {
            symbol: signal.symbol,
            action: decision.action,
            reasoning: decision.reasoning,
            originalSignal: signal.action,
            strategy: signal.strategy
          });
          
          autonomousDecisions.push({
            signal: decision.adjustedSignal || signal,
            decision
          });
        }
      } catch (error) {
        this.logger.error('Failed to get autonomous decision', {
          symbol: signal.symbol,
          error
        });
      }
    }
    
    return autonomousDecisions;
  }
}
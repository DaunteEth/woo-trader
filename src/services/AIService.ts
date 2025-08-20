import { createLogger } from '../utils/logger';
import { MarketData, Signal, Position } from '../types/trading';
import { TrendContext } from '../indicators/TrendAnalyzer';
import { TechnicalIndicators } from '../indicators/technical';

interface AIDecision {
  action: 'buy' | 'sell' | 'hold' | 'close';
  confidence: number;
  reasoning: string;
  riskScore: number;
  suggestedEntry?: number;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
  timeToExecute?: number; // milliseconds
}

interface MarketContext {
  symbol: string;
  currentPrice: number;
  priceChange24h: number;
  volume24h: number;
  volatility: number;
  trendContext?: TrendContext;
  technicalIndicators: Record<string, any>;
  recentSignals: Signal[];
  openPositions: Position[];
  orderBookImbalance?: number;
  microstructureFeatures?: Record<string, any>;
}

interface AIConfig {
  apiKey: string;
  model?: string;
  maxLatency?: number; // milliseconds
  useLocalFallback?: boolean;
  confidenceThreshold?: number;
  provider?: 'openai' | 'openrouter';
  baseURL?: string;
}

export class AIService {
  private logger = createLogger('AIService');
  private apiKey: string;
  private model: string;
  private maxLatency: number;
  private useLocalFallback: boolean;
  private cache: Map<string, { decision: AIDecision; timestamp: number }> = new Map();
  private cacheExpiry: number = 5000; // 5 seconds
  private provider: 'openai' | 'openrouter';
  private baseURL: string;
  
  constructor(config: AIConfig) {
    this.apiKey = config.apiKey;
    this.provider = config.provider || 'openai';
    
    // Configure model based on provider
    if (this.provider === 'openrouter') {
      // Use gpt-5-nano as primary for tool calling support
      this.model = config.model || 'openai/gpt-5-nano';
      this.baseURL = config.baseURL || 'https://openrouter.ai/api/v1';
    } else {
      this.model = config.model || 'gpt-4o'; // Use GPT-4o for OpenAI
      this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    }
    
    this.maxLatency = config.maxLatency || 100; // 100ms max
    this.useLocalFallback = config.useLocalFallback ?? true;
  }
  
  async getTradeDecision(context: MarketContext): Promise<AIDecision | null> {
    try {
      const startTime = Date.now();
      
      // Check cache first
      const cacheKey = `${context.symbol}-${context.currentPrice}`;
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.decision;
      }
      
      // Build enhanced prompt with HFT-specific features
      const prompt = this.buildEnhancedPrompt(context);
      
      // Try API call with timeout
      const decision = await Promise.race([
        this.callOpenAI(prompt),
        this.timeout(this.maxLatency)
      ]);
      
      if (!decision && this.useLocalFallback) {
        // Fallback to local rule-based decision
        return this.localDecision(context);
      }
      
      // Cache the decision
      if (decision) {
        this.cache.set(cacheKey, { decision, timestamp: Date.now() });
        
        // Add execution time
        decision.timeToExecute = Date.now() - startTime;
      }
      
      return decision;
    } catch (error) {
      this.logger.error('Failed to get AI decision', error);
      return this.useLocalFallback ? this.localDecision(context) : null;
    }
  }
  
  private buildEnhancedPrompt(context: MarketContext): string {
    // Enhanced prompt for HFT with microstructure features
    const microFeatures = context.microstructureFeatures || {};
    
    return `You are an AI agent for a high-frequency crypto trading system. Analyze microstructure and provide immediate decision.

MARKET MICROSTRUCTURE for ${context.symbol}:
Price: $${context.currentPrice} | Spread: ${microFeatures.spread || 'N/A'}
Bid Size: ${microFeatures.bidSize || 'N/A'} | Ask Size: ${microFeatures.askSize || 'N/A'}
Order Flow Imbalance: ${context.orderBookImbalance?.toFixed(3) || 'N/A'}
Trade Velocity: ${microFeatures.tradeVelocity || 'N/A'} trades/min

TECHNICAL STATE:
RSI: ${context.technicalIndicators.rsi || 'N/A'}
EMA Cross: ${context.technicalIndicators.emaCross || 'N/A'}
BB Position: ${context.technicalIndicators.bbPosition || 'N/A'}
Volume Surge: ${context.technicalIndicators.volumeSurge ? 'YES' : 'NO'}

RISK CONTEXT:
Open Positions: ${context.openPositions.length}/${context.openPositions.map(p => p.pnlPercent.toFixed(2) + '%').join(', ')}
Market Regime: ${context.trendContext?.tradingConditions || 'unknown'}

Provide ONLY a JSON response for HFT execution:
{"action": "buy|sell|hold|close", "confidence": 0.0-1.0, "reasoning": "max 30 chars", "riskScore": 0.0-1.0, "suggestedEntry": number, "suggestedStopLoss": number, "suggestedTakeProfit": number}`;
  }
  
  private async callOpenAI(prompt: string): Promise<AIDecision | null> {
    if (!this.apiKey || this.apiKey === 'your-openai-api-key') {
      return null;
    }
    
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      };
      
      // Add OpenRouter specific headers
      if (this.provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://freq-trading.com';
        headers['X-Title'] = 'HFT Trading Bot';
      }
      
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a high-frequency trading AI. Respond only with valid JSON.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.1, // Low temperature for consistency
          max_tokens: 150,
          response_format: { type: "json_object" }
        })
      });
      
      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }
      
      const data = await response.json() as any;
      
      // Log the response for debugging
      this.logger.debug('API Response', { 
        status: response.status,
        provider: this.provider,
        model: this.model,
        data: JSON.stringify(data).substring(0, 200)
      });
      
      // Handle potential error responses
      if (data.error) {
        throw new Error(`API Error: ${data.error.message || data.error}`);
      }
      
      // Extract content safely
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content in API response');
      }
      
      // Parse JSON safely
      try {
        return JSON.parse(content) as AIDecision;
      } catch (parseError) {
        this.logger.error('Failed to parse AI response', { content, parseError });
        // Return a default decision instead of failing
        return this.localDecision({
          symbol: prompt.includes('symbol') ? prompt.match(/"symbol":\s*"([^"]+)"/)?.[1] || 'UNKNOWN' : 'UNKNOWN',
          currentPrice: 0,
          priceChange24h: 0,
          volume24h: 0,
          volatility: 0,
          technicalIndicators: {} as any
        } as MarketContext);
      }
    } catch (error: any) {
      // Only log detailed errors in debug mode
      if (error.message?.includes('Unexpected end of JSON')) {
        this.logger.debug('AI API response format issue - using local fallback');
      } else {
        this.logger.error('AI API call failed', { 
          message: error.message,
          provider: this.provider,
          model: this.model 
        });
      }
      return null;
    }
  }
  
  private timeout(ms: number): Promise<null> {
    return new Promise(resolve => setTimeout(() => resolve(null), ms));
  }
  
  private localDecision(context: MarketContext): AIDecision {
    // Fast local rule-based fallback - more aggressive for autonomous execution
    const indicators = context.technicalIndicators;
    
    // Check for strong momentum signals
    if (indicators.rsi < 35) {
      return {
        action: 'buy',
        confidence: 0.75,
        reasoning: 'Oversold conditions detected',
        riskScore: 0.3,
        suggestedEntry: context.currentPrice,
        suggestedStopLoss: context.currentPrice * 0.998,
        suggestedTakeProfit: context.currentPrice * 1.004
      };
    }
    
    if (indicators.rsi > 65) {
      return {
        action: 'sell',
        confidence: 0.75,
        reasoning: 'Overbought conditions detected',
        riskScore: 0.3,
        suggestedEntry: context.currentPrice,
        suggestedStopLoss: context.currentPrice * 1.002,
        suggestedTakeProfit: context.currentPrice * 0.996
      };
    }
    
    // Check volume surge
    if (context.volume24h > 0 && context.microstructureFeatures) {
      const volumeRatio = context.microstructureFeatures.tradeVelocity || 1;
      if (volumeRatio > 1.5) {
        return {
          action: context.priceChange24h > 0 ? 'buy' : 'sell',
          confidence: 0.7,
          reasoning: 'High volume breakout',
          riskScore: 0.35,
          suggestedEntry: context.currentPrice,
          suggestedStopLoss: context.currentPrice * (context.priceChange24h > 0 ? 0.997 : 1.003),
          suggestedTakeProfit: context.currentPrice * (context.priceChange24h > 0 ? 1.006 : 0.994)
        };
      }
    }
    
    return {
      action: 'hold',
      confidence: 0.5,
      reasoning: 'No clear autonomous signal',
      riskScore: 0.5
    };
  }
  
  async optimizeEntryExit(
    signal: Signal,
    marketData: MarketData[],
    _positions: Position[]  // Prefixed with _ to indicate intentionally unused
  ): Promise<{
    entry: number;
    stopLoss: number;
    takeProfit: number;
    confidence: number;
  }> {
    const latest = marketData[marketData.length - 1];
    const closes = marketData.map(d => d.close);
    const highs = marketData.map(d => d.high);
    const lows = marketData.map(d => d.low);
    
    // Calculate ATR for dynamic stops
    const atr = TechnicalIndicators.atr(highs, lows, closes, 14);
    const currentATR = atr.length > 0 ? atr[atr.length - 1] : latest.close * 0.01;
    
    // Calculate support/resistance levels
    const recentHigh = Math.max(...highs.slice(-20));
    const recentLow = Math.min(...lows.slice(-20));
    
    // AI-optimized entry
    let optimizedEntry = signal.suggestedEntry || latest.close;
    
    if (signal.action === 'buy') {
      // Try to enter closer to support
      optimizedEntry = Math.min(optimizedEntry, latest.bid + (latest.ask - latest.bid) * 0.3);
      
      // Dynamic stop loss using ATR
      const stopLoss = optimizedEntry - (currentATR * 1.5);
      
      // Multiple take profit levels
      const tp1 = optimizedEntry + currentATR;
      const tp2 = optimizedEntry + (currentATR * 2);
      const tp3 = Math.min(recentHigh, optimizedEntry + (currentATR * 3));
      
      // Log multiple TP levels for advanced position management
      this.logger.debug('Multiple take profit levels', {
        tp1: tp1.toFixed(2),
        tp2: tp2.toFixed(2),
        tp3: tp3.toFixed(2)
      });
      
      return {
        entry: optimizedEntry,
        stopLoss: Math.max(recentLow, stopLoss),
        takeProfit: tp2, // Use middle target as primary
        confidence: this.calculateEntryConfidence(signal, marketData)
      };
    } else {
      // Short entry optimization
      optimizedEntry = Math.max(optimizedEntry, latest.ask - (latest.ask - latest.bid) * 0.3);
      
      const stopLoss = optimizedEntry + (currentATR * 1.5);
      const tp1 = optimizedEntry - currentATR;
      const tp2 = optimizedEntry - (currentATR * 2);
      const tp3 = Math.max(recentLow, optimizedEntry - (currentATR * 3));
      
      // Log multiple TP levels for short positions
      this.logger.debug('Short position take profit levels', {
        tp1: tp1.toFixed(2),
        tp2: tp2.toFixed(2),
        tp3: tp3.toFixed(2)
      });
      
      return {
        entry: optimizedEntry,
        stopLoss: Math.min(recentHigh, stopLoss),
        takeProfit: tp2,
        confidence: this.calculateEntryConfidence(signal, marketData)
      };
    }
  }
  
  private calculateEntryConfidence(signal: Signal, marketData: MarketData[]): number {
    // Multi-factor confidence scoring
    let confidence = signal.confidence;
    
    const latest = marketData[marketData.length - 1];
    const avgVolume = marketData.slice(-20).reduce((sum, d) => sum + d.volume, 0) / 20;
    
    // Volume confirmation
    if (latest.volume > avgVolume * 1.5) {
      confidence *= 1.1;
    }
    
    // Volatility adjustment
    const volatility = this.calculateVolatility(marketData);
    if (volatility < 2) {
      confidence *= 1.05; // Boost in low volatility
    } else if (volatility > 5) {
      confidence *= 0.9; // Reduce in high volatility
    }
    
    return Math.min(1, confidence);
  }
  
  private calculateVolatility(marketData: MarketData[]): number {
    const returns = [];
    for (let i = 1; i < marketData.length; i++) {
      returns.push((marketData[i].close - marketData[i-1].close) / marketData[i-1].close);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Percentage volatility
  }
  
  // Autonomous execution methods
  async makeAutonomousDecision(
    signal: Signal,
    marketData: MarketData[],
    positions: Position[],
    balance: number
  ): Promise<{
    shouldExecute: boolean;
    action: 'buy' | 'sell' | 'hold' | 'close';
    adjustedSignal?: Signal;
    reasoning: string;
  }> {
    const latest = marketData[marketData.length - 1];
    
    // Skip AI if confidence is already very high
    if (signal.confidence > 0.9) {
      return {
        shouldExecute: true,
        action: signal.action as 'buy' | 'sell',
        adjustedSignal: signal,
        reasoning: 'High confidence signal - direct execution'
      };
    }
    
    // Build comprehensive context for decision
    const context: MarketContext = {
      symbol: signal.symbol,
      currentPrice: latest.close,
      priceChange24h: this.calculate24hChange(marketData),
      volume24h: this.calculate24hVolume(marketData),
      volatility: this.calculateVolatility(marketData),
      technicalIndicators: signal.indicators,
      recentSignals: [],
      openPositions: positions.filter(p => p.symbol === signal.symbol),
      trendContext: signal.indicators.trendContext,
      orderBookImbalance: signal.indicators.orderBookImbalance,
      microstructureFeatures: {
        spread: latest.ask - latest.bid,
        bidSize: latest.bidSize,
        askSize: latest.askSize,
        tradeVelocity: this.calculateTradeVelocity(marketData)
      }
    };
    
    // For now, use local decision-making to avoid API issues
    const decision = this.localDecision(context);
    
    if (!decision) {
      return {
        shouldExecute: false,
        action: 'hold',
        reasoning: 'No AI decision available'
      };
    }
    
    // Risk checks for autonomous execution
    const riskChecks = this.performRiskChecks(signal, positions, balance);
    
    if (!riskChecks.passed) {
      return {
        shouldExecute: false,
        action: 'hold',
        reasoning: riskChecks.reason
      };
    }
    
    // Adjust signal based on AI recommendation
    const adjustedSignal = { ...signal };
    if (decision.suggestedEntry) adjustedSignal.suggestedEntry = decision.suggestedEntry;
    if (decision.suggestedStopLoss) adjustedSignal.suggestedStopLoss = decision.suggestedStopLoss;
    if (decision.suggestedTakeProfit) adjustedSignal.suggestedTakeProfit = decision.suggestedTakeProfit;
    
    // Make final execution decision
    const shouldExecute = decision.confidence >= 0.8 && 
                         decision.action !== 'hold' && 
                         riskChecks.passed;
    
    return {
      shouldExecute,
      action: decision.action as 'buy' | 'sell' | 'hold' | 'close',
      adjustedSignal,
      reasoning: decision.reasoning
    };
  }
  
  private performRiskChecks(
    signal: Signal,
    positions: Position[],
    balance: number
  ): { passed: boolean; reason: string } {
    // Check position limits
    const openPositions = positions.filter(p => p.symbol === signal.symbol);
    if (openPositions.length >= 3) {
      return { passed: false, reason: 'Max positions limit reached' };
    }
    
    // Check exposure
    const totalExposure = positions.reduce((sum, p) => sum + p.value, 0);
    const maxExposure = balance * 0.8; // 80% max exposure
    
    if (totalExposure >= maxExposure) {
      return { passed: false, reason: 'Max exposure limit reached' };
    }
    
    // Check drawdown
    const totalPnL = positions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    const drawdownPercent = (totalPnL / balance) * 100;
    
    if (drawdownPercent < -10) { // 10% max drawdown
      return { passed: false, reason: 'Max drawdown limit reached' };
    }
    
    return { passed: true, reason: 'All risk checks passed' };
  }
  
  private calculate24hChange(marketData: MarketData[]): number {
    if (marketData.length < 2) return 0;
    const first = marketData[Math.max(0, marketData.length - 288)]; // ~24h at 5min intervals
    const last = marketData[marketData.length - 1];
    return ((last.close - first.close) / first.close) * 100;
  }
  
  private calculate24hVolume(marketData: MarketData[]): number {
    const last24h = marketData.slice(-288); // ~24h at 5min intervals
    return last24h.reduce((sum, d) => sum + d.volume, 0);
  }
  
  private calculateTradeVelocity(marketData: MarketData[]): number {
    const recentData = marketData.slice(-12); // Last hour
    const totalVolume = recentData.reduce((sum, d) => sum + d.volume, 0);
    const avgVolume = totalVolume / recentData.length;
    const currentVolume = marketData[marketData.length - 1].volume;
    return currentVolume / avgVolume; // Ratio of current to average
  }
}

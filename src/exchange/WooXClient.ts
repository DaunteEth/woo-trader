import * as ccxt from 'ccxt';
import { MarketData, Order, OrderStatus } from '../types/trading';
import { config } from '../utils/config';
import { createLogger } from '../utils/logger';

export class WooXClient {
  private exchange: ccxt.Exchange;
  private logger = createLogger('WooXClient');
  
  private normalizeSymbol(symbol: string): string {
    // Convert internal symbols to CCXT WooX format
    // PERP_BTC_USDT -> BTC/USDT:USDT (USDT-margined swap)
    if (symbol.startsWith('PERP_')) {
      const pair = symbol.replace('PERP_', '');
      const [base, quote] = pair.split('_');
      return `${base}/${quote}:USDT`;
    }
    // SPOT_BTC_USDT -> BTC/USDT
    if (symbol.startsWith('SPOT_')) {
      const pair = symbol.replace('SPOT_', '').replace('_', '/');
      return pair;
    }
    // Fallback
    return symbol.includes('/') ? symbol : symbol.replace('_', '/');
  }
  
  constructor(apiKey: string, apiSecret: string, appId: string, testnet: boolean = true) {
    this.exchange = new ccxt.woo({
      apiKey,
      secret: apiSecret,
      options: {
        'x-api-key': appId,
        defaultType: testnet ? 'spot' : 'spot', // WooX uses same endpoint
      },
      enableRateLimit: true,
      rateLimit: 50, // 20 requests per second max
    });
  }
  
  async initialize(): Promise<void> {
    try {
      await this.exchange.loadMarkets();
      this.logger.info('Exchange initialized', {
        symbols: Object.keys(this.exchange.markets).length
      });
    } catch (error) {
      this.logger.error('Failed to initialize exchange', error);
      throw error;
    }
  }
  
  async fetchOHLCV(
    symbol: string, 
    timeframe: string = '1m', 
    limit: number = 100
  ): Promise<MarketData[]> {
    try {
      const ccxtSymbol = this.normalizeSymbol(symbol);
      const ohlcv = await this.exchange.fetchOHLCV(ccxtSymbol, timeframe, undefined, limit);
      
      return ohlcv.map((candle: any) => ({
        symbol,
        timestamp: new Date(candle[0]),
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5],
        bid: 0, // Will be filled by ticker
        ask: 0,
        spread: 0,
        bidSize: 0,
        askSize: 0
      }));
    } catch (error) {
      this.logger.error('Failed to fetch OHLCV', { symbol, error });
      throw error;
    }
  }
  
  async fetchTicker(symbol: string): Promise<{
    bid: number;
    ask: number;
    spread: number;
    last: number;
  }> {
    try {
      // WOO doesn't support fetchTicker, use orderbook instead
      const ccxtSymbol = this.normalizeSymbol(symbol);
      const orderBook = await this.exchange.fetchOrderBook(ccxtSymbol, 1);
      const bid = orderBook.bids.length > 0 ? Number(orderBook.bids[0][0]) : 0;
      const ask = orderBook.asks.length > 0 ? Number(orderBook.asks[0][0]) : 0;
      
      // Get last price from recent OHLCV
      const ohlcv = await this.exchange.fetchOHLCV(ccxtSymbol, '1m', undefined, 1);
      const last = ohlcv.length > 0 ? Number(ohlcv[0][4]) : 0; // close price
      
      return {
        bid,
        ask,
        spread: ask && bid ? ask - bid : 0,
        last
      };
    } catch (error) {
      this.logger.error('Failed to fetch ticker', { symbol, error });
      throw error;
    }
  }
  
  async fetchOrderBook(symbol: string, limit: number = 10): Promise<{
    bids: [number, number][];
    asks: [number, number][];
  }> {
    try {
      const ccxtSymbol = this.normalizeSymbol(symbol);
      const orderBook = await this.exchange.fetchOrderBook(ccxtSymbol, limit);
      return {
        bids: orderBook.bids.map((bid: any) => [bid[0], bid[1]]),
        asks: orderBook.asks.map((ask: any) => [ask[0], ask[1]])
      };
    } catch (error) {
      this.logger.error('Failed to fetch order book', { symbol, error });
      throw error;
    }
  }
  
  async fetchFundingRate(symbol: string): Promise<{
    rate: number;
    nextFundingTime: number;
    interval: number;
  }> {
    try {
      const ccxtSymbol = this.normalizeSymbol(symbol);
      const response = await this.exchange.fetchFundingRate(ccxtSymbol);
      return {
        rate: response.fundingRate || 0,
        nextFundingTime: response.fundingTimestamp || (Date.now() + 8 * 60 * 60 * 1000),
        interval: 8 // WooX uses 8-hour intervals
      };
    } catch (error) {
      this.logger.error('Failed to fetch funding rate', { symbol, error });
      // Return default values if API call fails
      return {
        rate: 0.0001, // Default 0.01%
        nextFundingTime: Date.now() + 8 * 60 * 60 * 1000,
        interval: 8
      };
    }
  }
  
  async fetchFundingRates(): Promise<Map<string, { rate: number; nextFundingTime: number; interval: number }>> {
    try {
      const fundingRates = new Map();
      const symbols = ['PERP_BTC_USDT', 'PERP_ETH_USDT']; // Add more as needed
      
      for (const symbol of symbols) {
        const rate = await this.fetchFundingRate(symbol);
        fundingRates.set(symbol, rate);
      }
      
      return fundingRates;
    } catch (error) {
      this.logger.error('Failed to fetch funding rates', error);
      return new Map();
    }
  }
  
  async getBalance(): Promise<{ [currency: string]: number }> {
    try {
      const balance = await this.exchange.fetchBalance();
      const result: { [currency: string]: number } = {};
      
      for (const [currency, info] of Object.entries(balance.info)) {
        if (typeof info === 'object' && info !== null && 'free' in info) {
          result[currency] = parseFloat(info.free as string);
        }
      }
      
      return result;
    } catch (error) {
      this.logger.error('Failed to fetch balance', error);
      throw error;
    }
  }
  
  // Paper trading simulation methods
  private paperBalance: { [currency: string]: number } = {
    USDT: 10000,
    BTC: 0,
    ETH: 0
  };
  
  private paperOrders: Map<string, Order> = new Map();
  
  async simulateOrder(
    symbol: string,
    type: 'market' | 'limit',
    side: 'buy' | 'sell',
    amount: number,
    price?: number
  ): Promise<Order> {
    const orderId = `paper-${Date.now()}`;
    const ticker = await this.fetchTicker(symbol);
    
    const executionPrice = type === 'market' 
      ? (side === 'buy' ? ticker.ask : ticker.bid)
      : (price || ticker.last);
    
    const order: Order = {
      id: orderId,
      symbol,
      side,
      type,
      quantity: amount,
      price: executionPrice,
      status: 'filled',
      filledQty: amount,
      avgPrice: executionPrice,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Update paper balance
    const [base, quote] = symbol.split('/');
    if (side === 'buy') {
      this.paperBalance[quote] -= amount * executionPrice;
      this.paperBalance[base] = (this.paperBalance[base] || 0) + amount;
    } else {
      this.paperBalance[base] -= amount;
      this.paperBalance[quote] = (this.paperBalance[quote] || 0) + amount * executionPrice;
    }
    
    this.paperOrders.set(orderId, order);
    
    this.logger.info('Paper order executed', {
      order: orderId,
      symbol,
      side,
      amount,
      price: executionPrice
    });
    
    return order;
  }
  
  getPaperBalance(): { [currency: string]: number } {
    return { ...this.paperBalance };
  }
  
  async placeOrder(
    symbol: string,
    type: 'market' | 'limit',
    side: 'buy' | 'sell',
    amount: number,
    price?: number
  ): Promise<Order> {
    if (config.trading.mode === 'paper') {
      return this.simulateOrder(symbol, type, side, amount, price);
    }
    const ccxtSymbol = this.normalizeSymbol(symbol);
    const order = await this.exchange.createOrder(ccxtSymbol, type, side, amount, price);
    // Map CCXT status to our OrderStatus
    let status: OrderStatus = 'pending';
    const raw = (order.status || '').toString().toLowerCase();
    if (raw === 'closed') status = 'filled';
    else if (raw === 'open') status = 'pending';
    else if (raw === 'canceled' || raw === 'cancelled') status = 'cancelled';
    else if (raw === 'expired') status = 'rejected';
    else if (raw === 'partial' || (order.filled && order.amount && order.filled < order.amount)) status = 'partial';

    return {
      id: String(order.id),
      symbol,
      side: order.side as 'buy' | 'sell',
      type: order.type as 'market' | 'limit',
      quantity: Number(order.amount),
      price: Number(order.price || order.average || 0),
      status,
      filledQty: Number(order.filled || 0),
      avgPrice: Number(order.average || order.price || 0),
      createdAt: new Date(order.timestamp || Date.now()),
      updatedAt: new Date()
    };
  }
}

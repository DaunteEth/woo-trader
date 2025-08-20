'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';

export interface Signal {
  id: string;
  timestamp: Date;
  symbol: string;
  action: string;
  strategy: string;
  strength: number;
  confidence: number;
  suggestedEntry?: number;
  suggestedStopLoss?: number;
  suggestedTakeProfit?: number;
  positionSize?: number;
  indicators?: any;
  executed: boolean; // Added to match schema
}

export interface Position {
  id: string;
  symbol: string;
  side: string;
  entry: number;
  current: number;
  pnl: number;
  pnlPercent: number;
  age: number; // Added missing age property
  leverage: number; // Added to match schema
  margin?: number; // Added to match schema
  stopLoss?: number; // Added to match schema
  takeProfit?: number; // Added to match schema
  openTime: Date; // Added to match schema
  closeTime?: Date; // Added to match schema
  closedPnL?: number; // Added to match schema
  unrealizedPnL?: number; // Added to match schema
  currentPrice?: number; // Added to match schema
}

export interface MarketCondition {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  spread: number;
  volume24h: number;
  volatility: number;
}

export interface TradingStatus {
  isRunning: boolean;
  mode: string;
  balance: number;
  positions: number;
  totalTrades: number;
  winRate: number;
  pnl: number;
  availableBalance?: number;
  marginUsed?: number;
  unrealizedPnL?: number;
  realizedPnL?: number;
}

export function useTradingData() {
  const { toast } = useToast();
  const [status, setStatus] = useState<TradingStatus | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [marketConditions, setMarketConditions] = useState<MarketCondition[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const fetchInitialData = useCallback(async () => {
    try {
      // Fetch status from HFT bot backend
      const statusRes = await apiRequest('/api/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
      }

      // Fetch recent trades from database via Next.js API
      const tradesRes = await fetch('/api/trading/trades?limit=100');
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        const dbTrades = tradesData.trades || [];
        
        // Merge with existing trades, avoiding duplicates
        setTrades(prev => {
          const existingIds = new Set(prev.map(t => t.id));
          const newTrades = dbTrades.filter((t: any) => !existingIds.has(t.id));
          return [...dbTrades, ...prev.filter(t => !dbTrades.some((dt: any) => dt.id === t.id))];
        });
      }

      // Fetch open positions from database
      const positionsRes = await fetch('/api/trading/positions?type=open');
      if (positionsRes.ok) {
        const positionsData = await positionsRes.json();
        if (positionsData.positions) {
          const formattedPositions = positionsData.positions.map((p: any) => ({
            id: p.id,
            symbol: p.symbol,
            side: p.side,
            entry: p.entryPrice,
            current: p.currentPrice || p.entryPrice,
            pnl: p.unrealizedPnL || 0,
            pnlPercent: ((p.unrealizedPnL || 0) / (p.entryPrice * p.quantity)) * 100,
            age: Math.floor((Date.now() - new Date(p.openTime).getTime()) / 1000 / 60)
          }));
          setPositions(formattedPositions);
        }
      }
    } catch (error) {
      console.error('Failed to fetch initial data:', error);
    }
  }, []);

  useEffect(() => {
    const socket = getSocket();

    // Connection handlers
    socket.on('connect', () => {
      setIsConnected(true);
      fetchInitialData();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    // Data handlers
    socket.on('status', (data: TradingStatus) => {
      setStatus(data);
    });

    socket.on('signals', (data: any) => {
      if (data.signals) {
        setSignals(data.signals);
      }
      if (data.activePositions) {
        setPositions(data.activePositions);
      }
      if (data.marketConditions) {
        setMarketConditions(data.marketConditions);
      }
    });

    socket.on('trade', (trade: any) => {
      // Add new trade to the list, ensuring no duplicates
      setTrades(prev => {
        const exists = prev.some(t => t.id === trade.id);
        if (exists) return prev;
        
        const newTrades = [trade, ...prev];
        // Keep a reasonable limit to prevent memory issues
        return newTrades.slice(0, 500);
      });
      
      // Update positions if trade is closing a position
      if (trade.type === 'close') {
        setPositions(prev => prev.filter(p => p.id !== trade.positionId));
      }
      
      toast({
        title: trade.type === 'open' ? 'Position Opened' : 'Position Closed',
        description: `${trade.symbol} ${trade.side} at $${trade.price}${
          trade.pnl ? ` | P&L: $${trade.pnl.toFixed(2)}` : ''
        }`,
        variant: trade.pnl && trade.pnl > 0 ? 'default' : 'destructive',
      });
    });

    // Initial fetch
    fetchInitialData();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('status');
      socket.off('signals');
      socket.off('trade');
    };
  }, [fetchInitialData, toast]);

  const toggleBot = useCallback(async (userId?: string, simulationId?: string) => {
    try {
      const endpoint = status?.isRunning ? '/api/stop' : '/api/start';
      const body: any = {};
      if (userId) body.userId = userId;
      if (simulationId) body.simulationId = simulationId;
      
      const response = await apiRequest(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle bot');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to toggle bot',
        variant: 'destructive',
      });
    }
  }, [status, toast]);

  return {
    status,
    signals,
    positions,
    marketConditions,
    trades,
    isConnected,
    toggleBot,
  };
}

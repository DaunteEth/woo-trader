'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Clock } from 'lucide-react';

interface Transaction {
  id: string;
  timestamp: string;
  symbol: string;
  type: 'open' | 'close';
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  pnl?: number;
  status: string;
  signalId?: string;
  cumulativePnL?: number;
}

export function RecentTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
    
    // Refresh every 5 seconds
    const interval = setInterval(fetchTransactions, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await fetch('/api/trading/trades?limit=50');
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.trades || []);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
      return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) { // Less than 1 day
      return `${Math.floor(diff / 3600000)}h ago`;
    }
    return date.toLocaleDateString();
  };

  const getTypeIcon = (type: string, pnl?: number) => {
    if (type === 'open') {
      return <Clock className="h-4 w-4 text-blue-500" />;
    }
    if (pnl && pnl > 0) {
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    }
    return <TrendingDown className="h-4 w-4 text-red-500" />;
  };

  if (loading) {
    return (
      <Card className="border-green-900/20 bg-black">
        <CardHeader>
          <CardTitle className="text-white">Recent Transactions</CardTitle>
          <CardDescription className="text-gray-400">
            Loading transactions...
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-green-900/20 bg-black">
      <CardHeader>
        <CardTitle className="text-white">Recent Transactions</CardTitle>
        <CardDescription className="text-gray-400">
          Your latest trading activity across all sessions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {transactions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No transactions yet. Start trading to see activity here.
            </p>
          ) : (
            transactions.slice(0, 15).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {getTypeIcon(tx.type, tx.pnl)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{tx.symbol}</span>
                      <Badge 
                        variant={tx.type === 'open' ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {tx.type}
                      </Badge>
                      <Badge 
                        variant={tx.side === 'buy' ? 'default' : 'destructive'}
                        className="text-xs"
                      >
                        {tx.side}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-400">
                      ${tx.price.toFixed(2)} × {tx.quantity.toFixed(4)}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  {tx.pnl !== undefined && tx.pnl !== null ? (
                    <div>
                      <div className={cn(
                        "font-semibold",
                        tx.pnl >= 0 ? "text-green-500" : "text-red-500"
                      )}>
                        {tx.pnl >= 0 ? '+' : ''}{tx.pnl.toFixed(2)} USDT
                      </div>
                      {tx.cumulativePnL !== undefined && (
                        <div className="text-xs text-gray-500">
                          Total: ${tx.cumulativePnL.toFixed(2)}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-400">
                      ${(tx.price * tx.quantity).toFixed(2)}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">
                    {formatTime(tx.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

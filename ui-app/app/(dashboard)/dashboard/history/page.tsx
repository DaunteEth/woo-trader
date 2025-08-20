'use client';

import { useAuth } from '@/lib/client-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEffect, useState } from 'react';
import { ArrowUpIcon, ArrowDownIcon } from 'lucide-react';

interface Trade {
  id: string;
  simulationId: string;
  signalId?: string;
  timestamp: string;
  symbol: string;
  type: string; // open, close
  side: string; // buy, sell
  price: number;
  quantity: number;
  fee: number;
  pnl?: number;
  reason?: string;
  status: string;
  cumulativePnL?: number;
  signal?: {
    id: string;
    strategy: string;
    confidence: number;
  };
}

export default function HistoryPage() {
  useAuth(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTradeHistory();
  }, []);

  const fetchTradeHistory = async () => {
    try {
      const response = await fetch('/api/trading/trades?limit=200');
      const data = await response.json();
      setTrades(data.trades || []);
    } catch (error) {
      console.error('Failed to fetch trade history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Trade History</h1>
        <p className="text-gray-400 mt-2">Complete history of all executed trades</p>
      </div>

      <Card className="border-green-900/20 bg-black">
        <CardHeader>
          <CardTitle className="text-white">All Trades</CardTitle>
          <CardDescription className="text-gray-400">
            Detailed record of every trade execution
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-gray-500 text-center py-8">Loading trades...</p>
          ) : trades.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No trades yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-gray-800">
                    <th className="pb-2 text-gray-400">Time</th>
                    <th className="pb-2 text-gray-400">Symbol</th>
                    <th className="pb-2 text-gray-400">Type</th>
                    <th className="pb-2 text-gray-400">Side</th>
                    <th className="pb-2 text-gray-400">Price</th>
                    <th className="pb-2 text-gray-400">Quantity</th>
                    <th className="pb-2 text-gray-400">Strategy</th>
                    <th className="pb-2 text-gray-400">Reason</th>
                    <th className="pb-2 text-gray-400">P&L</th>
                    <th className="pb-2 text-gray-400">Cumulative P&L</th>
                    <th className="pb-2 text-gray-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {trades.map((trade, idx) => (
                    <tr key={trade.id || idx} className="hover:bg-gray-900 transition-colors">
                      <td className="py-2 text-sm text-gray-300">
                        {trade.timestamp ? new Date(trade.timestamp).toLocaleString() : 'N/A'}
                      </td>
                      <td className="py-2 text-white font-medium">{trade.symbol}</td>
                      <td className="py-2">
                        <Badge 
                          variant={trade.type === 'open' ? 'default' : 'secondary'}
                          className={trade.type === 'open' ? 'bg-blue-600' : 'bg-gray-600'}
                        >
                          {trade.type}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-1">
                          {trade.side === 'buy' ? (
                            <ArrowUpIcon className="h-3 w-3 text-green-500" />
                          ) : (
                            <ArrowDownIcon className="h-3 w-3 text-red-500" />
                          )}
                          <span className={trade.side === 'buy' ? 'text-green-500' : 'text-red-500'}>
                            {trade.side}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 text-gray-300">{trade.price ? formatCurrency(trade.price) : 'N/A'}</td>
                      <td className="py-2 text-gray-300">{trade.quantity.toFixed(4)}</td>
                      <td className="py-2">
                        {trade.signal?.strategy ? (
                          <Badge variant="outline" className="text-blue-400 border-blue-400">
                            {trade.signal.strategy}
                          </Badge>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-2 text-sm text-gray-400">
                        {trade.reason || '-'}
                      </td>
                      <td className="py-2">
                        {trade.pnl !== null && trade.pnl !== undefined ? (
                          <span className={trade.pnl >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>
                            {formatCurrency(trade.pnl)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-2">
                        {trade.cumulativePnL !== undefined ? (
                          <span className={trade.cumulativePnL >= 0 ? 'text-green-500 font-bold' : 'text-red-500 font-bold'}>
                            {formatCurrency(trade.cumulativePnL)}
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="py-2">
                        <Badge 
                          variant="outline" 
                          className={
                            trade.status === 'filled' ? 'text-green-500 border-green-500' :
                            trade.status === 'cancelled' ? 'text-red-500 border-red-500' :
                            'text-yellow-500 border-yellow-500'
                          }
                        >
                          {trade.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

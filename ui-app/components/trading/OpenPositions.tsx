'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react';

interface Position {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  quantity: number;
  currentPrice: number;
  unrealizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
  openTime: string;
}

export function OpenPositions() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchPositions = async () => {
    try {
      const response = await fetch('/api/trading/positions?type=open');
      const data = await response.json();
      setPositions(data.positions);
    } catch (error) {
      console.error('Failed to fetch positions:', error);
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

  const formatPercent = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 2,
      signDisplay: 'always'
    }).format(value);
  };

  const getPnLColor = (pnl: number) => {
    return pnl >= 0 ? 'text-green-500' : 'text-red-500';
  };

  const getSideColor = (side: string) => {
    return side === 'long' ? 'bg-green-500' : 'bg-red-500';
  };

  const calculatePnLPercent = (position: Position) => {
    const pnlPercent = (position.unrealizedPnL / (position.entryPrice * position.quantity));
    return pnlPercent;
  };

  if (loading) {
    return <div>Loading positions...</div>;
  }

  return (
    <Card className="border-green-900/20 bg-black">
      <CardHeader>
        <CardTitle className="text-white">Open Positions</CardTitle>
        <CardDescription className="text-gray-400">
          Active trading positions
        </CardDescription>
      </CardHeader>
      <CardContent>
        {positions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No open positions</p>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => (
              <div
                key={position.id}
                className="p-4 rounded-lg bg-gray-900 border border-gray-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <Badge className={`${getSideColor(position.side)} text-white`}>
                      {position.side.toUpperCase()}
                    </Badge>
                    <span className="font-medium text-white text-lg">
                      {position.symbol}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1 font-bold ${getPnLColor(position.unrealizedPnL)}`}>
                    {position.unrealizedPnL >= 0 ? (
                      <TrendingUpIcon className="h-4 w-4" />
                    ) : (
                      <TrendingDownIcon className="h-4 w-4" />
                    )}
                    {formatCurrency(position.unrealizedPnL)}
                    <span className="text-sm">
                      {formatPercent(calculatePnLPercent(position))}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-400">Entry</span>
                    <p className="text-white font-medium">
                      {formatCurrency(position.entryPrice)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Current</span>
                    <p className="text-white font-medium">
                      {formatCurrency(position.currentPrice)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Quantity</span>
                    <p className="text-white font-medium">
                      {position.quantity.toFixed(4)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-400">Value</span>
                    <p className="text-white font-medium">
                      {formatCurrency(position.currentPrice * position.quantity)}
                    </p>
                  </div>
                </div>

                {(position.stopLoss || position.takeProfit) && (
                  <div className="mt-2 pt-2 border-t border-gray-800 flex gap-4 text-xs">
                    {position.stopLoss && (
                      <span className="text-red-400">
                        SL: {formatCurrency(position.stopLoss)}
                      </span>
                    )}
                    {position.takeProfit && (
                      <span className="text-green-400">
                        TP: {formatCurrency(position.takeProfit)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

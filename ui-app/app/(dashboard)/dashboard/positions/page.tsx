'use client';

import { OpenPositions } from '@/components/trading/OpenPositions';
import { useAuth } from '@/lib/client-auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useEffect, useState } from 'react';

interface Position {
  id: string;
  simulationId: string;
  symbol: string;
  side: string; // long, short
  entryPrice: number;
  quantity: number;
  leverage: number;
  margin?: number;
  stopLoss?: number;
  takeProfit?: number;
  openTime: string;
  closeTime?: string | null;
  closedPnL?: number;
  unrealizedPnL?: number;
  currentPrice: number;
  realizedPnL?: number;
}

export default function PositionsPage() {
  useAuth(true);
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);

  useEffect(() => {
    fetchClosedPositions();
  }, []);

  const fetchClosedPositions = async () => {
    try {
      const response = await fetch('/api/trading/positions?type=closed');
      const data = await response.json();
      setClosedPositions(data.positions || []);
    } catch (error) {
      console.error('Failed to fetch closed positions:', error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Positions</h1>
        <p className="text-gray-400 mt-2">Manage and monitor your trading positions</p>
      </div>

      <div className="grid gap-6">
        <OpenPositions />
        
        <Card className="border-green-900/20 bg-black">
          <CardHeader>
            <CardTitle className="text-white">Closed Positions</CardTitle>
            <CardDescription className="text-gray-400">
              Recently closed positions with P&L
            </CardDescription>
          </CardHeader>
          <CardContent>
            {closedPositions.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No closed positions yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-800">
                      <th className="pb-2 text-gray-400">Symbol</th>
                      <th className="pb-2 text-gray-400">Side</th>
                      <th className="pb-2 text-gray-400">Entry</th>
                      <th className="pb-2 text-gray-400">Exit</th>
                      <th className="pb-2 text-gray-400">Quantity</th>
                      <th className="pb-2 text-gray-400">Hold Time</th>
                      <th className="pb-2 text-gray-400">P&L</th>
                      <th className="pb-2 text-gray-400">P&L %</th>
                      <th className="pb-2 text-gray-400">Closed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {closedPositions.map((position, idx) => {
                      const holdTime = position.closeTime && position.openTime 
                        ? new Date(position.closeTime).getTime() - new Date(position.openTime).getTime()
                        : 0;
                      const holdTimeStr = holdTime > 0 
                        ? `${Math.floor(holdTime / 3600000)}h ${Math.floor((holdTime % 3600000) / 60000)}m`
                        : '-';
                      const pnlPercent = position.realizedPnL 
                        ? (position.realizedPnL / (position.entryPrice * position.quantity)) * 100
                        : 0;
                      
                      return (
                        <tr key={position.id || idx}>
                          <td className="py-2 text-white">{position.symbol}</td>
                          <td className="py-2">
                            <span className={position.side === 'long' ? 'text-green-500' : 'text-red-500'}>
                              {position.side}
                            </span>
                          </td>
                          <td className="py-2 text-gray-300">${position.entryPrice.toFixed(2)}</td>
                          <td className="py-2 text-gray-300">${position.currentPrice.toFixed(2)}</td>
                          <td className="py-2 text-gray-300">{position.quantity.toFixed(4)}</td>
                          <td className="py-2 text-gray-400">{holdTimeStr}</td>
                          <td className="py-2">
                            <span className={position.realizedPnL && position.realizedPnL >= 0 ? 'text-green-500' : 'text-red-500'}>
                              ${position.realizedPnL?.toFixed(2) || '0.00'}
                            </span>
                          </td>
                          <td className="py-2">
                            <span className={pnlPercent >= 0 ? 'text-green-500' : 'text-red-500'}>
                              {pnlPercent.toFixed(2)}%
                            </span>
                          </td>
                          <td className="py-2 text-gray-400 text-sm">
                            {position.closeTime ? new Date(position.closeTime).toLocaleString() : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DollarSign, Lock, Wallet } from 'lucide-react';

interface CapitalOverviewProps {
  totalBalance: number;
  availableBalance: number;
  marginUsed: number;
  unrealizedPnL: number;
  realizedPnL: number;
  openPositions: number;
}

export function CapitalOverview({
  totalBalance,
  availableBalance,
  marginUsed,
  unrealizedPnL,
  realizedPnL,
  openPositions
}: CapitalOverviewProps) {
  const marginUtilization = totalBalance > 0 ? (marginUsed / totalBalance) * 100 : 0;
  const capitalUsage = totalBalance > 0 ? ((totalBalance - availableBalance) / totalBalance) * 100 : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <Card className="bg-black/90 border-green-900/20">
      <CardHeader>
        <CardTitle className="text-white">Capital Management</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Total Balance */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-green-500" />
              <span className="text-sm text-gray-400">Total Balance</span>
            </div>
            <span className="text-lg font-bold text-white">
              {formatCurrency(totalBalance)}
            </span>
          </div>

          {/* Available Balance */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-gray-400">Available Capital</span>
            </div>
            <span className="text-lg font-bold text-blue-400">
              {formatCurrency(availableBalance)}
            </span>
          </div>

          {/* Margin Used */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-gray-400">Margin Used</span>
            </div>
            <span className="text-lg font-bold text-yellow-400">
              {formatCurrency(marginUsed)}
            </span>
          </div>

          {/* Capital Utilization Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Capital Utilization</span>
              <span className="text-white">{formatPercent(capitalUsage)}</span>
            </div>
            <Progress 
              value={capitalUsage} 
              className={`h-2 ${
                capitalUsage > 80 ? '[&>div]:bg-red-500' : 
                capitalUsage > 60 ? '[&>div]:bg-yellow-500' : 
                '[&>div]:bg-green-500'
              }`}
            />
          </div>

          {/* Margin Utilization Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Margin Utilization</span>
              <span className="text-white">{formatPercent(marginUtilization)}</span>
            </div>
            <Progress 
              value={marginUtilization} 
              className={`h-2 ${
                marginUtilization > 80 ? '[&>div]:bg-red-500' : 
                marginUtilization > 60 ? '[&>div]:bg-yellow-500' : 
                '[&>div]:bg-green-500'
              }`}
            />
          </div>

          {/* P&L Summary */}
          <div className="pt-2 border-t border-gray-800">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">Unrealized P&L</p>
                <p className={`text-sm font-medium ${unrealizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(unrealizedPnL)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Realized P&L</p>
                <p className={`text-sm font-medium ${realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(realizedPnL)}
                </p>
              </div>
            </div>
          </div>

          {/* Position Count */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-800">
            <span className="text-sm text-gray-400">Open Positions</span>
            <span className="text-sm font-medium text-white">{openPositions} / 3</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

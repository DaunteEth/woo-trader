'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, Shield, TrendingDown } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RiskIndicatorProps {
  dailyPnL: number;
  dailyLossLimit: number;
  maxDrawdown: number;
  currentDrawdown: number;
  riskPerTrade: number;
  openPositions: number;
  maxPositions: number;
}

export function RiskIndicator({
  dailyPnL,
  dailyLossLimit,
  maxDrawdown,
  currentDrawdown,
  riskPerTrade,
  openPositions,
  maxPositions
}: RiskIndicatorProps) {
  const dailyLossPercent = Math.abs(Math.min(0, dailyPnL) / dailyLossLimit) * 100;
  const drawdownPercent = (currentDrawdown / maxDrawdown) * 100;
  const positionUtilization = (openPositions / maxPositions) * 100;

  const getRiskLevel = () => {
    if (dailyLossPercent > 80 || drawdownPercent > 80) return 'critical';
    if (dailyLossPercent > 60 || drawdownPercent > 60) return 'warning';
    return 'safe';
  };

  const riskLevel = getRiskLevel();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  return (
    <Card className="bg-black/90 border-green-900/20">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className={`h-5 w-5 ${
            riskLevel === 'critical' ? 'text-red-500' : 
            riskLevel === 'warning' ? 'text-yellow-500' : 
            'text-green-500'
          }`} />
          Risk Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Risk Alert */}
        {riskLevel !== 'safe' && (
          <Alert className={`${
            riskLevel === 'critical' ? 'border-red-500 bg-red-500/10' : 'border-yellow-500 bg-yellow-500/10'
          }`}>
            <AlertTriangle className={`h-4 w-4 ${
              riskLevel === 'critical' ? 'text-red-500' : 'text-yellow-500'
            }`} />
            <AlertDescription className={
              riskLevel === 'critical' ? 'text-red-400' : 'text-yellow-400'
            }>
              {riskLevel === 'critical' 
                ? 'Critical risk level reached. Consider reducing positions.'
                : 'Elevated risk detected. Monitor positions closely.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Daily P&L vs Limit */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Daily P&L</span>
            <span className={`text-sm font-medium ${
              dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatCurrency(dailyPnL)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Daily Loss Limit</span>
            <span className="text-gray-400">{formatCurrency(dailyLossLimit)}</span>
          </div>
          <Progress 
            value={dailyLossPercent} 
            className={`h-2 ${
              dailyLossPercent > 80 ? '[&>div]:bg-red-500' : 
              dailyLossPercent > 60 ? '[&>div]:bg-yellow-500' : 
              '[&>div]:bg-green-500'
            }`}
          />
        </div>

        {/* Drawdown */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              Current Drawdown
            </span>
            <span className="text-sm font-medium text-white">
              {currentDrawdown.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">Max Allowed</span>
            <span className="text-gray-400">{maxDrawdown.toFixed(1)}%</span>
          </div>
          <Progress 
            value={drawdownPercent} 
            className={`h-2 ${
              drawdownPercent > 80 ? '[&>div]:bg-red-500' : 
              drawdownPercent > 60 ? '[&>div]:bg-yellow-500' : 
              '[&>div]:bg-green-500'
            }`}
          />
        </div>

        {/* Position Utilization */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Position Slots</span>
            <span className="text-sm font-medium text-white">
              {openPositions} / {maxPositions}
            </span>
          </div>
          <Progress 
            value={positionUtilization} 
            className="h-2 [&>div]:bg-blue-500"
          />
        </div>

        {/* Risk Per Trade */}
        <div className="pt-2 border-t border-gray-800">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">Risk Per Trade</span>
            <span className="text-sm font-medium text-white">
              {(riskPerTrade * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

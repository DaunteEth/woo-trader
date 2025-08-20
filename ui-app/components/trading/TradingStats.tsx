'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpIcon, ArrowDownIcon, TrendingUpIcon, ActivityIcon } from 'lucide-react';

interface Stats {
  totalTrades: number;
  totalPnL: number;
  winRate: number;
  winningTrades: number;
  losingTrades: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  largestWin: number;
  largestLoss: number;
  startingBalance: number;
  currentBalance: number;
  openPositions: number;
}

export function TradingStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000); // Update every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/trading/stats');
      const data = await response.json();
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return <div>Loading stats...</div>;
  }

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
      minimumFractionDigits: 1
    }).format(value);
  };

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <Card className="glass-dark border-green-500/20 glow-green">
        <CardHeader>
          <CardTitle className="text-xl font-display text-gradient-gold">Account Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-4xl font-bold text-white">
                {formatCurrency(stats.currentBalance || 10000)}
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Started with {formatCurrency(stats.startingBalance || 10000)}
              </p>
            </div>
            <div className={`text-2xl font-bold ${(stats.totalPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {(stats.totalPnL || 0) >= 0 ? '+' : ''}{formatCurrency(stats.totalPnL || 0)}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-dark border-green-900/20 card-hover">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-gray-300">Total P&L</CardTitle>
            <TrendingUpIcon className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(stats.totalPnL || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {formatCurrency(stats.totalPnL || 0)}
            </div>
            <p className="text-xs text-gray-500">
              {stats.totalTrades || 0} total trades
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="border-green-900/20 bg-black">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-300">Win Rate</CardTitle>
          <ActivityIcon className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">
            {formatPercent(stats.winRate)}
          </div>
          <p className="text-xs text-gray-500">
            {stats.winningTrades}W / {stats.losingTrades}L
          </p>
        </CardContent>
      </Card>

      <Card className="border-green-900/20 bg-black">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-300">Average Win</CardTitle>
          <ArrowUpIcon className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-500">
            {formatCurrency(stats.averageWin)}
          </div>
          <p className="text-xs text-gray-500">
            Largest: {formatCurrency(stats.largestWin)}
          </p>
        </CardContent>
      </Card>

      <Card className="border-green-900/20 bg-black">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-gray-300">Average Loss</CardTitle>
          <ArrowDownIcon className="h-4 w-4 text-red-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-500">
            {formatCurrency(stats.averageLoss)}
          </div>
          <p className="text-xs text-gray-500">
            Largest: {formatCurrency(stats.largestLoss)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

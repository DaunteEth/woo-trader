'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEffect, useState } from 'react';

interface SignalStats {
  totalToday: number;
  accuracy: number;
  avgExecutionTime: number;
}

export function SignalStatistics() {
  const [stats, setStats] = useState<SignalStats>({
    totalToday: 0,
    accuracy: 0,
    avgExecutionTime: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      // Fetch signals from today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const response = await fetch('/api/trading/signals');
      if (response.ok) {
        const data = await response.json();
        const signals = data.signals || [];
        
        // Calculate today's signals
        const todaySignals = signals.filter((s: {timestamp: string}) => 
          new Date(s.timestamp) >= today
        );
        
        // Calculate accuracy (profitable trades / total executed trades)
        const executedSignals = signals.filter((s: {executed?: boolean}) => s.executed);
        const profitableSignals = executedSignals.filter((s: {actualPnL?: number}) => 
          s.actualPnL && s.actualPnL > 0
        );
        const accuracy = executedSignals.length > 0 
          ? (profitableSignals.length / executedSignals.length) * 100 
          : 0;
        
        // Calculate average execution time
        const executionTimes = executedSignals
          .filter((s: {executionTime?: number}) => s.executionTime)
          .map((s: {executionTime?: number}) => s.executionTime);
        const avgExecutionTime = executionTimes.length > 0
          ? executionTimes.reduce((a: number, b: number) => a + b, 0) / executionTimes.length
          : 0;
        
        setStats({
          totalToday: todaySignals.length,
          accuracy: Math.round(accuracy * 10) / 10,
          avgExecutionTime: Math.round(avgExecutionTime)
        });
      }
    } catch (error) {
      console.error('Failed to fetch signal stats:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-green-900/20 bg-black">
      <CardHeader>
        <CardTitle className="text-white">Signal Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-green-500">
              {loading ? '...' : stats.totalToday}
            </div>
            <div className="text-sm text-gray-400">Total Signals Today</div>
          </div>
          <div className="text-center p-4 bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-green-500">
              {loading ? '...' : `${stats.accuracy}%`}
            </div>
            <div className="text-sm text-gray-400">Signal Accuracy</div>
          </div>
          <div className="text-center p-4 bg-gray-900 rounded-lg">
            <div className="text-2xl font-bold text-green-500">
              {loading ? '...' : `${stats.avgExecutionTime}ms`}
            </div>
            <div className="text-sm text-gray-400">Avg Execution Time</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

'use client';

import { RecentSignals } from '@/components/trading/RecentSignals';
import { SignalStatistics } from '@/components/trading/SignalStatistics';
import { useAuth } from '@/lib/client-auth';


export default function SignalsPage() {
  useAuth(true);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Trading Signals</h1>
        <p className="text-gray-400 mt-2">Real-time signals from all active strategies</p>
      </div>

      <div className="grid gap-6">
        <RecentSignals />
        
        <SignalStatistics />
      </div>
    </div>
  );
}

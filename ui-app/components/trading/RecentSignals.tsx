'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { io } from 'socket.io-client';
import { SignalDetailModal } from './SignalDetailModal';

interface Signal {
  id: string;
  timestamp: string;
  symbol: string;
  action: string;
  strategy: string;
  strength: number;
  confidence: number;
  executed: boolean;
  suggestedEntry?: number;
  suggestedSL?: number;
  suggestedTP?: number;
  indicators?: Record<string, unknown>;
  positionSize?: number;
}

export function RecentSignals() {
  const [signals, setSignals] = useState<Signal[]>([]);
  // const [socket, setSocket] = useState<Socket | null>(null);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchSignals();
    
    // Connect to WebSocket for real-time updates
    const newSocket = io('http://localhost:3006');
    // setSocket(newSocket);

    newSocket.on('signalUpdate', () => {
      fetchSignals();
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const fetchSignals = async () => {
    try {
      const response = await fetch('/api/trading/signals?limit=10');
      const data = await response.json();
      setSignals(data.signals);
    } catch {
      // Failed to fetch signals
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'buy': return 'bg-green-500';
      case 'sell': return 'bg-red-500';
      case 'hold': return 'bg-yellow-500';
      case 'close': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  const formatPrice = (price?: number) => {
    return price ? `$${price.toFixed(2)}` : '-';
  };

  return (
    <>
    <Card className="border-green-900/20 bg-black">
      <CardHeader>  
        <CardTitle className="text-white">Recent Signals</CardTitle>
        <CardDescription className="text-gray-400">
          Live trading signals from HFT strategies
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {signals.map((signal) => (
            <div
              key={signal.id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-700 cursor-pointer transition-colors"
              onClick={() => {
                setSelectedSignal(signal);
                setIsModalOpen(true);
              }}
            >
              <div className="flex items-center gap-4">
                <Badge className={`${getActionColor(signal.action)} text-white`}>
                  {signal.action.toUpperCase()}
                </Badge>
                <div>
                  <div className="font-medium text-white">
                    {signal.symbol}
                    {(signal as Signal & {aiEnhanced?: boolean}).aiEnhanced && (
                      <span className="ml-2 text-xs text-blue-400">✨ AI</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-400">
                    {signal.strategy} • {formatTime(signal.timestamp)}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm">
                  <span className="text-gray-400">Confidence: </span>
                  <span className="text-white font-medium">
                    {(signal.confidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Entry: {formatPrice(signal.suggestedEntry)}
                </div>
              </div>
              {signal.executed && (
                <Badge variant="outline" className="ml-2 text-green-500 border-green-500">
                  Executed
                </Badge>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
    
    <SignalDetailModal
      signal={selectedSignal}
      isOpen={isModalOpen}
      onClose={() => {
        setIsModalOpen(false);
        setSelectedSignal(null);
      }}
    />
    </>
  );
}

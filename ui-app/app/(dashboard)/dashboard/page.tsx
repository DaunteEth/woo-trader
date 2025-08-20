'use client';

import { useTradingData } from '@/hooks/use-trading-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { TrendingUp, TrendingDown, Activity, DollarSign, Target, Zap, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/client-auth';
import { CapitalOverview } from '@/components/trading/CapitalOverview';
import { RecentTransactions } from '@/components/trading/RecentTransactions';
import { RiskIndicator } from '@/components/trading/RiskIndicator';
import { syncUserBalance } from '@/lib/balance-sync';
import { useEffect, useState } from 'react';

export default function DashboardPage() {
  useAuth(true); // Require authentication
  const { 
    status, 
    signals, 
    positions,
    trades, 
    marketConditions,
    isConnected,
    toggleBot 
  } = useTradingData();
  
  const [balanceSynced, setBalanceSynced] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSimulation, setActiveSimulation] = useState<{id: string; name: string; balance: number} | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean>(false);
  const [aiSettings, setAiSettings] = useState<{
    openaiKey?: string;
    openrouterKey?: string;
    model?: string;
  }>({});
  
  // Fetch user data on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then((data) => {
        if (data.user) {
          if (data.user.balance) {
            setUserBalance(data.user.balance);
          }
          if (data.user.id) {
            setUserId(data.user.id);
          }
        }
        if (data.activeSimulation) {
          setActiveSimulation(data.activeSimulation);
          // Use simulation balance instead of user balance
          setUserBalance(data.activeSimulation.balance);
        }
        
        // Fetch AI settings after getting user
        if (data.user?.id) {
          fetch('/api/settings')
            .then(res => res.json())
            .then(settings => {
              if (settings.variables) {
                const openaiKey = settings.variables.find((v: {key: string; value: string}) => v.key === 'OPENAI_API_KEY');
                const openrouterKey = settings.variables.find((v: {key: string; value: string}) => v.key === 'OPENROUTER_API_KEY');
                const aiModel = settings.variables.find((v: {key: string; value: string}) => v.key === 'AI_MODEL');
                
                setAiSettings({
                  openaiKey: openaiKey?.value,
                  openrouterKey: openrouterKey?.value,
                  model: aiModel?.value || 'openai/gpt-5-nano'
                });
                
                // Enable AI if either key is present
                setAiEnabled(!!(openaiKey?.value || openrouterKey?.value));
              }
            })
            .catch(err => console.error('Failed to fetch AI settings:', err));
        }
      })
      .catch(err => console.error('Failed to fetch user data:', err));
  }, []);
  
  // Sync user balance with trading bot on first connection
  useEffect(() => {
    if (isConnected && !balanceSynced && userBalance !== null && userId) {
      syncUserBalance(userBalance, userId)
        .then(() => setBalanceSynced(true))
        .catch(err => console.error('Failed to sync balance:', err));
    }
  }, [isConnected, balanceSynced, userBalance, userId]);

  // Calculate performance metrics
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t: {pnl: number}) => (t.pnl || 0) > 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const totalPnL = trades.reduce((sum: number, t: {pnl: number}) => sum + (t.pnl || 0), 0);
  const dailyTrades = trades.filter((t: {timestamp: string}) => 
    new Date(t.timestamp).toDateString() === new Date().toDateString()
  );
  const dailyPnL = dailyTrades.reduce((sum: number, t: {pnl: number}) => sum + (t.pnl || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            HFT Trading Dashboard
          </h1>
          <p className="text-muted-foreground">
            {activeSimulation ? (
              <>
                <span className="font-semibold text-blue-600">{activeSimulation.name}</span> • 
                Balance: <span className="font-semibold">${activeSimulation.balance.toFixed(2)}</span>
              </>
            ) : (
              'Monitor your high-frequency trading bot in real-time'
            )}
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Badge variant={isConnected ? 'default' : 'destructive'} className="w-fit">
            <div className={cn("w-2 h-2 rounded-full mr-2", 
              isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            )} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          
          <div className="flex items-center gap-2">
            <Label htmlFor="ai-toggle" className="text-sm font-medium">
              AI Services
            </Label>
            <Switch
              id="ai-toggle"
              checked={aiEnabled}
              onCheckedChange={(checked) => {
                setAiEnabled(checked);
                if (!checked) {
                  // If disabling AI, also disable AI features in strategies
                  fetch('/api/strategies')
                    .then(res => res.json())
                    .then(strategies => {
                      const updatedStrategies = strategies.map((s: {followAISignals?: boolean; aiExecutionEnabled?: boolean}) => ({
                        ...s,
                        followAISignals: false,
                        aiExecutionEnabled: false
                      }));
                      return fetch('/api/strategies', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updatedStrategies)
                      });
                    });
                }
              }}
              disabled={!aiSettings.openaiKey && !aiSettings.openrouterKey}
            />
            {!aiSettings.openaiKey && !aiSettings.openrouterKey && (
              <Badge variant="outline" className="text-xs">
                <a href="/dashboard/settings" className="text-blue-500 hover:underline">
                  Configure API Keys
                </a>
              </Badge>
            )}
          </div>
          
          <Button
            onClick={() => toggleBot(userId || undefined, activeSimulation?.id)}
            variant={status?.isRunning ? 'destructive' : 'default'}
            disabled={!activeSimulation}
            className="min-w-[100px]"
          >
            {status?.isRunning ? (
              <>
                <Zap className="w-4 h-4 mr-2" />
                Stop Bot
              </>
            ) : (
              <>
                <Target className="w-4 h-4 mr-2" />
                Start Bot
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Primary Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${status?.balance?.toFixed(2) || '0.00'}
            </div>
            <p className="text-xs text-muted-foreground">
              Available: ${status?.availableBalance?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            {totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={cn(
              "text-2xl font-bold",
              totalPnL >= 0 ? "text-green-600" : "text-red-600"
            )}>
              ${totalPnL.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Today: ${dailyPnL.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {winRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              {winningTrades}/{totalTrades} trades
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Positions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {positions.length} / 3
            </div>
            <p className="text-xs text-muted-foreground">
              Margin: ${status?.marginUsed?.toFixed(2) || '0.00'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Capital Overview - Left Column */}
        <div className="lg:col-span-1 space-y-6">
          <CapitalOverview
            totalBalance={status?.balance || userBalance || 10000}
            availableBalance={status?.availableBalance || userBalance || 10000}
            marginUsed={status?.marginUsed || 0}
            unrealizedPnL={status?.unrealizedPnL || 0}
            realizedPnL={status?.realizedPnL || 0}
            openPositions={positions.length}
          />
          
          <RiskIndicator
            dailyPnL={dailyPnL}
            dailyLossLimit={500} // 5% of 10k balance
            maxDrawdown={20}
            currentDrawdown={Math.abs(Math.min(0, (status?.pnl || 0) / (status?.balance || 10000))) * 100}
            riskPerTrade={0.02}
            openPositions={positions.length}
            maxPositions={3}
          />
        </div>
        
        {/* Market Conditions & Positions - Middle Column */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Market Conditions
              </CardTitle>
              <CardDescription>Real-time market data</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {marketConditions.map((market) => (
                <div key={market.symbol} className="bg-muted/50 rounded-lg p-3 border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">{market.symbol}</span>
                    <span className="text-lg font-bold">${market.price?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="text-xs text-muted-foreground grid grid-cols-2 gap-2">
                    <div className="flex justify-between">
                      <span>Spread:</span>
                      <span>{market.spread?.toFixed(4) || '0.0000'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vol:</span>
                      <span>{market.volatility?.toFixed(2) || '0.00'}%</span>
                    </div>
                  </div>
                </div>
              ))}
              {marketConditions.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No market data available
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Active Positions
              </CardTitle>
              <CardDescription>Current open positions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {positions.map((position) => (
                <div key={position.id || `${position.symbol}-${position.side}`} 
                     className="bg-muted/50 rounded-lg p-3 border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">{position.symbol}</span>
                    <Badge variant={position.side === 'long' ? 'default' : 'destructive'}>
                      {position.side.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span>Entry:</span>
                      <span>${position.entry?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Current:</span>
                      <span>${position.current?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>P&L:</span>
                      <span className={cn(
                        "font-semibold",
                        position.pnl >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        ${position.pnl?.toFixed(2) || '0.00'} ({position.pnlPercent?.toFixed(2) || '0.00'}%)
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      Age: {position.age}m
                    </div>
                  </div>
                </div>
              ))}
              {positions.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No open positions
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Signals - Right Column */}
        <div className="lg:col-span-1">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Recent Signals
              </CardTitle>
              <CardDescription>Latest trading signals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {signals.slice(0, 8).map((signal) => (
                <div key={signal.id} className="bg-muted/50 rounded-lg p-3 border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-sm">{signal.symbol}</span>
                    <Badge variant={
                      signal.action === 'buy' ? 'default' : 
                      signal.action === 'sell' ? 'destructive' : 
                      'secondary'
                    }>
                      {signal.action.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{signal.strategy}</span>
                      <span className="font-medium">Conf: {(signal.confidence * 100).toFixed(0)}%</span>
                    </div>
                    {signal.suggestedEntry && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Entry: ${signal.suggestedEntry?.toFixed(2) || 'N/A'}</span>
                        <span>SL: ${signal.suggestedStopLoss?.toFixed(2) || 'N/A'}</span>
                      </div>
                    )}
                    {signal.indicators?.trendContext && (
                      <div className="text-xs text-muted-foreground">
                        Trend: {signal.indicators.trendContext.tradingConditions}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {signals.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No recent signals
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent Transactions */}
      <RecentTransactions />
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Zap, 
  TrendingUp, 
  Activity, 
  Settings, 
  Save,
  BarChart,
  Percent,
  Timer
} from 'lucide-react';

interface StrategyConfig {
  id?: string;
  name: string;
  enabled: boolean;
  weight: number;
  // Signal following configuration
  followOwnSignals?: boolean;
  followAISignals?: boolean;
  aiExecutionEnabled?: boolean;
  // Common parameters
  stopLossPercent?: number;
  takeProfitPercent?: number;
  // Scalping parameters
  emaPeriodFast?: number;
  emaPeriodSlow?: number;
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  bbPeriod?: number;
  bbStdDev?: number;
  minSpread?: number;
  maxSpread?: number;
  // Momentum parameters
  vwapEnabled?: boolean;
  bbBreakoutStdDev?: number;
  momentumPeriod?: number;
  volumeMultiplier?: number;
  rsiMomentumThreshold?: number;
  trailingStopPercent?: number;
  // Advanced settings
  minHoldTime?: number;
  // Arbitrage parameters
  minSpreadPercent?: number;
  maxSpreadPercent?: number;
  executionDelay?: number;
  feePercent?: number;
  minProfitPercent?: number;
  // FundingArbitrage parameters
  minFundingRate?: number;
  fundingThreshold?: number;
  hoursBeforeFunding?: number;
  maxPositionHoldTime?: number;
  spotFeePercent?: number;
  perpFeePercent?: number;
  // OrderBookArbitrage parameters
  minImbalance?: number;
  minVolumeRatio?: number;
  depthLevels?: number;
  minSpreadBps?: number;
  maxSpreadBps?: number;
  confidenceThreshold?: number;
}

const strategyIcons = {
  Scalping: Zap,
  Momentum: TrendingUp,
  Arbitrage: Activity,
  FundingArbitrage: Percent,
  OrderBookArbitrage: BarChart
};

const strategyDescriptions = {
  Scalping: 'Fast-paced trading strategy that aims to profit from small price movements using technical indicators',
  Momentum: 'Captures strong price movements with volume confirmation and trend-following indicators',
  Arbitrage: 'Exploits price inefficiencies and spreads between different markets or time periods',
  FundingArbitrage: 'Captures funding rate opportunities in perpetual futures markets',
  OrderBookArbitrage: 'Exploits order book imbalances and liquidity gaps for profit'
};

export default function StrategiesPage() {
  const { toast } = useToast();
  const [strategies, setStrategies] = useState<StrategyConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    fetchStrategies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchStrategies = async () => {
    setIsFetching(true);
    try {
      const response = await fetch('/api/strategies');
      if (response.ok) {
        const data = await response.json();
        setStrategies(data);
      }
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to fetch strategies',
        variant: 'destructive',
      });
    } finally {
      setIsFetching(false);
    }
  };

  const handleStrategyUpdate = (index: number, field: string, value: unknown) => {
    const updated = [...strategies];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setStrategies(updated);
  };

  const saveStrategies = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(strategies),
      });

      if (!response.ok) {
        throw new Error('Failed to save strategies');
      }

      toast({
        title: 'Success',
        description: 'Strategy configurations saved successfully',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save strategies',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const totalWeight = strategies.reduce((sum, s) => s.enabled ? sum + s.weight : sum, 0);

  if (isFetching) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Loading strategies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Strategy Configuration</h1>
          <p className="text-gray-400">
            Configure and optimize your trading strategies
          </p>
        </div>
        
        <Button 
          onClick={saveStrategies} 
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Weight Distribution */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Percent className="h-5 w-5" />
            Strategy Weight Distribution
          </CardTitle>
          <CardDescription>
            Total weight: {totalWeight.toFixed(1)} (should equal 1.0)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {strategies.map((strategy) => strategy.enabled && (
              <div key={strategy.name} className="flex items-center gap-2">
                <span className="w-20 text-sm text-gray-400">{strategy.name}</span>
                <Progress 
                  value={strategy.weight * 100} 
                  className="flex-1"
                />
                <span className="text-sm text-gray-400 w-12 text-right">
                  {(strategy.weight * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
          {Math.abs(totalWeight - 1.0) > 0.01 && (
            <p className="text-yellow-400 text-sm mt-2">
              ⚠️ Weights should sum to 1.0 for optimal allocation
            </p>
          )}
        </CardContent>
      </Card>

      {strategies.length === 0 ? (
        <Card className="bg-gray-800 border-gray-700">
          <CardContent className="p-6">
            <p className="text-gray-400 text-center">No strategies configured. Please create a simulation first.</p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={strategies[0]?.name?.toLowerCase() || 'scalping'} className="space-y-4">
          <TabsList>
            {strategies.map((strategy) => {
              const Icon = strategy.name && strategyIcons[strategy.name as keyof typeof strategyIcons] ? 
                strategyIcons[strategy.name as keyof typeof strategyIcons] : Activity;
              return (
                <TabsTrigger 
                  key={strategy.name} 
                  value={strategy.name.toLowerCase()}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {strategy.name}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {strategies.map((strategy, index) => {
            const Icon = strategy.name && strategyIcons[strategy.name as keyof typeof strategyIcons] ? 
              strategyIcons[strategy.name as keyof typeof strategyIcons] : Activity;
            const description = strategy.name && strategyDescriptions[strategy.name as keyof typeof strategyDescriptions] ? 
              strategyDescriptions[strategy.name as keyof typeof strategyDescriptions] : 'Trading strategy configuration';
            
            return (
              <TabsContent key={strategy.name} value={strategy.name.toLowerCase()}>
              <Card className="bg-gray-800 border-gray-700">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {Icon && <Icon className="h-8 w-8 text-blue-400" />}
                      <div>
                        <CardTitle className="text-white">{strategy.name} Strategy</CardTitle>
                        <CardDescription>{description}</CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`${strategy.name}-enabled`}
                        checked={strategy.enabled}
                        onCheckedChange={(checked) => 
                          handleStrategyUpdate(index, 'enabled', checked)
                        }
                      />
                      <Label htmlFor={`${strategy.name}-enabled`} className="text-white">
                        {strategy.enabled ? 'Enabled' : 'Disabled'}
                      </Label>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {/* Weight Configuration */}
                  <div className="space-y-2">
                    <Label htmlFor={`${strategy.name}-weight`} className="text-white flex items-center gap-2">
                      <BarChart className="h-4 w-4" />
                      Strategy Weight (0-1)
                    </Label>
                    <Input
                      id={`${strategy.name}-weight`}
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={strategy.weight}
                      onChange={(e) => 
                        handleStrategyUpdate(index, 'weight', parseFloat(e.target.value))
                      }
                      className="bg-gray-700 border-gray-600 text-white"
                    />
                  </div>
                  
                  {/* Signal Following Configuration */}
                  <div className="space-y-4">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Signal Following
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`${strategy.name}-followOwn`} className="text-gray-300">
                          Follow Own Signals
                        </Label>
                        <Switch
                          id={`${strategy.name}-followOwn`}
                          checked={strategy.followOwnSignals ?? true}
                          onCheckedChange={(checked) => 
                            handleStrategyUpdate(index, 'followOwnSignals', checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`${strategy.name}-followAI`} className="text-gray-300">
                          Follow AI-Enhanced Signals
                        </Label>
                        <Switch
                          id={`${strategy.name}-followAI`}
                          checked={strategy.followAISignals ?? true}
                          onCheckedChange={(checked) => 
                            handleStrategyUpdate(index, 'followAISignals', checked)
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`${strategy.name}-aiExecution`} className="text-gray-300">
                          Enable AI Autonomous Execution
                        </Label>
                        <Switch
                          id={`${strategy.name}-aiExecution`}
                          checked={strategy.aiExecutionEnabled ?? false}
                          onCheckedChange={(checked) => 
                            handleStrategyUpdate(index, 'aiExecutionEnabled', checked)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Common Risk Management */}
                  <div className="space-y-4">
                    <h3 className="text-white font-semibold flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Risk Management
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-gray-300">Stop Loss %</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={strategy.stopLossPercent || 0.003}
                          onChange={(e) => 
                            handleStrategyUpdate(index, 'stopLossPercent', parseFloat(e.target.value))
                          }
                          className="bg-gray-700 border-gray-600 text-white"
                        />
                      </div>
                      <div>
                        <Label className="text-gray-300">Take Profit %</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={strategy.takeProfitPercent || 0.006}
                          onChange={(e) => 
                            handleStrategyUpdate(index, 'takeProfitPercent', parseFloat(e.target.value))
                          }
                          className="bg-gray-700 border-gray-600 text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Strategy-Specific Parameters */}
                  {strategy.name === 'Scalping' && (
                    <>
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Moving Averages</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-gray-300">Fast EMA Period</Label>
                            <Input
                              type="number"
                              value={strategy.emaPeriodFast || 9}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'emaPeriodFast', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Slow EMA Period</Label>
                            <Input
                              type="number"
                              value={strategy.emaPeriodSlow || 21}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'emaPeriodSlow', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">RSI Configuration</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-gray-300">RSI Period</Label>
                            <Input
                              type="number"
                              value={strategy.rsiPeriod || 7}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'rsiPeriod', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Overbought</Label>
                            <Input
                              type="number"
                              value={strategy.rsiOverbought || 70}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'rsiOverbought', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Oversold</Label>
                            <Input
                              type="number"
                              value={strategy.rsiOversold || 30}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'rsiOversold', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Bollinger Bands</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-gray-300">BB Period</Label>
                            <Input
                              type="number"
                              value={strategy.bbPeriod || 20}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'bbPeriod', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Standard Deviation</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={strategy.bbStdDev || 2}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'bbStdDev', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Spread Limits</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-gray-300">Min Spread</Label>
                            <Input
                              type="number"
                              step="0.0001"
                              value={strategy.minSpread || 0.0001}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minSpread', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Max Spread</Label>
                            <Input
                              type="number"
                              step="0.0001"
                              value={strategy.maxSpread || 0.001}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'maxSpread', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Trailing Stop</h3>
                        <div>
                          <Label className="text-gray-300">Trailing Stop %</Label>
                          <Input
                            type="number"
                            step="0.001"
                            value={strategy.trailingStopPercent || 0.004}
                            onChange={(e) => 
                              handleStrategyUpdate(index, 'trailingStopPercent', parseFloat(e.target.value))
                            }
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Advanced Settings</h3>
                        <div>
                          <Label className="text-gray-300">Minimum Hold Time (seconds)</Label>
                          <Input
                            type="number"
                            value={strategy.minHoldTime || 30}
                            onChange={(e) => 
                              handleStrategyUpdate(index, 'minHoldTime', parseInt(e.target.value))
                            }
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {strategy.name === 'Momentum' && (
                    <>
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">VWAP Settings</h3>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="vwap-enabled"
                            checked={strategy.vwapEnabled || false}
                            onCheckedChange={(checked) => 
                              handleStrategyUpdate(index, 'vwapEnabled', checked)
                            }
                          />
                          <Label htmlFor="vwap-enabled" className="text-white">
                            Use VWAP Indicator
                          </Label>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Momentum Configuration</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-gray-300">Momentum Period</Label>
                            <Input
                              type="number"
                              value={strategy.momentumPeriod || 10}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'momentumPeriod', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Volume Multiplier</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={strategy.volumeMultiplier || 1.5}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'volumeMultiplier', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">RSI & Bands</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-gray-300">RSI Period</Label>
                            <Input
                              type="number"
                              value={strategy.rsiPeriod || 14}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'rsiPeriod', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">RSI Threshold</Label>
                            <Input
                              type="number"
                              value={strategy.rsiMomentumThreshold || 60}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'rsiMomentumThreshold', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">BB Breakout StdDev</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={strategy.bbBreakoutStdDev || 2}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'bbBreakoutStdDev', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Trailing Stop</h3>
                        <div>
                          <Label className="text-gray-300">Trailing Stop %</Label>
                          <Input
                            type="number"
                            step="0.001"
                            value={strategy.trailingStopPercent || 0.003}
                            onChange={(e) => 
                              handleStrategyUpdate(index, 'trailingStopPercent', parseFloat(e.target.value))
                            }
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Advanced Settings</h3>
                        <div>
                          <Label className="text-gray-300">Minimum Hold Time (seconds)</Label>
                          <Input
                            type="number"
                            value={strategy.minHoldTime || 60}
                            onChange={(e) => 
                              handleStrategyUpdate(index, 'minHoldTime', parseInt(e.target.value))
                            }
                            className="bg-gray-700 border-gray-600 text-white"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {strategy.name === 'Arbitrage' && (
                    <>
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Spread Configuration</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-gray-300">Min Spread %</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={strategy.minSpreadPercent || 0.1}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minSpreadPercent', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Max Spread %</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={strategy.maxSpreadPercent || 2.0}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'maxSpreadPercent', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Execution & Fees</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-gray-300 flex items-center gap-1">
                              <Timer className="h-3 w-3" />
                              Execution Delay (ms)
                            </Label>
                            <Input
                              type="number"
                              value={strategy.executionDelay || 100}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'executionDelay', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Fee %</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={strategy.feePercent || 0.075}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'feePercent', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Min Profit %</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={strategy.minProfitPercent || 0.05}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minProfitPercent', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {strategy.name === 'FundingArbitrage' && (
                    <>
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Funding Rate Settings</h3>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label className="text-gray-300">Min Funding Rate %</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={strategy.minFundingRate || 0.01}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minFundingRate', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Funding Threshold %</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={strategy.fundingThreshold || 0.03}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'fundingThreshold', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Hours Before Funding</Label>
                            <Input
                              type="number"
                              step="1"
                              value={strategy.hoursBeforeFunding || 1}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'hoursBeforeFunding', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Max Hold Time (ms)</Label>
                            <Input
                              type="number"
                              step="1000"
                              value={strategy.maxPositionHoldTime || 28800000}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'maxPositionHoldTime', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Spot Fee %</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={strategy.spotFeePercent || 0.1}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'spotFeePercent', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Perp Fee %</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={strategy.perpFeePercent || 0.05}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'perpFeePercent', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Min Profit % (after fees)</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={strategy.minProfitPercent || 0.02}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minProfitPercent', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {strategy.name === 'OrderBookArbitrage' && (
                    <>
                      <div className="space-y-4">
                        <h3 className="text-white font-semibold">Order Book Settings</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          <div>
                            <Label className="text-gray-300">Min Imbalance %</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={strategy.minImbalance || 60}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minImbalance', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Min Volume Ratio</Label>
                            <Input
                              type="number"
                              step="0.1"
                              value={strategy.minVolumeRatio || 2.0}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minVolumeRatio', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Depth Levels</Label>
                            <Input
                              type="number"
                              step="1"
                              value={strategy.depthLevels || 10}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'depthLevels', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Min Spread (bps)</Label>
                            <Input
                              type="number"
                              step="1"
                              value={strategy.minSpreadBps || 5}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'minSpreadBps', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Max Spread (bps)</Label>
                            <Input
                              type="number"
                              step="1"
                              value={strategy.maxSpreadBps || 50}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'maxSpreadBps', parseInt(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                          <div>
                            <Label className="text-gray-300">Confidence Threshold</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={strategy.confidenceThreshold || 0.7}
                              onChange={(e) => 
                                handleStrategyUpdate(index, 'confidenceThreshold', parseFloat(e.target.value))
                              }
                              className="bg-gray-700 border-gray-600 text-white"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
      )}
    </div>
  );
}
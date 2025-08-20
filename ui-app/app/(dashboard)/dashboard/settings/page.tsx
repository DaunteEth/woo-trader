'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Key, 
  Shield, 
  Globe, 
  Wallet,
  Eye,
  EyeOff,
  Save,
  AlertCircle,
  Bot
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface EnvironmentVariable {
  key: string;
  value: string;
  description: string;
  category: 'exchange' | 'api' | 'security' | 'ai';
  isSecret: boolean;
  tooltip?: string;
}

const defaultVariables: EnvironmentVariable[] = [
  // Exchange Configuration
  {
    key: 'EXCHANGE_NAME',
    value: 'woo',
    description: 'Exchange name (fixed to woo)',
    category: 'exchange',
    isSecret: false
  },
  {
    key: 'WOOX_API_KEY',
    value: '',
    description: 'WooX API key from https://x.woo.org/en_US/developers',
    category: 'exchange',
    isSecret: true,
    tooltip: `How to get WooX API credentials:
1. Go to https://x.woo.org and create an account
2. Complete KYC verification (required for API access)
3. Navigate to Subaccounts → API Management
4. Click "Create API Key"
5. Set permissions: Enable "Trade" for trading
6. Save your API Key, Secret, and Application ID
7. For testnet: Use https://x.woo.org/en/testnet`
  },
  {
    key: 'WOOX_API_SECRET',
    value: '',
    description: 'WooX API secret from https://x.woo.org/en_US/developers',
    category: 'exchange',
    isSecret: true,
    tooltip: 'This is provided when you create your API key. Store it securely as it cannot be retrieved again.'
  },
  {
    key: 'WOOX_APP_ID',
    value: '',
    description: 'WooX Application ID from your API credentials',
    category: 'exchange',
    isSecret: false,
    tooltip: 'Found in your API Management page after creating an API key'
  },
  {
    key: 'EXCHANGE_TESTNET',
    value: 'false',
    description: 'Use testnet (true) or mainnet (false)',
    category: 'exchange',
    isSecret: false,
    tooltip: 'Enable this for testing with virtual funds on WooX testnet'
  },
  // Trading Configuration
  {
    key: 'TRADING_PAIRS',
    value: 'PERP_BTC_USDT,PERP_ETH_USDT',
    description: 'Comma-separated list of trading pairs',
    category: 'exchange',
    isSecret: false
  },
  {
    key: 'TRADING_MODE',
    value: 'paper',
    description: 'Trading mode - paper (simulated) or live (real money)',
    category: 'exchange',
    isSecret: false,
    tooltip: 'Paper trading simulates trades without real money. Live trading uses your actual WooX account balance.'
  },
  // API Configuration
  {
    key: 'API_PORT',
    value: '3006',
    description: 'API server port',
    category: 'api',
    isSecret: false
  },
  {
    key: 'API_SECRET',
    value: '',
    description: 'Secret for API authentication',
    category: 'api',
    isSecret: true
  },
  // Security
  {
    key: 'JWT_SECRET',
    value: '',
    description: 'Secret for JWT token generation',
    category: 'security',
    isSecret: true
  },
  // AI Services
  {
    key: 'OPENAI_API_KEY',
    value: '',
    description: 'OpenAI API key for AI-enhanced trading signals',
    category: 'ai',
    isSecret: true,
    tooltip: `How to get OpenAI API key:
1. Go to https://platform.openai.com/signup
2. Create an account or sign in
3. Navigate to API Keys: https://platform.openai.com/api-keys
4. Click "Create new secret key"
5. Copy and save the key immediately
6. Add billing: Go to Billing and add payment method
7. Note: Requires payment method for API access`
  },
  {
    key: 'OPENROUTER_API_KEY',
    value: '',
    description: 'OpenRouter key from https://openrouter.ai/keys (supports GPT-5-Nano)',
    category: 'ai',
    isSecret: true,
    tooltip: `How to get OpenRouter API key:
1. Go to https://openrouter.ai
2. Sign up with Google, GitHub, or email
3. Navigate to https://openrouter.ai/keys
4. Click "Create Key"
5. Name your key (e.g., "WOO Trading Bot")
6. Copy the key starting with "sk-or-v1-"
7. Add credits: Use "Add Credits" button
8. Payment: Supports crypto (BTC, ETH, USDC) or credit card
9. Model: Use "openai/gpt-5-nano" for best performance`
  }
];

export default function SettingsPage() {
  const { toast } = useToast();
  const [variables, setVariables] = useState<EnvironmentVariable[]>(defaultVariables);
  const [showSecrets, setShowSecrets] = useState<{ [key: string]: boolean }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsFetching(true);
    try {
      const response = await fetch('/api/settings');
      if (response.ok) {
        const data = await response.json();
        
        // If we have saved variables, use them
        if (data.variables && data.variables.length > 0) {
          // Merge with defaults to ensure all variables are present
          const mergedVariables = defaultVariables.map(defaultVar => {
            const existingVar = data.variables.find((v: {key: string}) => v.key === defaultVar.key);
            return existingVar || defaultVar;
          });
          setVariables(mergedVariables);
        } else {
          // Load from current environment (from backend)
          const envResponse = await fetch('/api/settings/env');
          if (envResponse.ok) {
            const envData = await envResponse.json();
            const loadedVariables = defaultVariables.map(defaultVar => ({
              ...defaultVar,
              value: envData[defaultVar.key] || defaultVar.value
            }));
            setVariables(loadedVariables);
          }
        }
      }
    } catch {
      // Error fetching settings
    } finally {
      setIsFetching(false);
    }
  };

  const handleVariableUpdate = (key: string, value: string) => {
    setVariables(variables.map(v => 
      v.key === key ? { ...v, value } : v
    ));
  };

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets({ ...showSecrets, [key]: !showSecrets[key] });
  };

  const saveSettings = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables }),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      toast({
        title: 'Success',
        description: 'Settings saved successfully. Restart the bot to apply changes.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'exchange':
        return <Wallet className="h-5 w-5" />;
      case 'api':
        return <Globe className="h-5 w-5" />;
      case 'security':
        return <Shield className="h-5 w-5" />;
      case 'ai':
        return <Bot className="h-5 w-5" />;
      default:
        return <Key className="h-5 w-5" />;
    }
  };

  if (isFetching) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-gray-400">
            Configure environment variables and API keys
          </p>
        </div>
        
        <Button 
          onClick={saveSettings} 
          disabled={isLoading}
          className="flex items-center gap-2"
        >
          <Save className="h-4 w-4" />
          {isLoading ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          These settings will be saved securely and will require a bot restart to take effect.
          Sensitive values are encrypted before storage.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="exchange" className="space-y-4">
        <TabsList>
          <TabsTrigger value="exchange" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Exchange
          </TabsTrigger>
          <TabsTrigger value="api" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            API
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="ai" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            AI Services
          </TabsTrigger>
        </TabsList>

        {['exchange', 'api', 'security', 'ai'].map(category => (
          <TabsContent key={category} value={category}>
            <Card className="bg-gray-800 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  {getCategoryIcon(category)}
                  {category.charAt(0).toUpperCase() + category.slice(1)} Configuration
                </CardTitle>
                <CardDescription>
                  Configure {category} related settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {variables
                  .filter(v => v.category === category)
                  .map(variable => {
                    // Special handling for TRADING_MODE
                    if (variable.key === 'TRADING_MODE') {
                      return (
                        <div key={variable.key} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor={variable.key} className="text-white">
                                Trading Mode
                              </Label>
                              <p className="text-sm text-gray-400">
                                {variable.value === 'live' ? 'Live Trading (Real Money)' : 'Paper Trading (Simulated)'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm ${variable.value === 'paper' ? 'text-green-400' : 'text-gray-400'}`}>
                                Paper
                              </span>
                              <Switch
                                id={variable.key}
                                checked={variable.value === 'live'}
                                onCheckedChange={(checked) => {
                                  if (checked && !confirm('Are you sure you want to enable LIVE trading? This will use real money!')) {
                                    return;
                                  }
                                  handleVariableUpdate(variable.key, checked ? 'live' : 'paper');
                                }}
                                className="data-[state=checked]:bg-red-600"
                              />
                              <span className={`text-sm ${variable.value === 'live' ? 'text-red-400' : 'text-gray-400'}`}>
                                Live
                              </span>
                            </div>
                          </div>
                          {variable.value === 'live' && (
                            <Alert className="bg-red-900/20 border-red-900/40">
                              <AlertCircle className="h-4 w-4 text-red-400" />
                              <AlertDescription className="text-red-300">
                                Live trading is enabled! All trades will use real money from your WooX account.
                              </AlertDescription>
                            </Alert>
                          )}
                        </div>
                      );
                    }
                    
                    // Regular input for other variables
                    return (
                      <div key={variable.key} className="space-y-2">
                        <Label htmlFor={variable.key} className="text-white">
                          {variable.key}
                        </Label>
                        <div className="relative">
                          <Input
                            id={variable.key}
                            type={variable.isSecret && !showSecrets[variable.key] ? 'password' : 'text'}
                            value={variable.key === 'EXCHANGE_NAME' ? 'woo' : variable.value}
                            onChange={(e) => {
                              if (variable.key !== 'EXCHANGE_NAME') {
                                handleVariableUpdate(variable.key, e.target.value);
                              }
                            }}
                            placeholder={variable.description}
                            className={`bg-gray-700 border-gray-600 text-white pr-10 ${variable.key === 'EXCHANGE_NAME' ? 'opacity-50 cursor-not-allowed' : ''}`}
                            disabled={variable.key === 'EXCHANGE_NAME'}
                          />
                          {variable.isSecret && (
                            <button
                              type="button"
                              onClick={() => toggleSecretVisibility(variable.key)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                            >
                              {showSecrets[variable.key] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-400">{variable.description}</p>
                          {variable.tooltip && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-gray-400 hover:text-gray-200 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-xs bg-gray-900 text-gray-100 border-gray-700">
                                <pre className="text-xs whitespace-pre-wrap">{variable.tooltip}</pre>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Environment File</CardTitle>
          <CardDescription>
            These settings will be written to your .env file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm">
            {variables
              .filter(v => v.value) // Only show variables with values
              .map(v => (
                <div key={v.key} className="text-gray-300">
                  {v.key}={v.isSecret ? '********' : v.value}
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-red-900/20 border-red-900/40">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>
            Irreversible actions that affect your trading data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border border-red-900/40 rounded-lg">
            <div>
              <h4 className="text-white font-medium">Clear All Trading Data</h4>
              <p className="text-sm text-gray-400 mt-1">
                Delete all trades, positions, signals, and performance history
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={async () => {
                if (confirm('Are you sure? This will permanently delete all trading history.')) {
                  try {
                    const response = await fetch('/api/trading/clear', {
                      method: 'DELETE'
                    });
                    
                    if (response.ok) {
                      toast({
                        title: 'Data Cleared',
                        description: 'All trading history has been deleted'
                      });
                      
                      // Refresh the page
                      window.location.reload();
                    } else {
                      throw new Error('Failed to clear data');
                    }
                  } catch {
                    toast({
                      title: 'Error',
                      description: 'Failed to clear trading data',
                      variant: 'destructive'
                    });
                  }
                }
              }}
            >
              Clear All Data
            </Button>
          </div>
          
          <div className="flex items-center justify-between p-4 border border-red-900/40 rounded-lg">
            <div>
              <h4 className="text-white font-medium">Clear Output Files</h4>
              <p className="text-sm text-gray-400 mt-1">
                Delete all signal output JSON files from the output directory
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={async () => {
                if (confirm('Are you sure? This will delete all signal output files.')) {
                  try {
                    const response = await fetch('/api/trading/clear-output', {
                      method: 'DELETE'
                    });
                    
                    if (response.ok) {
                      toast({
                        title: 'Output Files Cleared',
                        description: 'All signal output files have been deleted'
                      });
                    } else {
                      throw new Error('Failed to clear output files');
                    }
                  } catch {
                    toast({
                      title: 'Error',
                      description: 'Failed to clear output files',
                      variant: 'destructive'
                    });
                  }
                }
              }}
            >
              Clear Output Files
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </TooltipProvider>
  );
}

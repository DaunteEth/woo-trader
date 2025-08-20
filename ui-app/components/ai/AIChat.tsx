'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageCircle, X, Send, Bot, User } from 'lucide-react';
import { useTradingData, Position } from '@/hooks/use-trading-data';
import { usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface StrategyConfig {
  name: string;
  enabled: boolean;
  weight: number;
}

interface Signal {
  id: string;
  symbol: string;
  action: string;
  strategy: string;
  strength: number;
  confidence: number;
}

interface Trade {
  id: string;
  symbol: string;
  type: string;
  side: string;
  price: number;
  quantity: number;
  pnl?: number;
  timestamp: string;
}

interface TradingStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  currentBalance: number;
}

interface TradingContext {
  currentPage: string;
  tradingStats: TradingStats | null;
  openPositions: Position[];
  recentSignals: Signal[];
  recentTrades: Trade[];
  strategyConfigs: StrategyConfig[];
  accountBalance: number;
  unrealizedPnL: number;
  realizedPnL: number;
}

export function AIChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { toast } = useToast();
  
  const { positions, signals, trades } = useTradingData();

  useEffect(() => {
    // Add welcome message
    if (messages.length === 0) {
      setMessages([{
        id: '1',
        role: 'assistant',
        content: `Hello! I'm your AI trading assistant powered by GPT-5-Nano. I can help you:

• Analyze your trading performance
• Suggest strategy optimizations
• Explain signals and positions
• Provide market insights
• Help configure your strategies

What would you like to know?`,
        timestamp: new Date()
      }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    const gatherContext = async (): Promise<TradingContext> => {
    // Gather all relevant trading context
    const openPositions = positions; // All positions from useTradingData are open
    const unrealizedPnL = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
    
    // Calculate basic stats from trades
    const winningTrades = trades.filter(t => t.pnl && t.pnl > 0).length;
    const losingTrades = trades.filter(t => t.pnl && t.pnl < 0).length;
    const totalTrades = trades.filter(t => t.pnl !== undefined).length;
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    const context: TradingContext = {
      currentPage: pathname,
      tradingStats: totalTrades > 0 ? {
        totalTrades,
        winningTrades,
        losingTrades,
        winRate: (winningTrades / totalTrades) * 100,
        totalPnL,
        currentBalance: 10000 + totalPnL
      } : null,
      openPositions,
      recentSignals: signals.slice(0, 20),
      recentTrades: trades.slice(0, 20),
      strategyConfigs: [],
      accountBalance: 10000 + totalPnL,
      unrealizedPnL,
      realizedPnL: totalPnL
    };

    // Fetch strategy configurations
    try {
      const response = await fetch('/api/strategies');
      if (response.ok) {
        const strategies = await response.json();
        context.strategyConfigs = strategies;
      }
    } catch (error) {
      console.error('Failed to fetch strategies:', error);
    }

    return context;
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const context = await gatherContext();
      
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          context
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI chat error:', error);
      toast({
        title: 'Error',
        description: 'Failed to get AI response. Please check your API key.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all z-50"
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Modal */}
      {isOpen && (
        <Card className="fixed bottom-24 right-6 w-96 h-[600px] bg-gray-900 border-gray-700 shadow-2xl z-50 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-blue-500" />
                <h3 className="text-white font-semibold">AI Trading Assistant</h3>
              </div>
              <span className="text-xs text-gray-400">Powered by GPT-5-Nano</span>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0">
                      <Bot className="h-8 w-8 text-blue-500 bg-blue-500/10 rounded-full p-1.5" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-100'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <span className="text-xs opacity-70 mt-1 block">
                      {message.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0">
                      <User className="h-8 w-8 text-gray-400 bg-gray-800 rounded-full p-1.5" />
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <Bot className="h-8 w-8 text-blue-500 bg-blue-500/10 rounded-full p-1.5" />
                  <div className="bg-gray-800 rounded-lg p-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-100" />
                      <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-gray-700">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your trading performance..."
                className="bg-gray-800 border-gray-600 text-white"
                disabled={isLoading}
              />
              <Button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                size="icon"
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

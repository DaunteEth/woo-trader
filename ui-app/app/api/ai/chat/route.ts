import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { ConfigService } from '../../../../../src/services/ConfigService';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request.cookies.get('auth-token')?.value || '');
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { messages, context } = await request.json();

    // Get API key from ConfigService
    const configService = ConfigService.getInstance();
    // @ts-expect-error - accessing private property for initialization check
    if (!configService.isInitialized) {
      await configService.initialize();
    }
    
    const openRouterKey = configService.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      return NextResponse.json(
        { error: 'OpenRouter API key not configured' },
        { status: 400 }
      );
    }

    // Build system prompt with trading context
    const systemPrompt = `You are an AI trading assistant for WOO Trading, a high-frequency cryptocurrency trading platform. You have access to the user's current trading data and can provide insights, analysis, and optimization suggestions.

Current Context:
- Page: ${context.currentPage}
- Account Balance: $${context.accountBalance.toFixed(2)}
- Unrealized P&L: $${context.unrealizedPnL.toFixed(2)}
- Realized P&L: $${context.realizedPnL.toFixed(2)}
- Open Positions: ${context.openPositions.length}
- Recent Signals: ${context.recentSignals.length}
- Win Rate: ${context.tradingStats?.winRate || 0}%

Active Strategies:
${context.strategyConfigs.map((s: {name: string; enabled: boolean; weight: number}) => `- ${s.name}: ${s.enabled ? 'Enabled' : 'Disabled'} (Weight: ${s.weight})`).join('\n')}

Recent Performance:
- Total Trades: ${context.tradingStats?.totalTrades || 0}
- Winning Trades: ${context.tradingStats?.winningTrades || 0}
- Losing Trades: ${context.tradingStats?.losingTrades || 0}

Your role is to:
1. Analyze trading performance and identify patterns
2. Suggest strategy parameter optimizations
3. Explain signals and trading decisions
4. Provide risk management recommendations
5. Help with configuration and setup
6. Identify potential issues or opportunities

Be specific, data-driven, and practical in your recommendations. Always consider risk management and capital preservation.`;

    // Add detailed context about recent signals if asked
    const enhancedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // Call OpenRouter API
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': request.headers.get('referer') || 'http://localhost:3005',
        'X-Title': 'WOO Trading Assistant'
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-nano',
        messages: enhancedMessages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: false
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenRouter API error:', error);
      return NextResponse.json(
        { error: 'Failed to get AI response' },
        { status: response.status }
      );
    }

    const data = await response.json();
    const aiResponse = data.choices[0]?.message?.content || 'I apologize, but I was unable to generate a response.';

    return NextResponse.json({ content: aiResponse });
  } catch (error) {
    console.error('AI chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

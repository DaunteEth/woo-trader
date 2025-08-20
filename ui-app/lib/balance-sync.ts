import { apiRequest } from './api';

export async function syncUserBalance(userBalance: number, userId?: string): Promise<void> {
  try {
    const response = await apiRequest('/api/balance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ balance: userBalance, userId }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to sync balance with trading bot');
    }
    
    console.log('Balance synced with trading bot:', userBalance, 'for user:', userId);
  } catch (error) {
    console.error('Failed to sync balance:', error);
    throw error;
  }
}

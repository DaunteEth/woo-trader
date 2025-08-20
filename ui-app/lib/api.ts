// API configuration for the HFT bot

// Get API URL from environment or use default
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3006';

// Helper function to make API requests
export async function apiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_URL}${endpoint}`;
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

// Helper function to make authenticated API requests
export async function authApiRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  // For now, we'll just use the basic apiRequest
  // In the future, we can add authentication headers here
  return apiRequest(endpoint, options);
}

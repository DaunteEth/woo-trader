/** @type {import('next').NextConfig} */
const nextConfig = {
  // Set the custom port
  serverRuntimeConfig: {
    port: 3005
  },
  
  // Other Next.js config options
  reactStrictMode: true,
  
  // Environment variables that should be available in the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3006'
  },
  
  // Ensure environment variables are available server-side
  experimental: {
    // Force Next.js to read .env files on every request in development
    serverActions: {
      bodySizeLimit: '2mb'
    }
  }
};

export default nextConfig;

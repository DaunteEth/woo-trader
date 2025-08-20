#!/bin/bash

# Development Start Script (Non-Docker)
# Use this for local development without Docker
# For production, use: docker-compose up

echo "🚀 Starting High-Frequency Trading Bot Services..."

# Kill any existing processes on our ports
echo "📍 Cleaning up existing processes..."
lsof -ti:3006 | xargs kill -9 2>/dev/null
lsof -ti:3005    | xargs kill -9 2>/dev/null

# Start the HFT bot backend server
echo "📊 Starting HFT Bot Server on port 3006..."
npm run server &
BOT_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 3

# Start the UI frontend
echo "🎨 Starting UI Frontend on port 3005..."
cd ui-app && npm run dev &
UI_PID=$!

# Function to handle cleanup
cleanup() {
    echo -e "\n🛑 Shutting down services..."
    kill $BOT_PID 2>/dev/null
    kill $UI_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

echo -e "\n✅ All services started successfully!"
echo "📊 HFT Bot Server: http://localhost:3006"
echo "🎨 UI Frontend: http://localhost:3005"
echo -e "\nPress Ctrl+C to stop all services...\n"

# Keep script running
wait

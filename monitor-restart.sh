#!/bin/sh

# This script monitors for restart requests and handles graceful restarts
# It runs alongside the main application in the Docker container

while true; do
  if [ -f "/app/restart-requested.marker" ]; then
    echo "🔄 Restart requested, gracefully shutting down..."
    
    # Remove the marker
    rm -f "/app/restart-requested.marker"
    
    # Send SIGTERM to the main process to trigger graceful shutdown
    pkill -TERM -f "npm run server"
    
    # Wait a bit for clean shutdown
    sleep 5
    
    # The container restart policy will handle restarting
    exit 0
  fi
  
  # Check every 5 seconds
  sleep 5
done

#!/bin/sh

echo "🚀 Starting WOO Trading Bot..."

# Ensure correct environment variables
export NEXT_PUBLIC_API_URL="http://localhost:3006"

# Setup environment variables
echo "📝 Setting up environment variables..."

# Check if .env exists in the container (mounted via docker-compose)
if [ -f /app/.env ]; then
  echo "✅ Found .env file"
  # Create a copy for the UI app, ensuring WebSocket URLs are correct
  cp /app/.env /app/ui-app/.env
  
  # Append WebSocket URLs if not already present
  if ! grep -q "NEXT_PUBLIC_API_URL" /app/ui-app/.env; then
    echo "NEXT_PUBLIC_API_URL=\"http://localhost:3006\"" >> /app/ui-app/.env
  fi
else
  # If no .env file exists, check for .env.example and warn the user
  if [ -f /app/.env.example ]; then
    echo "⚠️  Warning: No .env file found. Please create one based on .env.example"
    echo "📋 Creating minimal .env for UI with WebSocket URLs only..."
    cat > /app/ui-app/.env <<EOF
NEXT_PUBLIC_API_URL="http://localhost:3006"
DATABASE_URL="postgresql://postgres:password@postgres:5432/hft_trading?schema=public"
JWT_SECRET="development-secret-please-change-in-production"
EOF
  else
    echo "❌ Error: No .env or .env.example file found!"
    exit 1
  fi
fi

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h postgres -p 5432 -U postgres; do
  echo "PostgreSQL is unavailable - sleeping"
  sleep 2
done
echo "✅ PostgreSQL is ready!"

# Run database migrations
cd /app/ui-app
echo "📦 Running database migrations..."
npx prisma generate
npx prisma migrate deploy || npx prisma db push

# Run database seed
echo "🌱 Seeding database..."
npx prisma db seed || echo "Database already seeded"

# Clear old output files if requested
if [ "${CLEAR_OUTPUT_ON_START}" = "true" ]; then
  echo "🧹 Clearing old output files..."
  rm -f /app/output/*.json
fi

# Ensure output directory exists
mkdir -p /app/output

# Start the frontend in the background on port 3005
echo "🎨 Starting frontend UI on port 3005..."
PORT=3005 NEXT_PUBLIC_API_URL="http://localhost:3006" npm run start &

# Start the restart monitor in the background
echo "🔍 Starting restart monitor..."
chmod +x /app/monitor-restart.sh
/app/monitor-restart.sh &

# Start the backend
cd /app
echo "🔧 Starting backend server..."
# Run the compiled JavaScript, not TypeScript
node dist/server.js

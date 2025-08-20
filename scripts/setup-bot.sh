#!/bin/bash

echo "🚀 Setting up HFT Trading Bot..."

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs output

# Copy env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Setting up environment..."
    cp env.txt .env
    echo "✅ Environment file created"
fi

# Note: ui-app will use the main .env file

# Build backend
echo "🔨 Building backend..."
npm run build

# Setup database
echo "💾 Setting up database..."
cd ui-app
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
cd ..

# Create system user if it doesn't exist
echo "👤 Creating system user..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setup() {
  try {
    // Check if system user exists
    let user = await prisma.user.findFirst({
      where: { email: 'system@hftbot.local' }
    });
    
    if (!user) {
      // Create system user
      user = await prisma.user.create({
        data: {
          email: 'system@hftbot.local',
          username: 'system-hft-bot',
          password: 'not-used', // System user doesn't need password
          balance: 10000
        }
      });
      console.log('System user created');
    }
    
    // Create default simulation if it doesn't exist
    const simulation = await prisma.simulation.findFirst({
      where: { userId: user.id }
    });
    
    if (!simulation) {
      const newSim = await prisma.simulation.create({
        data: {
          name: 'Default Simulation',
          description: 'Default paper trading simulation',
          balance: 10000,
          startDate: new Date(),
          strategy: 'debt_avalanche',
          userId: user.id,
          strategyConfigs: {
            create: [
              {
                name: 'Scalping',
                enabled: true,
                weight: 0.7,
                followOwnSignals: true,
                followAISignals: true,
                stopLossPercent: 0.3,
                takeProfitPercent: 0.6,
                emaPeriodFast: 9,
                emaPeriodSlow: 21,
                rsiPeriod: 7,
                rsiOverbought: 70,
                rsiOversold: 30,
                bbPeriod: 20,
                bbStdDev: 2,
                minSpread: 0.01,
                maxSpread: 0.1
              },
              {
                name: 'Momentum',
                enabled: true,
                weight: 0.3,
                followOwnSignals: true,
                followAISignals: true,
                stopLossPercent: 0.4,
                takeProfitPercent: 0.8,
                vwapEnabled: true,
                bbBreakoutStdDev: 2,
                momentumPeriod: 10,
                volumeMultiplier: 1.5,
                rsiPeriod: 14,
                rsiMomentumThreshold: 60,
                trailingStopPercent: 0.3
              },
              {
                name: 'Arbitrage',
                enabled: false,
                weight: 0,
                followOwnSignals: false,
                followAISignals: false,
                minSpreadPercent: 0.5,
                maxSpreadPercent: 5,
                executionDelay: 100,
                feePercent: 0.1,
                minProfitPercent: 0.2
              }
            ]
          }
        }
      });
      
      // Set as active simulation
      await prisma.userSettings.upsert({
        where: { userId: user.id },
        update: { activeSimulationId: newSim.id },
        create: {
          userId: user.id,
          activeSimulationId: newSim.id,
          defaultToSimulation: true
        }
      });
      
      console.log('Default simulation created and activated');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Setup failed:', error);
    process.exit(1);
  }
}

setup();
"

echo "✅ Setup complete!"
echo ""
echo "To start the bot:"
echo "  npm run server"
echo ""
echo "To start the UI:"
echo "  cd ui-app && npm run dev"

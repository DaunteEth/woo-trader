import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');
  
  // Create system user for bot
  const systemUser = await prisma.user.upsert({
    where: { email: 'system@hftbot.local' },
    update: {},
    create: {
      id: 'system-hft-bot',
      email: 'system@hftbot.local',
      password: await bcrypt.hash('system-password-not-for-login', 10),
      name: 'HFT Bot System',
    },
  });
  console.log('✅ System user created:', systemUser.email);
  
  // Create default admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@hftbot.local' },
    update: {},
    create: {
      email: 'admin@hftbot.local',
      password: await bcrypt.hash('admin123', 10),
      name: 'Admin User',
    },
  });
  console.log('✅ Admin user created:', adminUser.email);
  
  // Create default simulation for system user
  const defaultSimulation = await prisma.simulation.upsert({
    where: { 
      userId_name: {
        userId: systemUser.id,
        name: 'Default System Simulation'
      }
    },
    update: {},
    create: {
      userId: systemUser.id,
      name: 'Default System Simulation',
      description: 'Default simulation for HFT bot operations',
      balance: 10000,
      isActive: true,
    },
  });
  console.log('✅ Default simulation created:', defaultSimulation.name);
  
  // Create performance stats for the simulation
  await prisma.performanceStats.upsert({
    where: { simulationId: defaultSimulation.id },
    update: {},
    create: {
      simulationId: defaultSimulation.id,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
    },
  });
  console.log('✅ Performance stats initialized');
  
  // Create user settings for system user
  await prisma.userSettings.upsert({
    where: { userId: systemUser.id },
    update: {},
    create: {
      userId: systemUser.id,
      activeSimulationId: defaultSimulation.id,
      defaultToSimulation: true,
      envVariables: JSON.stringify([]),
    },
  });
  console.log('✅ User settings created');
  
  // Create admin user settings
  await prisma.userSettings.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: {
      userId: adminUser.id,
      defaultToSimulation: true,
      envVariables: JSON.stringify([]),
    },
  });
  console.log('✅ Admin user settings created');
  
  // Create admin's default simulation
  const adminSimulation = await prisma.simulation.upsert({
    where: { 
      userId_name: {
        userId: adminUser.id,
        name: 'Default Simulation'
      }
    },
    update: {},
    create: {
      userId: adminUser.id,
      name: 'Default Simulation',
      description: 'Auto-generated default simulation',
      balance: 10000,
      isActive: true,
    },
  });
  
  // Create performance stats for admin simulation
  await prisma.performanceStats.upsert({
    where: { simulationId: adminSimulation.id },
    update: {},
    create: {
      simulationId: adminSimulation.id,
    },
  });
  
  // Create default strategy configurations
  const strategyConfigs = [
    {
      simulationId: adminSimulation.id,
      name: 'Scalping',
      enabled: true,
      weight: 0.6,
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      stopLossPercent: 0.003,
      takeProfitPercent: 0.006,
      emaPeriodFast: 9,
      emaPeriodSlow: 21,
      rsiPeriod: 9,
      rsiOverbought: 75,
      rsiOversold: 25,
      bbPeriod: 20,
      bbStdDev: 2,
      minSpread: 0.0001,
      maxSpread: 0.001,
    },
    {
      simulationId: adminSimulation.id,
      name: 'Momentum',
      enabled: true,
      weight: 0.3,
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      stopLossPercent: 0.01,
      takeProfitPercent: 0.02,
      vwapEnabled: true,
      bbBreakoutStdDev: 2.0,
      momentumPeriod: 14,
      volumeMultiplier: 1.5,
      rsiMomentumThreshold: 60,
      trailingStopPercent: 0.005,
      rsiPeriod: 14,
    },
    {
      simulationId: adminSimulation.id,
      name: 'Arbitrage',
      enabled: false,
      weight: 0.1,
      followOwnSignals: true,
      followAISignals: true,
      aiExecutionEnabled: false,
      stopLossPercent: 0.002,
      takeProfitPercent: 0.004,
      minSpreadPercent: 0.1,
      maxSpreadPercent: 2.0,
      executionDelay: 100,
      feePercent: 0.075,
      minProfitPercent: 0.05,
    },
    {
      simulationId: adminSimulation.id,
      name: 'FundingArbitrage',
      enabled: false,
      weight: 0.0,
      followOwnSignals: true,
      followAISignals: false,
      aiExecutionEnabled: false,
      stopLossPercent: 0.005,
      takeProfitPercent: 0.01,
      // Funding arbitrage uses defaults from strategy
    },
    {
      simulationId: adminSimulation.id,
      name: 'OrderBookArbitrage',
      enabled: false,
      weight: 0.0,
      followOwnSignals: true,
      followAISignals: false,
      aiExecutionEnabled: false,
      stopLossPercent: 0.002,
      takeProfitPercent: 0.004,
      // Order book arbitrage uses defaults from strategy
    },
  ];
  
  for (const config of strategyConfigs) {
    await prisma.strategyConfig.upsert({
      where: { 
        simulationId_name: {
          simulationId: config.simulationId,
          name: config.name
        }
      },
      update: {},
      create: config,
    });
    console.log(`✅ Strategy config created: ${config.name}`);
  }
  
  console.log('🎉 Database seeding completed successfully!');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { HFTBotCore } from './HFTBotCore';
import { validateConfig } from './utils/config';
import { createLogger } from './utils/logger';
import { ConfigService } from './services/ConfigService';
import { prisma } from './lib/db';
// import { Signal, MarketData, Position } from './types/trading';
// import { HFTBot } from './HFTBot';

const logger = createLogger('Server');

export class TradingServer {
  private app: express.Application;
  private httpServer: any;
  private io: Server;
  private bot: HFTBotCore;
  private port: number;

  constructor(port: number = 3006) {
    this.port = port;
    this.app = express();
    
    // Use HTTP/1.1 with Express.js for compatibility
    this.httpServer = createServer(this.app);
    logger.info('HTTP/1.1 server created successfully');
    
    this.io = new Server(this.httpServer, {
      cors: {
        origin: ['http://localhost:3005', 'http://localhost:5002', 'https://localhost:3005', 'https://localhost:5002'],
        credentials: true,
        methods: ['GET', 'POST']
      },
      allowEIO3: true, // Enable Engine.IO v3 compatibility
      transports: ['websocket', 'polling'] // Enable both transports
    });
    this.bot = new HFTBotCore();

    logger.info('Setting up middleware...');
    this.setupMiddleware();
    logger.info('Middleware setup complete.');

    logger.info('Setting up routes...');
    this.setupRoutes();
    logger.info('Routes setup complete.');

    logger.info('Setting up Socket.io handlers...');
    this.setupSocketHandlers();
    logger.info('Socket.io handlers setup complete.');

    logger.info('Server initialization complete.');
  }

  private setupMiddleware() {
    this.app.use(cors({
      origin: ['http://localhost:3005', 'http://localhost:5002'],
      credentials: true
    }));
    this.app.use(express.json());
  }

  private setupRoutes() {
    // Temporary route to list all registered routes
    this.app.get('/api/routes', (_req, res) => {
      const routes = this.app._router.stack
        .filter((r: any) => r.route)
        .map((r: any) => r.route.path);
      res.json(routes);
    });

    // Debug route to verify Socket.io
    this.app.get('/socket-debug', (_req, res) => {
      res.json({ 
        socketIOAttached: !!this.io,
        engineAttached: !!this.io?.engine,
        path: this.io?.path,
        description: 'Socket.io debug info'
      });
    });

    // Test route for Socket.io availability
    this.app.get('/test-socket', (_req, res) => {
      const clientCount = this.io.engine.clientsCount;
      res.json({
        message: 'Socket.io is working',
        clients: clientCount,
        path: this.io.path()
      });
    });

    // Health check with data freshness
    this.app.get('/health', (_req, res) => {
      const status = this.bot.getStatus();
      
      res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        botRunning: status.isRunning,
        dataFreshness: (status as any).market?.dataFreshness || {},
        cycleInterval: 6000, // 6 seconds
        lastUpdate: Date.now()
      });
    });
    
    // Get current environment configuration
    this.app.get('/api/config/env', (_req, res) => {
      const configService = ConfigService.getInstance();
      const config = configService.getAll();
      
      // Filter out sensitive system variables
      const filteredConfig: Record<string, string> = {};
      const allowedKeys = [
        'WOOX_API_KEY', 'WOOX_API_SECRET', 'WOOX_APP_ID',
        'EXCHANGE_TESTNET', 'TRADING_PAIRS', 'TRADING_MODE',
        'JWT_SECRET', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY',
        'AI_MODEL', 'RISK_PER_TRADE', 'MAX_POSITIONS', 'LEVERAGE'
      ];
      
      for (const key of allowedKeys) {
        if (config[key]) {
          filteredConfig[key] = config[key];
        }
      }
      
      res.json(filteredConfig);
    });

    // Bot status
    this.app.get('/api/status', (_req, res) => {
      const status = this.bot.getStatus();
      res.json(status);
    });
    
    // Get recent trades
    this.app.get('/api/trades', (_req, res) => {
      const trades = this.bot.getTrades();
      res.json(trades);
    });

    // Start bot
    this.app.post('/api/start', async (req, res) => {
      try {
        const { userId, simulationId } = req.body;
        
        // Set userId and simulationId before starting
        if (userId) {
          this.bot.setUserId(userId);
        }
        if (simulationId) {
          this.bot.setSimulationId(simulationId);
          // Reinitialize strategies with the simulation context
          await this.bot.reinitializeStrategies();
        }
        
        await this.bot.start();
        res.json({ success: true, message: 'Bot started' });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Stop bot
    this.app.post('/api/stop', async (_req, res) => {
      try {
        await this.bot.stop();
        res.json({ success: true, message: 'Bot stopped' });
      } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get strategies - Load from database
    this.app.get('/api/strategies', async (_req, res) => {
      try {
        const simulationId = this.bot.getSimulationId();
        if (!simulationId) {
          return res.status(400).json({ error: 'No active simulation' });
        }
        
        // Load strategy configurations from database
        const { loadStrategyConfigs } = await import('./utils/strategyLoader');
        const strategies = await loadStrategyConfigs(simulationId);
        
        return res.json(strategies);
      } catch (error: any) {
        logger.error('Failed to load strategies', error);
        return res.status(500).json({ error: error.message });
      }
    });

    // Update strategies - Save to database
    this.app.post('/api/strategies', async (req, res) => {
      try {
        const simulationId = this.bot.getSimulationId();
        if (!simulationId) {
          return res.status(400).json({ error: 'No active simulation' });
        }
        
        const strategies = req.body;
        if (!Array.isArray(strategies)) {
          return res.status(400).json({ error: 'Invalid strategies data' });
        }
        
        // Update each strategy in database
        const { prisma } = await import('./lib/db');
        
        for (const strategy of strategies) {
          const updateData: any = {
            enabled: strategy.enabled,
            weight: strategy.weight,
            followOwnSignals: strategy.followOwnSignals ?? true,
            followAISignals: strategy.followAISignals ?? true,
            aiExecutionEnabled: strategy.aiExecutionEnabled ?? false
          };
          
          // Add all strategy-specific parameters
          Object.keys(strategy).forEach(key => {
            if (!['id', 'name', 'enabled', 'weight', 'followOwnSignals', 'followAISignals', 'aiExecutionEnabled'].includes(key)) {
              updateData[key] = strategy[key];
            }
          });
          
          await prisma.strategyConfig.upsert({
            where: {
              simulationId_name: {
                simulationId: simulationId,
                name: strategy.name
              }
            },
            update: updateData,
            create: {
              simulationId: simulationId,
              name: strategy.name,
              ...updateData
            }
          });
        }
        
        // Reinitialize signal generator with new configs
        await this.bot.reinitializeStrategies();
        
        return res.json({ success: true });
      } catch (error: any) {
        logger.error('Failed to update strategies', error);
        return res.status(500).json({ error: error.message });
      }
    });

    // Get positions
    this.app.get('/api/positions', (_req, res) => {
      const positions = this.bot.getPositions();
      res.json(positions);
    });

    // Get signals
    this.app.get('/api/signals', (_req, res) => {
      const signals = this.bot.getSignals();
      res.json(signals);
    });

    // Get market data for current prices
    this.app.get('/api/market-data', (_req, res) => {
      const marketData = this.bot.getMarketData();
      res.json(marketData);
    });
    
    // Update balance
    this.app.post('/api/balance', async (req, res) => {
      try {
        const { balance, userId } = req.body;
        if (typeof balance !== 'number' || balance < 0) {
          return res.status(400).json({ error: 'Invalid balance' });
        }
        
        if (userId) {
          this.bot.setUserId(userId);
        }
        
        this.bot.updateBalance(balance);
        return res.json({ success: true, balance });
      } catch (error: any) {
        return res.status(500).json({ error: error.message });
      }
    });
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      logger.info('Client connected', { id: socket.id });

      // Send initial status
      socket.emit('status', this.bot.getStatus());

      // Subscribe to bot events with enhanced data freshness
      const handleSignal = (data: any) => socket.emit('signals', {
        ...data,
        serverTime: Date.now()
      });
      
      const handleTrade = (data: any) => socket.emit('trade', {
        ...data,
        serverTime: Date.now()
      });
      
      const handleStatus = (data: any) => socket.emit('status', {
        ...data,
        serverTime: Date.now(),
        cycleInterval: 6000 // 6 seconds
      });
      
      const handleMarketData = (data: any) => socket.emit('marketData', {
        ...data,
        serverTime: Date.now(),
        dataQuality: data.dataAge < 5000 ? 'fresh' : data.dataAge < 30000 ? 'acceptable' : 'stale'
      });

      this.bot.on('signal', handleSignal);
      this.bot.on('trade', handleTrade);
      this.bot.on('statusUpdate', handleStatus);
      this.bot.on('marketData', handleMarketData);

      socket.on('disconnect', () => {
        logger.info('Client disconnected', { id: socket.id });
        
        // Unsubscribe from bot events
        this.bot.off('signal', handleSignal);
        this.bot.off('trade', handleTrade);
        this.bot.off('statusUpdate', handleStatus);
        this.bot.off('marketData', handleMarketData);
      });
    });
  }

  async start() {
    try {
      // Initialize configuration from database first
      const configService = ConfigService.getInstance();
      await configService.initialize();
      
      // Validate configuration
      validateConfig();
      
      // Initialize bot
      await this.bot.initialize();
      
      // Set up simulation context
      try {
        // Find system user or admin user
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { email: 'system@hftbot.local' },
              { email: 'admin@budgefy.app' }
            ]
          }
        });
        
        if (user) {
          this.bot.setUserId(user.id);
          
          // Find active simulation
          const settings = await prisma.userSettings.findUnique({
            where: { userId: user.id }
          });
          
          if (settings?.activeSimulationId) {
            this.bot.setSimulationId(settings.activeSimulationId);
            // Reinitialize strategies with simulation context
            await this.bot.reinitializeStrategies();
            logger.info(`Bot initialized with simulation: ${settings.activeSimulationId}`);
          }
        }
      } catch (error) {
        logger.warn('Failed to load simulation context', error);
      }
      
      // Start server
      this.httpServer.listen(this.port, () => {
        logger.info(`Trading server running on port ${this.port}`);
        logger.info('Configuration source:', configService.get('CONFIG_SOURCE', 'environment'));
      });
      
      return true;
    } catch (error) {
      logger.error('Failed to start server', error);
      throw error;
    }
  }

  async stop() {
    logger.info('Stopping server...');
    await this.bot.stop();
    
    return new Promise<void>((resolve) => {
      this.httpServer.close(() => {
        logger.info('Server stopped');
        resolve();
      });
    });
  }
}

// Run if called directly
if (require.main === module) {
  const server = new TradingServer();
  
  server.start().catch((error) => {
    logger.error('Failed to start server', error);
    process.exit(1);
  });
  
  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down...');
    await server.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down...');
    await server.stop();
    process.exit(0);
  });
}

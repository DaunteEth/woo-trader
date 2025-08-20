import { prisma } from '../lib/db';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

interface ConfigMap {
  [key: string]: string | undefined;
}

export class ConfigService {
  private static instance: ConfigService;
  private logger = createLogger('ConfigService');
  private config: ConfigMap = {};
  private userId: string = 'system-hft-bot';
  
  private constructor() {}
  
  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }
  
  async initialize(userId?: string): Promise<void> {
    if (userId) {
      this.userId = userId;
    }
    
    try {
      // First, load from .env file
      this.loadEnvFiles();
      
      // Then, override with database settings
      await this.loadDatabaseSettings();
      
      this.logger.info('Configuration loaded successfully', {
        source: this.config.CONFIG_SOURCE || 'mixed'
      });
    } catch (error) {
      this.logger.error('Failed to initialize configuration', error);
      throw error;
    }
  }
  
  private loadEnvFiles(): void {
    // Priority order: .env.local > .env.docker > .env.backup > .env
    const envFiles = [
      '.env.local',
      '.env.docker', 
      '.env.backup',
      '.env'
    ];
    
    for (const filename of envFiles) {
      const envPath = path.resolve(process.cwd(), filename);
      if (fs.existsSync(envPath)) {
        const result = dotenv.config({ path: envPath });
        if (result.parsed) {
          Object.assign(this.config, result.parsed);
          this.logger.debug(`Loaded ${filename} file`);
        }
      }
    }
    
    // Also include process.env (highest priority for env vars)
    Object.assign(this.config, process.env);
  }
  
  private async loadDatabaseSettings(): Promise<void> {
    try {
      // Find the user
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { id: this.userId },
            { email: 'admin@budgefy.app' },
            { email: 'system@hftbot.local' }
          ]
        }
      });
      
      if (!user) {
        this.logger.warn('No user found for database settings');
        return;
      }
      
      // Get user settings
      const settings = await prisma.userSettings.findUnique({
        where: { userId: user.id }
      });
      
      if (!settings) {
        this.logger.info('No user settings found in database');
        return;
      }
      
      // Parse and apply environment variables from database
      if (settings.envVariables) {
        try {
          const dbVars = JSON.parse(settings.envVariables);
          const decryptedVars: ConfigMap = {};
          
          // Decrypt and map variables
          for (const variable of dbVars) {
            if (variable.value) {
              // Map database keys to expected env var names
              const mappedKey = this.mapDatabaseKey(variable.key);
              decryptedVars[mappedKey] = variable.isSecret 
                ? this.decrypt(variable.value)
                : variable.value;
            }
          }
          
          // Override with database values
          Object.assign(this.config, decryptedVars);
          this.config.CONFIG_SOURCE = 'database';
          
          this.logger.info('Loaded configuration from database', {
            keys: Object.keys(decryptedVars).filter(k => !k.includes('SECRET') && !k.includes('KEY'))
          });
        } catch (error) {
          this.logger.error('Failed to parse database env variables', error);
        }
      }
      
      // Apply raw env content if available (backward compatibility)
      if (settings.envContent) {
        const lines = settings.envContent.split('\n');
        for (const line of lines) {
          const [key, ...valueParts] = line.split('=');
          if (key && valueParts.length > 0) {
            this.config[key.trim()] = valueParts.join('=').trim();
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to load database settings', error);
    }
  }
  
  private mapDatabaseKey(dbKey: string): string {
    // Map database keys to actual env var names
    const keyMap: { [key: string]: string } = {
      'EXCHANGE_API_KEY': 'WOOX_API_KEY',
      'EXCHANGE_API_SECRET': 'WOOX_API_SECRET',
      'EXCHANGE_APP_ID': 'WOOX_APP_ID',
      'API_SECRET': 'JWT_SECRET'
    };
    
    return keyMap[dbKey] || dbKey;
  }
  
  private decrypt(encryptedText: string): string {
    try {
      const crypto = require('crypto');
      const algorithm = 'aes-256-cbc';
      const key = crypto.createHash('sha256')
        .update(process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!')
        .digest();
      
      const parts = encryptedText.split(':');
      if (parts.length !== 2) return encryptedText;
      
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = Buffer.from(parts[1], 'hex');
      
      const decipher = crypto.createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString();
    } catch (error) {
      this.logger.error('Decryption failed', error);
      return encryptedText;
    }
  }
  
  get(key: string, defaultValue?: string): string | undefined {
    return this.config[key] || defaultValue;
  }
  
  getNumber(key: string, defaultValue: number): number {
    const value = this.config[key];
    if (value === undefined) return defaultValue;
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }
  
  getBoolean(key: string, defaultValue: boolean): boolean {
    const value = this.config[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  }
  
  getAll(): ConfigMap {
    // Return a copy to prevent external modification
    return { ...this.config };
  }
  
  // Get trading-specific configuration
  getTradingConfig() {
    return {
      mode: this.get('TRADING_MODE', 'paper') as 'paper' | 'live',
      riskPerTrade: this.getNumber('RISK_PER_TRADE', 0.02),
      maxPositions: this.getNumber('MAX_POSITIONS', 3),
      leverage: this.getNumber('LEVERAGE', 1),
      pairs: this.get('TRADING_PAIRS', 'PERP_BTC_USDT,PERP_ETH_USDT')?.split(',') || [],
      exchange: {
        name: 'woo',
        apiKey: this.get('WOOX_API_KEY', ''),
        apiSecret: this.get('WOOX_API_SECRET', ''),
        appId: this.get('WOOX_APP_ID', ''),
        testnet: this.getBoolean('EXCHANGE_TESTNET', true)
      },
      ai: {
        openaiKey: this.get('OPENAI_API_KEY', ''),
        openrouterKey: this.get('OPENROUTER_API_KEY', ''),
        model: this.get('AI_MODEL', 'openai/gpt-5-nano'),
        enabled: this.getBoolean('AI_ENABLED', true)
      }
    };
  }
}

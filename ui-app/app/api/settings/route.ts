import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { prisma } from '@/lib/db';
import crypto from 'crypto';

// Simple encryption for sensitive data
const algorithm = 'aes-256-cbc';
const getEncryptionKey = () => {
  const key = process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key!!';
  return crypto.createHash('sha256').update(key).digest();
};

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, getEncryptionKey(), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = Buffer.from(parts[1], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch {
    return text; // Return original if decryption fails
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user settings
    const settings = await prisma.userSettings.findUnique({
      where: { userId: user.id }
    });

    // Get variables from settings or initialize from environment
    let variables = [];
    
    if (settings && settings.envVariables) {
      variables = JSON.parse(settings.envVariables);
    }
    
    // Check current environment variables and merge
    // Initialize from environment variables only if no saved settings exist
    const hasSettings = settings && settings.envVariables && JSON.parse(settings.envVariables).length > 0;
    
    const envVars = [
      // Exchange Configuration
      { key: 'EXCHANGE_NAME', value: hasSettings ? '' : 'woo', isSecret: false, category: 'exchange' },
      { key: 'EXCHANGE_API_KEY', value: hasSettings ? '' : (process.env.WOOX_API_KEY || ''), isSecret: true, category: 'exchange' },
      { key: 'EXCHANGE_API_SECRET', value: hasSettings ? '' : (process.env.WOOX_API_SECRET || ''), isSecret: true, category: 'exchange' },
      { key: 'EXCHANGE_APP_ID', value: hasSettings ? '' : (process.env.WOOX_APP_ID || ''), isSecret: false, category: 'exchange' },
      { key: 'EXCHANGE_TESTNET', value: hasSettings ? '' : 'true', isSecret: false, category: 'exchange' },
      { key: 'TRADING_PAIRS', value: hasSettings ? '' : 'PERP_BTC_USDT,PERP_ETH_USDT', isSecret: false, category: 'exchange' },
      { key: 'TRADING_MODE', value: hasSettings ? '' : (process.env.TRADING_MODE || 'paper'), isSecret: false, category: 'exchange' },
      // API Configuration
      { key: 'API_PORT', value: hasSettings ? '' : '3006', isSecret: false, category: 'api' },
      { key: 'API_SECRET', value: hasSettings ? '' : (process.env.JWT_SECRET || ''), isSecret: true, category: 'api' },
      // Security
      { key: 'JWT_SECRET', value: hasSettings ? '' : (process.env.JWT_SECRET || ''), isSecret: true, category: 'security' },
      // AI Services
      { key: 'OPENAI_API_KEY', value: hasSettings ? '' : (process.env.OPENAI_API_KEY || ''), isSecret: true, category: 'ai' },
      { key: 'OPENROUTER_API_KEY', value: hasSettings ? '' : (process.env.OPENROUTER_API_KEY || ''), isSecret: true, category: 'ai' },
    ];
    
    // Merge with saved variables, preferring saved values
    const mergedVariables = envVars.map(envVar => {
      const savedVar = variables.find((v: {key: string; value: string; isSecret?: boolean}) => v.key === envVar.key);
      if (savedVar) {
        return {
          ...savedVar,
          value: savedVar.isSecret ? decrypt(savedVar.value) : savedVar.value
        };
      }
      return envVar;
    });

    return NextResponse.json({ variables: mergedVariables });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await getUserFromToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { variables } = await request.json();

    // Encrypt sensitive values
    const encryptedVariables = variables.map((v: {key: string; value: string; isSecret?: boolean}) => ({
      ...v,
      value: v.isSecret && v.value ? encrypt(v.value) : v.value
    }));

    // Update user settings
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {
        envVariables: JSON.stringify(encryptedVariables)
      },
      create: {
        userId: user.id,
        envVariables: JSON.stringify(encryptedVariables),
        defaultToSimulation: true
      }
    });

    // Also write to a temporary env file that the bot can read
    // In production, you'd want to use a more secure method
    const envContent = variables
      .filter((v: {key: string; value: string}) => v.value)
      .map((v: {key: string; value: string}) => `${v.key}=${v.value}`)
      .join('\n');

    // Store in database for bot to read
    await prisma.userSettings.update({
      where: { userId: user.id },
      data: {
        envContent
      }
    });

    // Trigger bot restart if running in Docker
    if (process.env.IS_DOCKER === 'true') {
      try {
        // Create a restart marker file that the container can detect
        const fs = await import('fs/promises');
        const path = await import('path');
        const restartMarkerPath = path.join(process.cwd(), 'restart-requested.marker');
        await fs.writeFile(restartMarkerPath, new Date().toISOString());
        
        // The container health check will detect this and restart the service
        console.log('Restart marker created, bot will restart automatically');
      } catch (error) {
        console.error('Failed to create restart marker:', error);
      }
    }

    return NextResponse.json({ success: true, message: 'Settings saved. Bot will restart automatically to apply changes.' });
  } catch (error) {
    console.error('Failed to save settings:', error);
    return NextResponse.json(
      { error: 'Failed to save settings' },
      { status: 500 }
    );
  }
}

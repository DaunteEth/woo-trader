# WOO X High-Frequency Trading Bot

A professional high-frequency trading bot for WOO X exchange with advanced strategies, AI integration, and real-time market analysis.

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- WOO X API credentials (optional for paper trading)

### Deploy with One Command

```bash
# Clone or download the docker-compose.yml file
curl -O https://raw.githubusercontent.com/your-repo/freq-trading/main/docker-compose.yml
docker-compose up -d
```

That's it! The bot will:
- Automatically pull the latest Docker image
- Set up PostgreSQL database
- Set up Redis cache
- Start the trading bot in paper trading mode
- Launch the web interface

### Access the Bot

- **Web Interface**: http://localhost:3005
- **API**: http://localhost:3006
- **Default Login**: admin / password

## 🔧 Configuration

### Environment Variables

Create a `.env` file to customize settings:

```bash
# WOO X API Configuration
WOOX_API_KEY=your_api_key_here
WOOX_API_SECRET=your_api_secret_here
WOOX_APP_ID=your_app_id_here

# Trading Configuration
TRADING_MODE=paper              # paper or live
EXCHANGE_TESTNET=true          # true for testnet, false for mainnet
TRADING_PAIRS=PERP_BTC_USDT,PERP_ETH_USDT
RISK_PER_TRADE=0.02            # 2% risk per trade
MAX_POSITIONS=3                # Maximum concurrent positions
LEVERAGE=1                     # Leverage multiplier

# AI Configuration (Optional)
OPENAI_API_KEY=your_openai_key
AI_ENABLED=true

# Security (Generate unique values)
JWT_SECRET=your_unique_jwt_secret
ENCRYPTION_KEY=your_32_char_encryption_key
SESSION_SECRET=your_session_secret
```

### Trading Modes

1. **Paper Trading** (Default): Safe simulation mode with virtual funds
2. **Live Trading**: Real trading with actual funds (requires API keys)

## 📊 Features

### Trading Strategies
- **Scalping**: High-frequency micro-profit trades
- **Momentum**: Trend-following strategies
- **Arbitrage**: Price difference exploitation
- **Market Making**: Liquidity provision strategies

### Advanced Features
- Real-time market data processing
- AI-enhanced signal generation
- Risk management and position sizing
- Performance analytics and reporting
- Web-based dashboard and controls
- Simulation mode for strategy testing

### Technical Indicators
- EMA (Exponential Moving Average)
- RSI (Relative Strength Index)
- Bollinger Bands
- VWAP (Volume Weighted Average Price)
- Custom momentum indicators

## 🛠️ Management Commands

```bash
# View logs
docker-compose logs -f

# Stop the bot
docker-compose stop

# Restart the bot
docker-compose restart

# Update to latest version
docker-compose pull
docker-compose up -d

# Remove all containers and data
docker-compose down -v
```

## 📈 Web Interface

The web dashboard provides:

- **Live Trading Dashboard**: Real-time positions, PnL, and market data
- **Strategy Management**: Enable/disable strategies and adjust parameters
- **Signal Monitoring**: View and analyze trading signals
- **Performance Analytics**: Track trading performance and statistics
- **Risk Management**: Monitor and adjust risk parameters
- **Simulation Mode**: Test strategies without real money

## 🔒 Security

- All sensitive data is stored in environment variables
- Database credentials are containerized
- API keys are never logged or exposed
- Secure session management
- Default paper trading mode for safety

## ⚙️ Advanced Configuration

### Custom Strategies

Strategies can be configured through the web interface or environment variables:

```bash
# Strategy-specific settings
SCALPING_ENABLED=true
MOMENTUM_ENABLED=true
ARBITRAGE_ENABLED=false

# Risk parameters
STOP_LOSS_PERCENT=2.0
TAKE_PROFIT_PERCENT=4.0
```

### Database Persistence

Data is automatically persisted in Docker volumes:
- `postgres-data`: Trading data, positions, signals
- `redis-data`: Cache and session data
- `./logs`: Application logs
- `./output`: Trading reports and exports

## 🐛 Troubleshooting

### Common Issues

**Port conflicts**: Change ports in docker-compose.yml if needed
```yaml
ports:
  - "3007:3005"  # Web interface
  - "3008:3006"  # API
```

**Database connection issues**: Reset the database
```bash
docker-compose down -v
docker-compose up -d
```

**API connection errors**: Check your WOO X API credentials and network

### Logs and Debugging

```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs hft-bot
docker-compose logs postgres

# Follow live logs
docker-compose logs -f hft-bot
```

## 📝 Support

For issues, questions, or feature requests:
1. Check the logs for error messages
2. Verify your API credentials and network connectivity
3. Ensure Docker and Docker Compose are properly installed
4. Review the environment variable configuration

## ⚠️ Disclaimer

This software is for educational and research purposes. Trading cryptocurrencies involves substantial risk of loss. Always start with paper trading mode and never risk more than you can afford to lose. The authors are not responsible for any financial losses incurred through the use of this software.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
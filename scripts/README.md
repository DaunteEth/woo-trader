# Scripts Directory

This directory contains utility scripts for the HFT Trading Bot.

## Initial Setup

### setup-bot.sh
- **Purpose**: Initial one-time setup for the trading bot
- **When to use**: Only when setting up the project for the first time
- **What it does**:
  - Creates necessary directories (logs, output)
  - Sets up environment variables
  - Builds the backend
  - Initializes the database with migrations and seed data
  - Creates system user and simulations

## Usage

For initial setup:
```bash
cd scripts
./setup-bot.sh
```

For regular development and production use, please refer to the main README.md in the project root.

#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 WOO X High-Frequency Trading Bot - Docker Build Script${NC}"
echo -e "${BLUE}=================================================${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found!${NC}"
    echo -e "${YELLOW}Creating .env from .env.example...${NC}"
    
    if [ -f .env.example ]; then
        cp .env.example .env
        echo -e "${GREEN}✅ Created .env file from .env.example${NC}"
        echo -e "${YELLOW}⚠️  Please edit .env and add your API keys before running the bot${NC}"
        exit 1
    else
        echo -e "${RED}❌ Error: .env.example not found!${NC}"
        exit 1
    fi
fi

# Verify critical environment variables
echo -e "${BLUE}🔍 Checking environment configuration...${NC}"
if grep -q "your_woo_api_key_here" .env; then
    echo -e "${RED}❌ Error: Please update your WOO API credentials in .env${NC}"
    exit 1
fi

# Check if env.txt exists and warn
if [ -f env.txt ]; then
    echo -e "${YELLOW}⚠️  Warning: env.txt file found. This file will be ignored.${NC}"
    echo -e "${YELLOW}   Please ensure all environment variables are in .env${NC}"
fi

# Stop any running containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down 2>/dev/null || true

# Clean up old images (optional)
if [ "$1" = "--clean" ]; then
    echo -e "${YELLOW}🧹 Cleaning up old images and build cache...${NC}"
    docker system prune -f
    docker image prune -f
fi

# Build with buildkit for better caching
echo -e "${GREEN}🔨 Building Docker image with BuildKit...${NC}"
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

# Build the image
if [ "$1" = "--no-cache" ]; then
    echo -e "${BLUE}Building without cache (this will take longer)...${NC}"
    docker-compose build --no-cache
else
    docker-compose build
fi

# Check if build succeeded
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Docker build completed successfully!${NC}"
    echo -e "${BLUE}=================================================${NC}"
    echo -e "${GREEN}📋 Next steps:${NC}"
    echo -e "  1. Start containers: ${YELLOW}docker-compose up -d${NC}"
    echo -e "  2. View logs: ${YELLOW}docker-compose logs -f${NC}"
    echo -e "  3. Access UI: ${YELLOW}http://localhost:3005${NC}"
    echo -e "     - Login: admin / password"
    echo -e "  4. API health check: ${YELLOW}http://localhost:3006/health${NC}"
    echo -e ""
    echo -e "${BLUE}📊 Useful commands:${NC}"
    echo -e "  - Stop: ${YELLOW}docker-compose stop${NC}"
    echo -e "  - Restart: ${YELLOW}docker-compose restart${NC}"
    echo -e "  - Remove: ${YELLOW}docker-compose down${NC}"
    echo -e "  - View specific logs: ${YELLOW}docker-compose logs -f hft-bot${NC}"
    echo -e "${BLUE}=================================================${NC}"
else
    echo -e "${RED}❌ Docker build failed!${NC}"
    echo -e "${YELLOW}Please check the error messages above.${NC}"
    echo -e "${YELLOW}Common issues:${NC}"
    echo -e "  - Missing dependencies"
    echo -e "  - Network connectivity"
    echo -e "  - Docker daemon not running"
    exit 1
fi

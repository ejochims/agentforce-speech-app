#!/bin/bash

# Quick Deployment Script for Agentforce Speech Demo App
# Usage: ./quick-deploy.sh [app-name]

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Agentforce Speech Demo App - Quick Deploy${NC}"
echo "================================================"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo "Please copy .env.example to .env and configure your Salesforce credentials"
    echo "Run: cp .env.example .env"
    exit 1
fi

# Load environment variables
source .env

# Validate required environment variables
REQUIRED_VARS=("SALESFORCE_DOMAIN_URL" "SALESFORCE_CONSUMER_KEY" "SALESFORCE_CONSUMER_SECRET" "SALESFORCE_AGENT_ID" "SALESFORCE_SPEECH_DOMAIN_URL" "SALESFORCE_SPEECH_CONSUMER_KEY" "SALESFORCE_SPEECH_CONSUMER_SECRET")

echo -e "${YELLOW}📋 Checking environment variables...${NC}"
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ] || [[ "${!var}" == *"your_"* ]] || [[ "${!var}" == *"your-"* ]]; then
        echo -e "${RED}❌ Error: $var is not configured in .env${NC}"
        echo "Please edit .env and set all required Salesforce credentials"
        exit 1
    fi
    echo -e "${GREEN}✓${NC} $var is set"
done

echo ""

# Get app name from argument or prompt
if [ -z "$1" ]; then
    echo -e "${YELLOW}Enter your Heroku app name (or press Enter to let Heroku generate one):${NC}"
    read -r APP_NAME
else
    APP_NAME="$1"
fi

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo -e "${RED}❌ Error: Heroku CLI is not installed${NC}"
    echo "Please install it from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Check if logged into Heroku
if ! heroku auth:whoami &> /dev/null; then
    echo -e "${YELLOW}🔐 Please login to Heroku...${NC}"
    heroku login
fi

echo ""
echo -e "${BLUE}📦 Creating Heroku app...${NC}"

# Create Heroku app
if [ -z "$APP_NAME" ]; then
    heroku create
else
    heroku create "$APP_NAME"
fi

echo ""
echo -e "${BLUE}🗄️  Adding PostgreSQL database...${NC}"
heroku addons:create heroku-postgresql:essential-0

echo ""
echo -e "${BLUE}🔧 Setting environment variables...${NC}"

# Set environment variables
heroku config:set \
    SALESFORCE_DOMAIN_URL="$SALESFORCE_DOMAIN_URL" \
    SALESFORCE_CONSUMER_KEY="$SALESFORCE_CONSUMER_KEY" \
    SALESFORCE_CONSUMER_SECRET="$SALESFORCE_CONSUMER_SECRET" \
    SALESFORCE_AGENT_ID="$SALESFORCE_AGENT_ID" \
    SALESFORCE_SPEECH_DOMAIN_URL="$SALESFORCE_SPEECH_DOMAIN_URL" \
    SALESFORCE_SPEECH_CONSUMER_KEY="$SALESFORCE_SPEECH_CONSUMER_KEY" \
    SALESFORCE_SPEECH_CONSUMER_SECRET="$SALESFORCE_SPEECH_CONSUMER_SECRET" \
    NODE_ENV=production

# Set OpenAI key if present
if [ -n "$OPENAI_API_KEY" ] && [[ "$OPENAI_API_KEY" != *"your-"* ]]; then
    echo -e "${YELLOW}🔑 Setting optional OpenAI API key...${NC}"
    heroku config:set OPENAI_API_KEY="$OPENAI_API_KEY"
fi

echo ""
echo -e "${BLUE}🚢 Deploying to Heroku...${NC}"

# Ensure we're on a branch and committed
if [ -d .git ]; then
    # Check if there are uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        echo -e "${YELLOW}⚠️  You have uncommitted changes. Committing them now...${NC}"
        git add .
        git commit -m "Deploy to Heroku - $(date +%Y-%m-%d)"
    fi
    
    # Push to Heroku
    git push heroku main || git push heroku master
else
    echo -e "${RED}❌ Error: Not a git repository${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🗄️  Initializing database schema...${NC}"
heroku run npm run db:push

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "================================================"
echo -e "${BLUE}📱 Your app is ready!${NC}"
echo ""
echo "Open your app:"
echo -e "  ${YELLOW}heroku open${NC}"
echo ""
echo "View logs:"
echo -e "  ${YELLOW}heroku logs --tail${NC}"
echo ""
echo "Check status:"
echo -e "  ${YELLOW}heroku ps${NC}"
echo ""
echo "View config:"
echo -e "  ${YELLOW}heroku config${NC}"
echo ""
echo -e "${GREEN}🎉 Happy voice chatting with Agentforce!${NC}"
echo "================================================"

# Optionally open the app
echo ""
echo -e "${YELLOW}Open the app now? (y/n)${NC}"
read -r OPEN_APP
if [ "$OPEN_APP" = "y" ] || [ "$OPEN_APP" = "Y" ]; then
    heroku open
fi


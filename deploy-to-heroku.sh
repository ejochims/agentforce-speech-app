#!/bin/bash

# Heroku Deployment Script for Agentforce Speech App
# This script will guide you through deploying your app to Heroku

set -e  # Exit on error

echo "🚀 Agentforce Speech App - Heroku Deployment"
echo "=============================================="
echo ""

# Check if Heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI is not installed."
    echo "Please install it from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

echo "✅ Heroku CLI is installed"
echo ""

# Login to Heroku
echo "📝 Please login to Heroku..."
heroku login

echo ""
echo "Creating Heroku app..."
read -p "Enter your app name (or press Enter for auto-generated name): " APP_NAME

if [ -z "$APP_NAME" ]; then
    heroku create
else
    heroku create "$APP_NAME"
fi

echo ""
echo "📦 Adding PostgreSQL database..."
heroku addons:create heroku-postgresql:essential-0

echo ""
echo "🔐 Setting environment variables..."
echo "Please provide your configuration values:"
echo ""

read -p "SALESFORCE_DOMAIN_URL (e.g., https://yourdomain.my.salesforce.com): " SF_DOMAIN
heroku config:set SALESFORCE_DOMAIN_URL="$SF_DOMAIN"

read -p "SALESFORCE_CONSUMER_KEY: " SF_KEY
heroku config:set SALESFORCE_CONSUMER_KEY="$SF_KEY"

read -p "SALESFORCE_CONSUMER_SECRET: " SF_SECRET
heroku config:set SALESFORCE_CONSUMER_SECRET="$SF_SECRET"

read -p "SALESFORCE_AGENT_ID: " SF_AGENT
heroku config:set SALESFORCE_AGENT_ID="$SF_AGENT"

read -p "SALESFORCE_SPEECH_DOMAIN_URL (can be same as main domain): " SF_SPEECH_DOMAIN
heroku config:set SALESFORCE_SPEECH_DOMAIN_URL="$SF_SPEECH_DOMAIN"

read -p "SALESFORCE_SPEECH_CONSUMER_KEY: " SF_SPEECH_KEY
heroku config:set SALESFORCE_SPEECH_CONSUMER_KEY="$SF_SPEECH_KEY"

read -p "SALESFORCE_SPEECH_CONSUMER_SECRET: " SF_SPEECH_SECRET
heroku config:set SALESFORCE_SPEECH_CONSUMER_SECRET="$SF_SPEECH_SECRET"

read -p "OPENAI_API_KEY (optional, press Enter to skip): " OPENAI_KEY
if [ ! -z "$OPENAI_KEY" ]; then
    heroku config:set OPENAI_API_KEY="$OPENAI_KEY"
fi

heroku config:set NODE_ENV=production

echo ""
echo "📝 Committing changes..."
git add .
git commit -m "Prepare for Heroku deployment" || echo "No changes to commit"

echo ""
echo "🚀 Deploying to Heroku..."
git push heroku main || git push heroku master

echo ""
echo "🗄️ Setting up database..."
heroku run npm run db:push

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Your app is now live at:"
heroku apps:info -s | grep web_url | cut -d= -f2

echo ""
echo "To view logs, run: heroku logs --tail"
echo "To open your app, run: heroku open"

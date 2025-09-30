# Heroku Deployment Guide

## Prerequisites

1. **Heroku Account**: Sign up at [heroku.com](https://heroku.com)
2. **Heroku CLI**: Install from [devcenter.heroku.com/articles/heroku-cli](https://devcenter.heroku.com/articles/heroku-cli)
3. **Git**: Ensure your project is in a git repository

## Deployment Steps

### 1. Login to Heroku

```bash
heroku login
```

### 2. Create a New Heroku App

```bash
heroku create your-app-name
# Or let Heroku generate a name:
heroku create
```

### 3. Add PostgreSQL Database

```bash
heroku addons:create heroku-postgresql:essential-0
```

Note: This creates a PostgreSQL database. The `DATABASE_URL` will be automatically set.

### 4. Set Environment Variables

Set all required environment variables:

```bash
# Salesforce Agentforce Configuration
heroku config:set SALESFORCE_DOMAIN_URL=https://your-domain.my.salesforce.com
heroku config:set SALESFORCE_CONSUMER_KEY=your_consumer_key
heroku config:set SALESFORCE_CONSUMER_SECRET=your_consumer_secret
heroku config:set SALESFORCE_AGENT_ID=your_agent_id

# Salesforce Speech Foundations Configuration
heroku config:set SALESFORCE_SPEECH_DOMAIN_URL=https://your-speech-domain.my.salesforce.com
heroku config:set SALESFORCE_SPEECH_CONSUMER_KEY=your_speech_consumer_key
heroku config:set SALESFORCE_SPEECH_CONSUMER_SECRET=your_speech_consumer_secret

# Optional: OpenAI API Key (for fallback)
heroku config:set OPENAI_API_KEY=sk-your-key

# Node Environment
heroku config:set NODE_ENV=production
```

### 5. Push Database Schema

After deploying (next step), run:

```bash
heroku run npm run db:push
```

### 6. Deploy to Heroku

```bash
# Make sure all changes are committed
git add .
git commit -m "Prepare for Heroku deployment"

# Push to Heroku
git push heroku main
# Or if your branch is named differently:
# git push heroku master
```

### 7. Open Your App

```bash
heroku open
```

## Verify Deployment

Check the logs to ensure everything is running:

```bash
heroku logs --tail
```

## Troubleshooting

### Build Failures

If the build fails, check:
- Node version compatibility (app uses Node 18+)
- All dependencies are in `package.json`
- Build script completes successfully locally

```bash
# Test build locally
npm run build
```

### Runtime Errors

Check logs:
```bash
heroku logs --tail
```

Common issues:
- **Missing environment variables**: Verify all required env vars are set with `heroku config`
- **Database connection**: Ensure PostgreSQL addon is provisioned with `heroku addons`
- **Port binding**: The app correctly uses `process.env.PORT` (already configured)

### Database Issues

Reset database if needed:
```bash
heroku pg:reset DATABASE_URL
heroku run npm run db:push
```

## Updating Your App

After making changes:

```bash
git add .
git commit -m "Your commit message"
git push heroku main
```

## Scaling (Optional)

Scale your dynos if needed:

```bash
# Scale web dynos
heroku ps:scale web=1

# Upgrade to hobby or higher for production
heroku dyno:type hobby
```

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | PostgreSQL connection (auto-set by Heroku) | Yes |
| `SALESFORCE_DOMAIN_URL` | Your Salesforce org domain | Yes |
| `SALESFORCE_CONSUMER_KEY` | Connected App key for Agentforce | Yes |
| `SALESFORCE_CONSUMER_SECRET` | Connected App secret for Agentforce | Yes |
| `SALESFORCE_AGENT_ID` | Your Agentforce agent ID | Yes |
| `SALESFORCE_SPEECH_DOMAIN_URL` | Domain for Speech Foundations | Yes |
| `SALESFORCE_SPEECH_CONSUMER_KEY` | Connected App key for Speech | Yes |
| `SALESFORCE_SPEECH_CONSUMER_SECRET` | Connected App secret for Speech | Yes |
| `OPENAI_API_KEY` | OpenAI API key (fallback) | No |
| `NODE_ENV` | Set to "production" | Yes |

## Custom Domain (Optional)

Add a custom domain:

```bash
heroku domains:add www.yourdomain.com
```

Follow Heroku's instructions to configure DNS.

## Monitoring

- **View logs**: `heroku logs --tail`
- **Check app status**: `heroku ps`
- **View config**: `heroku config`
- **Open dashboard**: `heroku open` or visit [dashboard.heroku.com](https://dashboard.heroku.com)

## Cost Optimization

- **Essential-0 PostgreSQL**: $5/month (sufficient for most use cases)
- **Eco Dynos**: $5/month (sleeps after 30 min of inactivity)
- **Basic or Standard Dynos**: Recommended for production (no sleep)

## Support

For issues:
1. Check [Heroku Dev Center](https://devcenter.heroku.com)
2. Review logs with `heroku logs --tail`
3. Ensure all environment variables are set correctly

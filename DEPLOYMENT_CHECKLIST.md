# 🚀 Deployment Checklist for Agentforce Speech Demo App

## ✅ Completed Steps
- [x] Repository cloned successfully
- [x] Dependencies installed
- [x] .env file created

## 📋 Next Steps

### 1. Configure Salesforce Credentials

You need to gather these credentials from your Salesforce org. See `SALESFORCE_SETUP.md` for detailed instructions.

**Edit the `.env` file with your actual values:**

```bash
# Open the .env file and update these values:
nano .env  # or use your preferred editor
```

**Required Salesforce Credentials:**

| Variable | How to Get It |
|----------|---------------|
| `SALESFORCE_DOMAIN_URL` | Your Salesforce org URL (e.g., `https://your-company.my.salesforce.com`) |
| `SALESFORCE_CONSUMER_KEY` | Setup → App Manager → New Connected App → Consumer Key |
| `SALESFORCE_CONSUMER_SECRET` | Setup → App Manager → Connected App → Consumer Secret |
| `SALESFORCE_AGENT_ID` | Setup → Agents → Your Agent → Copy Agent ID |
| `SALESFORCE_SPEECH_DOMAIN_URL` | Usually same as SALESFORCE_DOMAIN_URL |
| `SALESFORCE_SPEECH_CONSUMER_KEY` | Can reuse same Connected App credentials |
| `SALESFORCE_SPEECH_CONSUMER_SECRET` | Can reuse same Connected App credentials |

**Quick Setup in Salesforce:**

1. **Create Connected App** (Setup → App Manager → New Connected App)
   - Enable OAuth Settings ✅
   - Enable Client Credentials Flow ✅
   - Add OAuth Scopes:
     - `Access Einstein Platform APIs (einstein_gpt_api)`
     - `Manage user data via APIs (api)`
     - `Access the identity URL service (id, profile, email, address, phone)`
   - Save and copy Consumer Key & Secret

2. **Get Agent ID** (Setup → Agents)
   - Select your Agentforce agent
   - Copy the Agent ID

### 2. Deploy to Heroku

Once your `.env` is configured, run these commands:

```bash
# Login to Heroku
heroku login

# Create a new Heroku app (choose a unique name)
heroku create your-unique-app-name

# Add PostgreSQL database
heroku addons:create heroku-postgresql:essential-0

# Set environment variables from your .env file
source .env  # Load environment variables
heroku config:set SALESFORCE_DOMAIN_URL="$SALESFORCE_DOMAIN_URL"
heroku config:set SALESFORCE_CONSUMER_KEY="$SALESFORCE_CONSUMER_KEY"
heroku config:set SALESFORCE_CONSUMER_SECRET="$SALESFORCE_CONSUMER_SECRET"
heroku config:set SALESFORCE_AGENT_ID="$SALESFORCE_AGENT_ID"
heroku config:set SALESFORCE_SPEECH_DOMAIN_URL="$SALESFORCE_SPEECH_DOMAIN_URL"
heroku config:set SALESFORCE_SPEECH_CONSUMER_KEY="$SALESFORCE_SPEECH_CONSUMER_KEY"
heroku config:set SALESFORCE_SPEECH_CONSUMER_SECRET="$SALESFORCE_SPEECH_CONSUMER_SECRET"
heroku config:set NODE_ENV=production

# Optional: Set OpenAI API key if you have one
# heroku config:set OPENAI_API_KEY="$OPENAI_API_KEY"

# Deploy to Heroku
git push heroku main

# Initialize the database
heroku run npm run db:push

# Open your app!
heroku open
```

### 3. Quick Deploy Script

I've included a deployment script for you. After configuring your `.env`, you can use:

```bash
# Make the script executable
chmod +x quick-deploy.sh

# Run the deployment
./quick-deploy.sh your-unique-app-name
```

### 4. Verify Deployment

After deployment, check:

```bash
# View logs
heroku logs --tail

# Check app status
heroku ps

# View configuration
heroku config
```

### 5. Testing Your App

1. Open the app URL (from `heroku open`)
2. Allow microphone permissions when prompted
3. Press and hold the microphone button
4. Speak to test the voice interaction
5. Check the conversation history

## 🔧 Troubleshooting

### Common Issues:

**1. Authentication Errors (401)**
- Wait 2-10 minutes after creating Connected App (propagation delay)
- Verify Consumer Key and Secret are correct
- Ensure Client Credentials Flow is enabled

**2. Build Failures**
```bash
# Test build locally first
npm run build
```

**3. Database Issues**
```bash
# Reset and reinitialize database
heroku pg:reset DATABASE_URL
heroku run npm run db:push
```

**4. Check Logs**
```bash
heroku logs --tail
```

## 📚 Additional Resources

- `SALESFORCE_SETUP.md` - Detailed Salesforce configuration
- `HEROKU_DEPLOYMENT.md` - Detailed Heroku deployment guide
- `README.md` - Full application documentation

## 🎯 Success Indicators

You'll know it's working when:
- ✅ Heroku build completes successfully
- ✅ App opens without errors
- ✅ You can record and send voice messages
- ✅ Agent responds with voice replies
- ✅ Conversation history is saved

## 💡 Tips

1. **Use the same Connected App** for both Agentforce and Speech APIs (simpler setup)
2. **Test locally first** with `npm run dev` before deploying
3. **Monitor costs** - Essential-0 PostgreSQL is $5/month, Eco dynos are $5/month
4. **Add custom domain** later with `heroku domains:add`
5. **Scale if needed** with `heroku ps:scale web=1`

---

**Current Status:** Ready for Salesforce credentials and Heroku deployment 🎉


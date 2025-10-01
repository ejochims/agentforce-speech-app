# Quick Start for Salesforce Solution Engineers

This is a **production-ready voice chat application** for Salesforce Agentforce agents. Perfect for customer demos, proof-of-concepts, and showcasing voice AI capabilities.

## 🎯 What You'll Get

A mobile-first Progressive Web App that:
- ✅ Lets users talk to Agentforce agents using **natural voice**
- ✅ Uses **Salesforce Speech Foundations** for premium text-to-speech and speech-to-text
- ✅ Works perfectly on **iPhones** and Android devices
- ✅ Can be **installed like a native app** (PWA)
- ✅ Has beautiful voice-only mode with animated feedback
- ✅ Maintains conversation context across messages

## ⚡ Quick Setup (15 minutes)

### What You Need

1. **A Salesforce Org** with:
   - Agentforce enabled
   - Speech Foundations API access
   - Your own configured Agentforce agent

2. **A Heroku Account** (free tier works for demos)

3. **15 minutes** to follow the setup guides

### Setup Steps

#### 1️⃣ Salesforce Setup (10 min)

Follow **[SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md)** to:
- Create a Connected App with OAuth 2.0 client credentials
- Get your Consumer Key and Consumer Secret
- Get your Agentforce Agent ID

You'll end up with these values:
```
✅ SALESFORCE_DOMAIN_URL
✅ SALESFORCE_CONSUMER_KEY
✅ SALESFORCE_CONSUMER_SECRET  
✅ SALESFORCE_AGENT_ID
✅ SALESFORCE_SPEECH_CONSUMER_KEY
✅ SALESFORCE_SPEECH_CONSUMER_SECRET
```

#### 2️⃣ Deploy to Heroku (5 min)

Follow **[HEROKU_DEPLOYMENT.md](./HEROKU_DEPLOYMENT.md)** to:
- Create a Heroku app
- Add PostgreSQL database
- Set environment variables
- Deploy the code

```bash
# Quick deploy commands
heroku create my-agentforce-demo
heroku addons:create heroku-postgresql:essential-0
# Set your environment variables (see HEROKU_DEPLOYMENT.md)
git push heroku main
heroku run npm run db:push
heroku open
```

#### 3️⃣ Test Your App

1. Open your Heroku app URL
2. Grant microphone permissions
3. Press and hold the microphone button
4. Speak a question to your agent
5. Release and listen to the response!

## 📱 Demo Tips

### Best Demo Flow

1. **Start with voice-only mode** (toggle off "Show Conversation")
   - Most visually impressive
   - Shows the animated feedback (blue → yellow → green)
   - Feels like talking to a real assistant

2. **Show the conversation history** (toggle on "Show Conversation")
   - Demonstrates session persistence
   - Shows both user and agent messages
   - Proves the agent maintains context

3. **Install as PWA** on your phone
   - iPhone: Safari → Share → "Add to Home Screen"
   - Looks and feels like a native app
   - Great wow factor for customers

### Example Questions

Tailor these to your agent's configuration:
- "What can you help me with?"
- "Tell me about [your product/service]"
- "How do I [common customer task]?"
- "What are your hours of operation?"

### Common Demo Issues

| Issue | Solution |
|-------|----------|
| Microphone doesn't work | Make sure you're on **HTTPS** (Heroku provides this) |
| App is slow to load | Free Heroku dynos sleep - visit URL before demo |
| Agent gives wrong answer | Review and improve your agent's topics/instructions |
| No audio playback | Check browser audio permissions |

## 🎨 Customization

### Change Your Agent

Just update the environment variable (no code changes needed):

```bash
heroku config:set SALESFORCE_AGENT_ID=new_agent_id
```

The app immediately uses the new agent!

### Change the Voice

Edit `server/routes.ts` around line 207:

```typescript
const { text, voice = 'allison' } = req.query; // Change to 'onyx', 'shimmer', etc.
```

Available voices:
- `allison` - Millennial female (default, conversational)
- `onyx` - Strong male (professional)
- `shimmer` - Clear male (friendly)
- `echo` - Deep male (authoritative)
- `nova` - Expressive female (enthusiastic)

### Customize Branding

- **App title**: Edit `client/src/components/ChatHeader.tsx`
- **Colors**: Modify `client/src/index.css`
- **App icon**: Replace files in `public/`
- **App name**: Edit `public/manifest.json`

## 📚 Documentation

- **[README.md](./README.md)** - Complete technical documentation
- **[SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md)** - Detailed Salesforce configuration
- **[HEROKU_DEPLOYMENT.md](./HEROKU_DEPLOYMENT.md)** - Complete deployment guide
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development guide for customization

## 🆘 Need Help?

### Troubleshooting

**Authentication errors?**
- Verify all environment variables: `heroku config`
- Check Consumer Key/Secret are correct
- Ensure Client Credentials Flow is enabled in Connected App

**Voice not working?**
- Must use HTTPS (Heroku does this automatically)
- Check microphone permissions in browser
- Test on actual mobile device (simulators can be unreliable)

**Agent not responding correctly?**
- Verify Agent ID is correct
- Ensure agent is activated and deployed
- Test the agent in Salesforce first

### Get Support

- Review the detailed guides in this repo
- Check Heroku logs: `heroku logs --tail`
- Ask in your SE team Slack channel
- Open a GitHub issue

## 💡 Use Cases

Perfect for demonstrating:

1. **Voice-First Customer Service**
   - Self-service support via voice
   - Natural conversation flow
   - Mobile-friendly interface

2. **Field Service Applications**
   - Hands-free operation for technicians
   - Quick information lookup
   - Works on mobile devices

3. **Accessibility**
   - Voice interface for users with limited mobility
   - Alternative to typing
   - Screen reader friendly

4. **Modern AI Capabilities**
   - Showcase Agentforce intelligence
   - Demonstrate Speech Foundations API
   - Prove Salesforce's voice AI readiness

## 🚀 Next Steps

1. **Complete the setup** using the guides above
2. **Test thoroughly** with your specific agent
3. **Customize** branding and voice for your demos
4. **Practice** your demo flow
5. **Share** with customers and prospects!

## 📊 Cost Estimate

For demo/POC usage:

| Service | Plan | Cost |
|---------|------|------|
| Heroku Eco Dyno | $5/month | (sleeps after 30min) |
| PostgreSQL Essential-0 | $5/month | (10M rows) |
| **Total** | **~$10/month** | |

For production, upgrade to Basic/Standard dynos ($25-50/month).

Salesforce Speech Foundations pricing varies by org/license.

## ⚠️ Important Notes

- **Each SE should deploy their own instance** - don't share production URLs
- **Keep credentials secure** - never commit `.env` files
- **Test before demos** - especially on actual mobile devices
- **Monitor usage** - be aware of Salesforce API limits

---

**Ready to build amazing voice AI demos?** Start with [SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md)! 🎙️


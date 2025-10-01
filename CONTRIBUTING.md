# Contributing Guide for Salesforce Solution Engineers

Welcome! This guide helps Salesforce Solution Engineers set up, customize, and extend this Agentforce Voice Chat application for demos and customer engagements.

## 🎯 For Solution Engineers

### Quick Setup for Demos

1. **Get the required Salesforce access:**
   - A demo org with Agentforce enabled
   - Speech Foundations API access
   - System Administrator permissions

2. **Follow the setup guides:**
   - [SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md) - Set up Connected Apps and Agent
   - [HEROKU_DEPLOYMENT.md](./HEROKU_DEPLOYMENT.md) - Deploy your own instance

3. **Customize for your demo:**
   - Configure your Agentforce agent with relevant topics
   - Adjust voice settings in `server/routes.ts`
   - Modify branding in `client/src/components/ChatHeader.tsx`

### Common Customizations

#### Change the Agentforce Agent

Simply update the environment variable:
```bash
heroku config:set SALESFORCE_AGENT_ID=new_agent_id_here
```

No code changes needed! The app will immediately start using the new agent.

#### Change the Voice

Edit `server/routes.ts` to change the default voice:
```typescript
// Line ~207 in routes.ts
app.get('/api/tts', async (req, res) => {
  const { text, voice = 'onyx' } = req.query; // Change 'allison' to 'onyx'
  // ...
});
```

Available voices:
- `allison` - Millennial female (default)
- `shimmer` - Clear male
- `onyx` - Strong male
- `echo` - Deep male
- `fable` - Expressive female
- `nova` - Expressive female

#### Customize Branding

1. **App Name**: Edit `client/src/components/ChatHeader.tsx`
2. **Colors**: Modify `client/src/index.css` or Tailwind config
3. **Icons**: Replace files in `public/` folder
4. **PWA Manifest**: Edit `public/manifest.json`

### Demo Tips

#### Best Practices for Demos

1. **Test your agent thoroughly** before the demo
2. **Have example questions ready** that showcase your agent's capabilities
3. **Use a stable internet connection** for voice interactions
4. **Test on actual mobile devices** (especially iPhone) before demos
5. **Have a fallback plan** if network issues occur

#### Demo Scenarios

**Voice-Only Mode** (Most Impressive):
- Toggle off "Show Conversation"
- Press and hold to speak
- Watch the visual feedback animations
- Release to send
- Listen to the agent's voice response

**Hybrid Mode** (Good for Presentations):
- Keep conversation history visible
- Demonstrates persistent sessions
- Shows both voice and text interactions
- Easier to reference what was said

#### Troubleshooting During Demos

**If voice recording fails:**
- Check microphone permissions in browser
- Try switching to text input temporarily
- Refresh the page (conversation persists)

**If agent response is slow:**
- This is usually Salesforce API response time
- Use it as a teaching moment about real-world API latency
- Consider shorter, more focused questions

**If deployment goes down:**
- Heroku free/hobby dynos sleep after 30 min inactivity
- Wake it up by visiting the URL before your demo
- Consider upgrading to Basic dyno for important demos

## 💻 Development Guide

### Local Development Setup

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd agentforce-speech-app
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```
   Access at `http://localhost:5000`

### Project Structure

```
├── client/                 # Frontend React app
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── VoiceChat.tsx           # Main voice interface
│   │   │   ├── VoiceRecordButton.tsx   # Recording button
│   │   │   ├── MessageBubble.tsx       # Chat messages
│   │   │   └── ui/                     # Shadcn/ui components
│   │   ├── lib/           # Utilities
│   │   └── pages/         # Route pages
├── server/                # Backend Express server
│   ├── agentforce.ts      # Agentforce API client
│   ├── speech-foundations.ts  # Speech API client
│   ├── routes.ts          # API endpoints
│   ├── storage.ts         # Database operations
│   └── index.ts           # Server entry point
├── shared/                # Shared types/schemas
└── public/                # Static assets
```

### Adding Features

#### Add a New API Endpoint

1. Define types in `shared/schema.ts`:
   ```typescript
   export const myFeatureSchema = z.object({
     // define fields
   });
   ```

2. Add route in `server/routes.ts`:
   ```typescript
   app.post('/api/my-feature', async (req, res) => {
     const data = myFeatureSchema.parse(req.body);
     // handle request
     res.json(result);
   });
   ```

3. Call from frontend:
   ```typescript
   const response = await fetch('/api/my-feature', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(data),
   });
   ```

#### Add a New UI Component

1. Create in `client/src/components/`:
   ```tsx
   export function MyComponent() {
     return <div>...</div>;
   }
   ```

2. Use Shadcn/ui components:
   ```bash
   npx shadcn@latest add button
   ```

3. Import and use:
   ```tsx
   import { MyComponent } from '@/components/MyComponent';
   ```

### Testing

#### Manual Testing Checklist

- [ ] Voice recording works on desktop
- [ ] Voice recording works on mobile (iOS Safari)
- [ ] Text-to-speech plays correctly
- [ ] Conversation persistence works
- [ ] Agent responses are accurate
- [ ] Error handling shows helpful messages
- [ ] PWA installs correctly on mobile

#### Test Different Browsers

- Chrome (desktop & Android)
- Safari (desktop & iOS)
- Firefox
- Edge

## 🚀 Deployment

### Deploy Your Own Instance

Each Solution Engineer should have their own Heroku instance:

```bash
# Create your own app
heroku create my-unique-app-name

# Add database
heroku addons:create heroku-postgresql:essential-0

# Set environment variables
heroku config:set SALESFORCE_DOMAIN_URL=...
heroku config:set SALESFORCE_CONSUMER_KEY=...
# ... (see HEROKU_DEPLOYMENT.md for all variables)

# Deploy
git push heroku main

# Initialize database
heroku run npm run db:push
```

### Deployment Checklist

- [ ] All environment variables set
- [ ] Database created and pushed
- [ ] App accessible via HTTPS
- [ ] Audio permissions work (HTTPS required)
- [ ] PWA manifest loads correctly
- [ ] Test on mobile device

## 📚 Additional Resources

### Salesforce Documentation

- [Agentforce Documentation](https://help.salesforce.com/s/articleView?id=sf.agents_overview.htm)
- [Speech Foundations API](https://developer.salesforce.com/docs/einstein/genai/guide/speech-foundations.html)
- [Connected Apps Guide](https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm)

### Technical Stack

- [React](https://react.dev/) - UI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Express](https://expressjs.com/) - Backend server
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Shadcn/ui](https://ui.shadcn.com/) - UI components
- [TanStack Query](https://tanstack.com/query/) - Data fetching

## 🆘 Getting Help

### Common Issues

**"Missing required Salesforce environment variables"**
- Check all env vars are set: `heroku config`
- Follow [SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md)

**"Authentication failed"**
- Verify Connected App consumer key/secret
- Wait 2-10 minutes after creating/modifying Connected App
- Check OAuth 2.0 Client Credentials Flow is enabled

**"Agent not found"**
- Verify agent is activated and deployed
- Check SALESFORCE_AGENT_ID matches your agent

**Voice recording doesn't work**
- Must use HTTPS (works on Heroku, not localhost HTTP)
- Check browser microphone permissions
- iOS requires user gesture to start recording

### Support Channels

- **Internal Slack**: #agentforce-demos or your team channel
- **GitHub Issues**: Report bugs or request features
- **Salesforce Partners**: Reach out to your Salesforce SE manager

## 🤝 Best Practices

### Security

- ✅ **Never commit** `.env` files or credentials
- ✅ **Use separate** Connected Apps for dev/staging/prod
- ✅ **Rotate secrets** regularly
- ✅ **Review permissions** on Connected Apps

### Code Quality

- ✅ **TypeScript strict mode** - maintain type safety
- ✅ **Error handling** - graceful failures with user feedback
- ✅ **Console logging** - helpful for debugging in production
- ✅ **Comments** - explain "why" not "what"

### Demo Quality

- ✅ **Test beforehand** - every single time
- ✅ **Stable connection** - test network requirements
- ✅ **Fallback ready** - have a screen recording backup
- ✅ **Know your agent** - understand what it can/can't do

## 📝 License

This project is for internal Salesforce Solution Engineer use. Respect customer data privacy and Salesforce policies.

---

**Questions?** Reach out on Slack or open a GitHub issue!


# Features & Customization Guide for Solution Engineers

> **Purpose:** This guide explains what the app does out-of-the-box, what features are available to end users, and how you can customize it for demos and customer deployments.

---

## 📱 Built-In Features (Out of the Box)

### Voice Interaction Features

#### 1. **Voice Recording**
- **Press and hold** the microphone button to record
- **Visual feedback** with animated blue rings while recording
- **Real-time audio capture** using device microphone
- **Supports multiple audio formats:** WebM (Chrome/Android), MP4/M4A (Safari/iOS)

#### 2. **Speech-to-Text**
- **Automatic transcription** of voice to text
- **Powered by Salesforce Speech Foundations** (ElevenLabs Scribe v1 model)
- **High accuracy** with natural language understanding
- **Multi-language support** (based on org configuration)

#### 3. **AI Agent Responses**
- **Natural conversation** with Salesforce Agentforce agent
- **Context retention** across multiple turns
- **Agent capabilities** determined by your Salesforce agent configuration
- **Action execution** (create cases, update records, run flows, etc.)

#### 4. **Text-to-Speech**
- **Natural voice responses** using premium ElevenLabs voices
- **Default voice:** Allison (millennial female, conversational)
- **Multiple voice options** available (see customization section)
- **Streaming audio** for immediate playback
- **~75ms latency** for responsive experience

---

### User Interface Features

#### 1. **Voice-Only Mode (Default)**
- Clean, minimal interface focused on voice interaction
- Large microphone button front and center
- Visual status indicators:
  - 🔵 **Blue rings:** Recording/processing your speech
  - 🟡 **Yellow pulse:** Agent is thinking
  - 🟢 **Green ripples:** Agent is speaking
- **Perfect for:** Hands-free demos, mobile usage, accessibility

#### 2. **Conversation View Mode**
- Toggle ON to see full conversation history
- Chat bubble interface with timestamps
- User messages on right (blue), agent messages on left (gray)
- Scrollable history of entire conversation
- **Perfect for:** Presentations, debugging, training

#### 3. **Audio Controls**
- **Enable/Disable voice responses**
- Mute icon (🔇) when audio is off
- Speaker icon (🔊) when audio is on
- Audio preference saved to device
- **Perfect for:** Silent environments, testing without sound

#### 4. **Text Input Option**
- Click "Show Text Input" button to reveal text field
- Type messages instead of speaking
- Still receives voice responses from agent
- **Perfect for:** Noisy environments, text-preferred users

#### 5. **New Conversation**
- "Start New Conversation" button in history drawer
- Clears current context and begins fresh
- Previous conversation saved in database
- Each conversation gets unique session ID

#### 6. **Settings Panel**
- Access via gear icon (⚙️)
- Toggle "Show Conversation" on/off
- More settings can be added here (see customization)

---

### Progressive Web App (PWA) Features

#### 1. **Installable App**
- Install on iPhone, Android, desktop
- Works like a native app (no browser chrome)
- App icon on home screen
- Splash screen on launch

**Installation:**
- **iPhone:** Safari → Share → "Add to Home Screen"
- **Android:** Chrome → Menu → "Install app"
- **Desktop:** Browser shows install button in address bar

#### 2. **Offline-Ready UI**
- App shell loads instantly even without internet
- Cached conversations display offline
- Shows appropriate message when offline
- Requires internet for new AI interactions

#### 3. **Mobile-Optimized**
- Touch-friendly button sizes
- Responsive design for all screen sizes
- Portrait and landscape support
- iOS Safari audio compatibility

---

### Session & Data Management

#### 1. **Conversation Persistence**
- Conversations saved to database automatically
- Session ID stored in browser (localStorage)
- Return to same conversation if you close and reopen
- Works across PWA and browser sessions

#### 2. **Message History**
- All messages (user and agent) stored
- Timestamps for each message
- Retrievable via API or UI
- Database: PostgreSQL on Heroku

#### 3. **Multi-Turn Conversations**
- Agent remembers context within a conversation
- Can reference previous messages
- Natural follow-up questions work as expected

---

## 🎨 What You Can Customize

### Level 1: No-Code Customization (Heroku Config Vars)

These can be changed without touching any code - just update environment variables in Heroku.

#### 1. **Change the Agentforce Agent**
```bash
SALESFORCE_AGENT_ID=0Xx...  # Your different agent ID
```
**Use case:** Demo different agents for different industries (Service Agent, Sales Agent, etc.)

**How to get Agent ID:**
1. Go to Salesforce Setup → Agentforce Agents
2. Open your agent
3. Copy ID from URL (after `/AgentBuilder/page?address=/`)

**Impact:** Changes what the agent knows, what actions it can take, its personality

---

#### 2. **Point to Different Salesforce Org**
```bash
SALESFORCE_DOMAIN_URL=https://your-different-org.my.salesforce.com
SALESFORCE_SPEECH_DOMAIN_URL=https://your-different-org.my.salesforce.com
```
**Use case:** Demo on sandbox vs. production, customer org vs. demo org

**Impact:** Different agents, different data, different API limits

---

#### 3. **Use Different Connected Apps**
```bash
SALESFORCE_CONSUMER_KEY=3MVG9...
SALESFORCE_CONSUMER_SECRET=ABC123...
```
**Use case:** Separate credentials for different customers, security isolation

**Impact:** Different OAuth apps, different permissions, different audit trails

---

### Level 2: Simple Code Changes (No Development Skills Needed)

#### 1. **Change the Voice**

**File:** `server/routes.ts` (around line 202)

**Available Voices:**
```typescript
const { text, voice = 'allison' } = req.query;  // Change 'allison' to any below
```

**Voice Options:**
| Voice Name | Voice ID | Description | Gender | Tone |
|------------|----------|-------------|--------|------|
| `allison` | xctasy8XvGp2cVO9HL9k | Millennial, conversational | Female | Natural |
| `shimmer` | pNInz6obpgDQGcFmaJgB | Clear, professional | Male | Neutral |
| `alloy` | JBFqnCBsd6RMkjVDRZzb | Mature, authoritative | Male | Warm |
| `echo` | TxGEqnHWrfWFTfGW9XjX | Deep, strong | Male | Professional |
| `onyx` | VR6AewLTigWG4xSOukaG | Strong, commanding | Male | Assertive |
| `nova` | EXAVITQu4vr4xnSDxMaL | Expressive, energetic | Female | Enthusiastic |
| `fable` | AZnzlk1XvdvUeBnXmlld | Expressive, dramatic | Female | Animated |

**How to change:**
```typescript
// Before:
const { text, voice = 'allison' } = req.query;

// After (for male voice):
const { text, voice = 'onyx' } = req.query;
```

**Then deploy:**
```bash
git add server/routes.ts
git commit -m "Change default voice to onyx"
git push heroku main
```

---

#### 2. **Change App Name and Branding**

**Files to edit:**

**A. App Title (in chat header)**
`client/src/components/ChatHeader.tsx` - Line 12:
```typescript
// Before:
agentName = "Agentforce"

// After:
agentName = "Acme AI Assistant"
```

**B. PWA Name (what shows on home screen)**
`public/manifest.json` - Lines 2-4:
```json
{
  "name": "Your Company AI Assistant",
  "short_name": "Your AI",
  "description": "Your custom description here"
}
```

**C. App Colors/Theme**
`public/manifest.json` - Lines 7-8:
```json
{
  "background_color": "#ffffff",  // Background color
  "theme_color": "#1976d2"        // Theme color (change to your brand)
}
```

---

#### 3. **Change App Icons**

Replace these files in the `public/` folder:
- `agentforce-icon-192.png` - 192x192px icon
- `agentforce-icon-512.png` - 512x512px icon
- `agentforce-logo.png` - Logo shown in app

**Requirements:**
- PNG format
- Square dimensions
- Transparent background recommended

---

#### 4. **Customize Visual Feedback Colors**

**File:** `client/src/index.css` (Tailwind configuration)

**Animation Colors:**
```css
/* Recording (Blue) */
--recording-active: 59 130 246;

/* Processing (Yellow) */  
--processing: 234 179 8;

/* Speaking (Green) */
--speaking: 34 197 94;
```

**How to change:**
```css
/* Make recording animation purple instead of blue */
--recording-active: 168 85 247;  /* RGB for purple */
```

---

### Level 3: Salesforce Configuration (No Code Changes)

The power of this app comes from what you configure in Salesforce. The app is just a voice interface to YOUR agent.

#### 1. **Agent Configuration**

**What determines the agent's behavior:**

**A. Agent Topics**
- Define what the agent can help with
- Example topics: "Order Status", "Product Information", "Troubleshooting"
- Each topic has instructions and actions

**B. Agent Instructions**
- Overall personality and behavior
- Example: "You are a helpful, friendly assistant for Acme Corp customers"
- Tone, formality, response length

**C. Data Sources**
- Knowledge articles
- Salesforce objects (Accounts, Cases, Products, etc.)
- External systems via APIs

**D. Actions**
- Flows to execute
- Apex methods to call
- Platform events to publish
- Quick Actions on records

**E. Guardrails**
- What the agent should NOT talk about
- Escalation triggers
- Compliance rules

**To customize your agent:**
1. Go to Setup → Agentforce Agents
2. Select your agent → "Open in Builder"
3. Configure topics, instructions, data sources, and actions
4. Activate and deploy changes
5. No app code changes needed!

---

#### 2. **Speech Foundations Configuration**

**Language Settings:**
- Configure STT language in your Salesforce org
- Speech Foundations supports multiple languages
- Voice language matches configured language

**Voice Options:**
- Additional voices available in ElevenLabs catalog
- Contact Salesforce to enable specific voices
- Current voices are defaults from Speech Foundations

---

### Level 4: Advanced Customization (Requires Development)

#### 1. **Add Authentication**

**Options:**
- Basic username/password
- Salesforce OAuth login
- SSO integration (SAML, OpenID)
- API key authentication

**Implementation:** Add middleware in `server/index.ts`

---

#### 2. **Add User Management**

**Features to add:**
- User registration/login
- User profiles
- Conversation history per user
- Multi-user support

**Database:** User table already exists in schema

---

#### 3. **Add Rate Limiting**

**Why:** Prevent abuse, control costs

**Implementation:**
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests
});

app.use('/api/', limiter);
```

---

#### 4. **Add Analytics/Tracking**

**What to track:**
- Number of conversations
- User satisfaction ratings
- Common questions/topics
- Response times
- Error rates

**Implementation options:**
- Google Analytics
- Mixpanel
- Custom database logging
- Salesforce Platform Events

---

#### 5. **Add Context Variables**

**What:** Pass additional context to agent

**Example use cases:**
- User location
- Customer tier (Premium, Standard, etc.)
- Account information
- Previous purchases

**Implementation:** Modify `server/agentforce.ts`:
```typescript
body: JSON.stringify({
  agentId: this.agentId,
  message: userMessage,
  contextVariables: {
    userLocation: 'San Francisco',
    customerTier: 'Premium',
    accountId: 'ACC-12345'
  }
})
```

---

#### 6. **Add Conversation Export**

**Features:**
- Download conversation as PDF
- Email transcript
- Share conversation link
- Print-friendly format

**Implementation:** Add new API endpoint and UI button

---

#### 7. **Add Multi-Language Support**

**Features:**
- UI in multiple languages
- Detect user language
- Switch languages mid-conversation

**Implementation:** Use i18n library (react-i18next)

---

#### 8. **Add Rich Media Support**

**Features:**
- Agent sends images
- Agent sends links/cards
- Show forms inline
- Display charts/graphs

**Implementation:** Enhance MessageBubble component

---

#### 9. **Add Voice Biometrics**

**Features:**
- Authenticate user by voice
- Speaker identification
- Voice-based security

**Implementation:** Integrate voice biometrics service

---

#### 10. **Add Telephony Integration**

**Features:**
- Call in to talk to agent
- Twilio integration
- Phone number → same agent

**Implementation:** Add Twilio webhook handlers

---

## 🎯 Common Customization Scenarios

### Scenario 1: Industry-Specific Demo (Healthcare)

**Customization:**
1. Change app name to "HealthFirst AI Assistant"
2. Replace icons with healthcare-themed icons
3. Configure agent with healthcare topics (appointments, medications, insurance)
4. Use warm, professional voice (alloy or shimmer)
5. Add health-related context variables (patient ID, insurance provider)

---

### Scenario 2: Field Service Demo

**Customization:**
1. Keep voice-only mode as default (hands-free)
2. Use strong, clear voice (onyx) for noisy environments
3. Configure agent with field service topics (work orders, inventory, scheduling)
4. Add location context variable
5. Emphasize PWA installation for offline capability

---

### Scenario 3: Customer-Facing Production App

**Customization:**
1. Add Salesforce OAuth for customer login
2. Enable conversation history per user
3. Add rate limiting (prevent abuse)
4. Configure production agent with escalation rules
5. Add analytics tracking
6. Use custom domain (voice.yourcompany.com)
7. Enable HTTPS (Heroku provides)
8. Add error monitoring (Sentry, Rollbar)

---

### Scenario 4: Multilingual Support Center

**Customization:**
1. Configure Speech Foundations for multiple languages
2. Add language selector in settings
3. Configure agent with multilingual knowledge
4. Use appropriate voice for each language
5. Add language context variable

---

### Scenario 5: Internal Employee Assistant

**Customization:**
1. Add employee authentication (Salesforce SSO)
2. Configure agent with employee-focused topics (PTO, benefits, IT support)
3. Add employee context (department, role, manager)
4. Restrict to corporate network (IP whitelist on Heroku)
5. Enable conversation export for HR compliance

---

## 🛠️ Quick Customization Recipes

### Recipe 1: Change Voice in 2 Minutes

```bash
# 1. Edit the file
nano server/routes.ts

# 2. Find line ~202, change:
const { text, voice = 'allison' } = req.query;
# To:
const { text, voice = 'onyx' } = req.query;

# 3. Deploy
git add server/routes.ts
git commit -m "Change voice to onyx"
git push heroku main
```

---

### Recipe 2: Swap Agents in 1 Minute

```bash
# Get your agent ID from Salesforce Setup → Agents
heroku config:set SALESFORCE_AGENT_ID=0XxNEWAGENTID123 -a your-app-name
# App restarts automatically
```

---

### Recipe 3: Rebrand App in 5 Minutes

```bash
# 1. Edit manifest
nano public/manifest.json
# Change "name", "short_name", "description"

# 2. Edit header
nano client/src/components/ChatHeader.tsx
# Change agentName default value

# 3. Replace icons (prepare 192x192 and 512x512 PNGs first)
cp your-icon-192.png public/agentforce-icon-192.png
cp your-icon-512.png public/agentforce-icon-512.png
cp your-logo.png public/agentforce-logo.png

# 4. Deploy
git add public/ client/src/components/ChatHeader.tsx
git commit -m "Rebrand to MyCompany"
git push heroku main
```

---

### Recipe 4: Add Basic Password Protection

```typescript
// In server/index.ts, add before other routes:
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  const expected = 'Basic ' + Buffer.from('demo:password123').toString('base64');
  
  if (auth === expected) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
    res.status(401).send('Authentication required');
  }
});
```

**Access:** Browser prompts for username (demo) and password (password123)

---

## 📊 Feature Comparison by Deployment Type

| Feature | Out of Box | Quick Custom | Production |
|---------|-----------|--------------|------------|
| Voice recording | ✅ | ✅ | ✅ |
| Speech-to-text | ✅ | ✅ | ✅ |
| Agent conversations | ✅ | ✅ | ✅ |
| Text-to-speech | ✅ | ✅ | ✅ |
| Conversation history | ✅ | ✅ | ✅ |
| PWA installation | ✅ | ✅ | ✅ |
| Voice selection | Default | ✅ | ✅ |
| Custom branding | Basic | ✅ | ✅ |
| User authentication | ❌ | Basic | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| Analytics | ❌ | ❌ | ✅ |
| Multi-language | Org config | Org config | ✅ + UI |
| Custom domain | ❌ | ❌ | ✅ |
| Error monitoring | Basic | Basic | ✅ |
| Load balancing | Single dyno | Single dyno | ✅ |

---

## 🎤 Features in Action - What Users Can Do

### Basic User Journey

1. **Open app** (browser or PWA)
2. **Grant microphone permission** (first time only)
3. **Press and hold mic button**
4. **Speak:** "What's the status of my order?"
5. **Release button**
6. **See:** Blue animation → Yellow pulse → Green ripple
7. **Hear:** Agent response with order status
8. **Continue:** Ask follow-up questions

### Advanced User Features

**Conversation Management:**
- Toggle conversation view to see history
- Start new conversation when changing topics
- Return to previous conversation (persisted in session)

**Input Flexibility:**
- Switch between voice and text input
- Type when in noisy environment
- Speak when hands-free is needed

**Audio Control:**
- Mute voice responses in quiet environments
- Re-enable audio when desired
- Preference saved across sessions

**Mobile Experience:**
- Install as app icon
- Works offline (UI only)
- Landscape and portrait modes
- Touch-optimized interface

---

## 🔮 Future Feature Ideas (For Customer Roadmaps)

### Short-term (Can implement quickly)
- [ ] Conversation export (PDF, email)
- [ ] Voice selection in UI (not just code)
- [ ] Dark mode toggle
- [ ] Conversation search
- [ ] Message reactions (👍 👎)

### Medium-term (Moderate effort)
- [ ] Multi-user support with login
- [ ] Agent switching in UI
- [ ] Rich media messages (images, links, cards)
- [ ] Voice notes (save and replay)
- [ ] Conversation sharing

### Long-term (Major features)
- [ ] Real-time streaming responses (like ChatGPT)
- [ ] Multi-modal (voice + screen + documents)
- [ ] Voice biometrics authentication
- [ ] Telephony integration (call in)
- [ ] Video call with avatar
- [ ] Multi-agent conversations

---

## 💡 Tips for Demos and Customization

### Demo Prep Tips

**15 minutes before demo:**
1. ✅ Wake Heroku dyno (visit URL)
2. ✅ Test voice recording
3. ✅ Test agent response
4. ✅ Prepare 3-5 example questions
5. ✅ Check audio/speaker volume

**Demo flow:**
1. Start with voice-only mode (most impressive)
2. Show voice interaction (blue → yellow → green)
3. Toggle on conversation view (show persistence)
4. Demonstrate text input option (flexibility)
5. Show PWA installation (native app feel)
6. Switch to different agent (if prepared)

---

### Customization Tips

**Quick wins:**
- Change voice for different personas
- Swap agents for different use cases
- Rebrand for customer logos/colors

**Avoid common mistakes:**
- Don't change code during live demo
- Always test customizations before demo
- Keep backup deployment with default config
- Document any customizations you make

**Version control:**
- Create branches for customer-specific customizations
- Keep `main` branch as generic template
- Tag releases for stable versions

---

## ❓ Customization FAQ

### Q: Can I use multiple voices in one conversation?

**A:** Not currently out-of-the-box, but can be implemented. You'd need to:
1. Pass voice preference to TTS endpoint
2. Store voice preference per user
3. Add voice selector in UI

---

### Q: Can users pick their own agent?

**A:** Not currently, but can be added:
1. Create multi-agent selector UI
2. Store agent preference per user
3. Pass agent ID dynamically to backend

Currently, one deployment = one agent.

---

### Q: Can I record and save the audio conversations?

**A:** Currently audio is transcribed and discarded (privacy). To save audio:
1. Modify `server/routes.ts` to store audio files
2. Add file storage (AWS S3, Azure Blob)
3. Link audio files to conversation turns
4. Consider privacy/compliance implications

---

### Q: Can the agent send back images or rich content?

**A:** Agent can send text only currently. To add rich media:
1. Agent sends structured response (JSON)
2. Frontend parses and renders appropriately
3. MessageBubble component handles different types
4. Example: Links, images, cards, forms

---

### Q: How do I add my company's logo?

**A:** Replace these files:
- `public/agentforce-logo.png` - Logo in chat (recommended: 200x60px)
- `public/agentforce-icon-192.png` - App icon (192x192px)
- `public/agentforce-icon-512.png` - App icon (512x512px)

Then deploy to Heroku.

---

### Q: Can I white-label this completely?

**A:** Yes! Change:
- App name in `manifest.json`
- Header name in `ChatHeader.tsx`
- All icons in `public/`
- Colors in `index.css`
- Domain name (Heroku custom domains)
- No "Agentforce" branding required

---

### Q: How do I prevent unauthorized access?

**A:** Options:
1. **Simple:** Add basic auth (username/password)
2. **Better:** Integrate Salesforce OAuth
3. **Best:** Custom SSO with your identity provider
4. **Network level:** IP whitelist on Heroku

See "Add Authentication" in Level 4 customization.

---

### Q: Can I charge customers to use this app?

**A:** This is open-source code - you own it! You can:
- Deploy for customers
- White-label it
- Charge for hosting/customization
- Add premium features
- Integrate with billing systems

Just comply with Salesforce licensing for API usage.

---

## 📚 Related Documentation

- **[README.md](./README.md)** - Installation and setup guide
- **[HOW_IT_WORKS.md](./HOW_IT_WORKS.md)** - Technical architecture deep dive
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Development and contribution guide

---

## ✅ Customization Checklist

Use this before deploying custom versions:

**Planning:**
- [ ] Identified target use case
- [ ] Listed required customizations
- [ ] Estimated effort (Level 1-4)
- [ ] Tested customizations locally

**Salesforce Config:**
- [ ] Agent configured and tested
- [ ] Connected Apps created
- [ ] Credentials documented
- [ ] Speech Foundations enabled

**Code Changes:**
- [ ] Voice changed (if needed)
- [ ] Branding updated (if needed)
- [ ] Icons replaced (if needed)
- [ ] Manifest.json updated (if needed)

**Deployment:**
- [ ] Heroku app created
- [ ] Environment variables set
- [ ] Database initialized
- [ ] Deployed successfully

**Testing:**
- [ ] Voice recording works
- [ ] Agent responds correctly
- [ ] Audio playback works
- [ ] PWA installation works
- [ ] Mobile tested (iOS/Android)

**Documentation:**
- [ ] Customizations documented
- [ ] Customer handed off
- [ ] Support plan in place

---

**Ready to customize?** Start with Level 1 (no-code) changes and work your way up as needed. Most demos only need Level 1-2 customizations! 🚀


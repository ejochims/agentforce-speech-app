# How This App Works - Technical Guide for Solution Engineers

> **Purpose:** This guide helps you understand the architecture, data flow, and technical implementation of the Agentforce Speech App so you can confidently demo it and answer customer questions.

## 📋 Executive Summary

This is a **production-ready Progressive Web App (PWA)** that demonstrates the power of Salesforce's AI platform by enabling natural voice conversations with Agentforce agents. It showcases:

- ✅ **Salesforce Speech Foundations API** - Premium voice capabilities (powered by ElevenLabs)
- ✅ **Salesforce Agentforce API** - Intelligent AI agent conversations
- ✅ **Modern web architecture** - React, TypeScript, Node.js
- ✅ **Mobile-first design** - Installable as a native-like app
- ✅ **Real-time voice interaction** - Natural, conversational AI

**Key Selling Points:**
- 100% Salesforce platform (no third-party AI services)
- Voice-first user experience (hands-free operation)
- Context-aware conversations (agent remembers what you said)
- Production-ready deployment (Heroku in minutes)

---

## 🏗️ Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  USER DEVICE (Browser/PWA)                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Frontend - React + TypeScript                          │    │
│  │  • Voice recording (Web Audio API)                      │    │
│  │  • Visual feedback (animations)                         │    │
│  │  • Audio playback                                       │    │
│  │  • Conversation UI                                      │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTPS (REST API)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  HEROKU (Node.js Server)                                        │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Backend - Express + TypeScript                         │    │
│  │  • API endpoints (/transcribe, /chat, /synthesize)      │    │
│  │  • OAuth 2.0 authentication                             │    │
│  │  • Session management                                   │    │
│  │  • Database operations                                  │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL Database                                    │    │
│  │  • Conversations                                        │    │
│  │  • Message history (turns)                              │    │
│  │  • Session data                                         │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────┬──────────────────────┬─────────────────────────────────┘
          │                      │
          ▼                      ▼
┌──────────────────────┐  ┌──────────────────────┐
│  SALESFORCE ORG      │  │  SALESFORCE ORG      │
│  Speech Foundations  │  │  Agentforce API      │
│                      │  │                      │
│  • Speech-to-Text    │  │  • Agent Runtime     │
│  • Text-to-Speech    │  │  • Conversation Mgmt │
│  • ElevenLabs voices │  │  • Topic Routing     │
│                      │  │  • Action Execution  │
└──────────────────────┘  └──────────────────────┘
```

### Three-Tier Architecture

**1. Presentation Layer (Frontend)**
- **Technology:** React 18, TypeScript, Vite
- **Runs:** In user's browser
- **Responsibilities:**
  - User interface and interactions
  - Audio recording (microphone access)
  - Audio playback (speaker output)
  - Visual feedback (animations, status indicators)
  - PWA capabilities (installable app)

**2. Application Layer (Backend)**
- **Technology:** Node.js, Express, TypeScript
- **Runs:** On Heroku dynos
- **Responsibilities:**
  - Secure API gateway to Salesforce
  - OAuth 2.0 credential management
  - Business logic orchestration
  - Session state management
  - Database operations

**3. Data Layer**
- **Technology:** PostgreSQL with Drizzle ORM
- **Runs:** Heroku Postgres add-on
- **Responsibilities:**
  - Conversation persistence
  - Message history storage
  - Session tracking

---

## 🔄 Complete Data Flow - Voice Message Example

Let's trace a complete voice interaction from start to finish:

### Step 1: User Presses Mic Button

**What Happens:**
```
Frontend (VoiceRecordButton.tsx)
  → Requests microphone permission (first time only)
  → Starts MediaRecorder with Web Audio API
  → Displays blue pulsing animation (visual feedback)
  → Streams audio chunks into buffer
```

**Technical Details:**
- Uses browser's `navigator.mediaDevices.getUserMedia()`
- Records in WebM format (Opus codec) for best compatibility
- Fallback to MP4/M4A on Safari/iOS

**User Sees:** Blue animated rings around mic button

---

### Step 2: User Releases Mic Button

**What Happens:**
```
Frontend
  → Stops MediaRecorder
  → Finalizes audio blob
  → Creates FormData with audio file
  → POSTs to /api/transcribe endpoint
  → Shows "Processing..." state
```

**Network Request:**
```http
POST /api/transcribe
Content-Type: multipart/form-data

[audio file binary data]
```

---

### Step 3: Backend Transcribes Speech

**What Happens:**
```
Backend (routes.ts)
  → Receives audio file upload
  → Validates file format and size
  → Calls SpeechFoundationsService.transcribe()
  
SpeechFoundationsService (speech-foundations.ts)
  → Gets OAuth access token (cached or new)
  → Calls Salesforce Speech API
  → Endpoint: https://api.salesforce.com/einstein/platform/v1/
              models/transcribeInternalV1/transcriptions
  → Returns transcribed text
```

**Salesforce API Call:**
```http
POST https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/transcriptions
Authorization: Bearer {access_token}
x-sfdc-app-context: EinsteinGPT

Content-Type: multipart/form-data
file: [audio data]
```

**Response:**
```json
{
  "text": "What's the weather like today?"
}
```

---

### Step 4: Backend Sends to Agentforce

**What Happens:**
```
Backend
  → Receives transcribed text
  → Calls AgentforceService.sendMessage()
  
AgentforceService (agentforce.ts)
  → Creates or retrieves conversation session
  → Gets OAuth access token (cached or new)
  → Calls Agentforce Conversation API
  → Endpoint: https://api.salesforce.com/einstein/ai-agent/v1/
              conversations/{sessionId}/messages
  → Returns agent's response
```

**Salesforce API Call:**
```http
POST https://api.salesforce.com/einstein/ai-agent/v1/conversations/{sessionId}/messages
Authorization: Bearer {access_token}

{
  "agentId": "{SALESFORCE_AGENT_ID}",
  "message": "What's the weather like today?",
  "contextVariables": {}
}
```

**Response:**
```json
{
  "messageId": "msg_abc123",
  "response": "The current weather in San Francisco is sunny with a temperature of 68°F.",
  "conversationId": "conv_xyz789"
}
```

---

### Step 5: Backend Synthesizes Speech

**What Happens:**
```
Backend
  → Takes agent's text response
  → Calls SpeechFoundationsService.synthesize()
  
SpeechFoundationsService
  → Gets OAuth access token
  → Calls Salesforce Speech API (TTS)
  → Endpoint: https://api.salesforce.com/einstein/platform/v1/
              models/transcribeInternalV1/speech-synthesis
  → Specifies voice (default: Allison - millennial)
  → Returns audio file (MP3)
```

**Salesforce API Call:**
```http
POST https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/speech-synthesis
Authorization: Bearer {access_token}

{
  "text": "The current weather in San Francisco is sunny...",
  "voiceId": "xctasy8XvGp2cVO9HL9k",
  "modelId": "eleven_turbo_v2_5"
}
```

**Returns:** Binary audio stream (MP3)

---

### Step 6: Frontend Plays Audio

**What Happens:**
```
Frontend (VoiceChat.tsx)
  → Receives audio blob from backend
  → Creates object URL for audio
  → Initializes Audio element
  → Plays audio through speakers
  → Shows green pulsing animation
  → Updates conversation UI with text
```

**User Sees:** 
- Green animated rings (agent speaking)
- Text appears in chat bubbles
- Hears agent's voice response

---

### Step 7: Save to Database

**What Happens:**
```
Backend (storage.ts)
  → Creates/updates conversation record
  → Inserts user message turn
  → Inserts agent response turn
  → Links turns to conversation
  → Returns updated conversation
```

**Database Operations:**
```sql
-- Create conversation if new
INSERT INTO conversations (session_id, created_at)
VALUES ('abc123', NOW())

-- Insert user message
INSERT INTO turns (conversation_id, role, content, created_at)
VALUES (1, 'user', 'What's the weather like today?', NOW())

-- Insert agent response
INSERT INTO turns (conversation_id, role, content, created_at)
VALUES (1, 'agent', 'The current weather in San Francisco...', NOW())
```

---

## 🔐 Authentication & Security Flow

### OAuth 2.0 Client Credentials Flow

This app uses **two separate OAuth connections** to Salesforce:

#### 1. Agentforce API Authentication

```
Backend Server                          Salesforce Org
     │                                        │
     │ 1. Request access token                │
     │──────────────────────────────────────> │
     │                                        │
     │   POST /services/oauth2/token          │
     │   grant_type: client_credentials       │
     │   client_id: {CONSUMER_KEY}            │
     │   client_secret: {CONSUMER_SECRET}     │
     │                                        │
     │ 2. Return access token                 │
     │ <────────────────────────────────────  │
     │                                        │
     │   { access_token: "00D...", ... }      │
     │                                        │
     │ 3. Call Agentforce API                 │
     │──────────────────────────────────────> │
     │                                        │
     │   Authorization: Bearer {token}        │
     │                                        │
     │ 4. Return response                     │
     │ <────────────────────────────────────  │
```

**Token Caching:**
- Access tokens are cached in memory
- Reused for subsequent API calls
- Automatically refreshed when expired
- Never exposed to frontend

#### 2. Speech Foundations API Authentication

Identical flow but with separate credentials:
- Different Consumer Key/Secret
- Different Connected App
- Independent token management

**Why Two Separate Connections?**
- **Granular permissions** - Each app has minimal required scopes
- **Security isolation** - Compromise of one doesn't affect the other
- **Flexibility** - Can use different orgs for different services

---

## 💾 Database Schema

### Tables Overview

```sql
-- Conversations: Top-level conversation sessions
CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  salesforce_conversation_id TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Turns: Individual messages in conversations
CREATE TABLE turns (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id),
  role TEXT NOT NULL,  -- 'user' or 'agent'
  content TEXT NOT NULL,
  salesforce_message_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Users: Basic user tracking (minimal usage)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Session Management

**Session ID Generation:**
```typescript
// Generated on first conversation
const sessionId = crypto.randomUUID(); // e.g., "123e4567-e89b-12d3-..."

// Stored in browser localStorage
localStorage.setItem('conversationSessionId', sessionId);
```

**Conversation Lifecycle:**
1. User opens app → Frontend generates session ID
2. User sends first message → Backend creates conversation record
3. Subsequent messages → Backend appends to existing conversation
4. User closes app → Session ID persists in localStorage
5. User returns → Loads previous conversation using session ID

---

## 🎨 Frontend Architecture

### Component Hierarchy

```
App.tsx (Root)
  └── VoiceChat.tsx (Main Interface)
       ├── ChatHeader.tsx (Title, logo, controls)
       ├── ConversationHistory (Scrollable messages)
       │    └── MessageBubble.tsx (Each message)
       │         └── AudioVisualizer.tsx (Waveform for audio)
       └── VoiceRecordButton.tsx (Mic button with animations)
            └── AnimatedRings (Visual feedback)
```

### State Management

**React Query (TanStack Query):**
- Manages server state (conversations, messages)
- Automatic caching and refetching
- Optimistic updates for better UX

**React Hooks:**
- `useState` - Component-level state (recording, playing audio)
- `useEffect` - Side effects (audio playback, cleanup)
- `useRef` - DOM references (audio elements, timers)

**Key State Variables:**
```typescript
// Recording state
const [isRecording, setIsRecording] = useState(false);

// Audio playback state
const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

// Conversation data (React Query)
const { data: conversation } = useQuery({
  queryKey: ['conversation', sessionId],
  queryFn: () => fetchConversation(sessionId)
});
```

### Audio Handling

**Recording:**
```typescript
// Initialize MediaRecorder
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mediaRecorder = new MediaRecorder(stream, {
  mimeType: 'audio/webm;codecs=opus' // Best quality/compression
});

// Collect audio chunks
mediaRecorder.ondataavailable = (event) => {
  audioChunks.push(event.data);
};

// Finalize recording
mediaRecorder.onstop = () => {
  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  // Send to backend
};
```

**Playback:**
```typescript
// iOS Safari compatibility fix
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// Play audio
const audio = new Audio(audioUrl);
audio.play()
  .then(() => setIsAgentSpeaking(true))
  .catch(error => console.error('Playback failed:', error));
```

**Visual Feedback States:**
```typescript
// Blue: Recording/Processing user speech
isRecording || isProcessing → Blue animated rings

// Yellow: Agent is thinking (waiting for response)
isWaitingForAgent → Yellow pulsing rings

// Green: Agent is speaking
isAgentSpeaking → Green rippling rings
```

---

## 🛠️ Technology Stack Deep Dive

### Frontend Stack

| Technology | Purpose | Why This Choice |
|------------|---------|-----------------|
| **React 18** | UI framework | Industry standard, component-based, large ecosystem |
| **TypeScript** | Type safety | Prevents bugs, better IDE support, self-documenting |
| **Vite** | Build tool | Lightning-fast dev server, optimized builds |
| **Tailwind CSS** | Styling | Utility-first, consistent design, fast development |
| **Shadcn/ui** | Component library | Accessible, customizable, modern components |
| **React Query** | State management | Server state caching, automatic refetching |
| **Wouter** | Routing | Lightweight React router (2KB vs React Router's 12KB) |

### Backend Stack

| Technology | Purpose | Why This Choice |
|------------|---------|-----------------|
| **Node.js** | Runtime | JavaScript everywhere, async I/O, large ecosystem |
| **Express** | Web framework | Battle-tested, minimal, flexible |
| **TypeScript** | Type safety | Shared types with frontend, prevents bugs |
| **Drizzle ORM** | Database access | Type-safe queries, lightweight, modern |
| **PostgreSQL** | Database | Reliable, ACID compliant, Heroku-native |

### Infrastructure

| Technology | Purpose | Why This Choice |
|------------|---------|-----------------|
| **Heroku** | Hosting | Easy deployment, PostgreSQL add-on, SE-friendly |
| **GitHub** | Source control | Version control, collaboration, CI/CD |

---

## 📡 API Endpoints Reference

### Frontend → Backend

#### 1. Transcribe Speech to Text
```http
POST /api/transcribe
Content-Type: multipart/form-data

Body: audio file (WebM/MP4/M4A)

Response:
{
  "text": "Transcribed user speech",
  "success": true
}
```

#### 2. Send Message to Agent
```http
POST /api/chat
Content-Type: application/json

{
  "message": "User's message text",
  "sessionId": "unique-session-id"
}

Response:
{
  "response": "Agent's text response",
  "conversationId": "salesforce-conv-id",
  "messageId": "salesforce-msg-id"
}
```

#### 3. Synthesize Text to Speech
```http
GET /api/synthesize?text={message}&voice=allison

Response: Binary audio stream (audio/mpeg)
```

#### 4. Get Conversation History
```http
GET /api/conversations/:sessionId

Response:
{
  "id": 1,
  "sessionId": "abc-123",
  "turns": [
    {
      "id": 1,
      "role": "user",
      "content": "Hello",
      "createdAt": "2024-01-15T10:00:00Z"
    },
    {
      "id": 2,
      "role": "agent",
      "content": "Hi! How can I help?",
      "createdAt": "2024-01-15T10:00:02Z"
    }
  ]
}
```

### Backend → Salesforce

#### 1. OAuth Token Request
```http
POST https://{domain}.my.salesforce.com/services/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
client_id={CONSUMER_KEY}
client_secret={CONSUMER_SECRET}

Response:
{
  "access_token": "00D...",
  "instance_url": "https://...",
  "token_type": "Bearer"
}
```

#### 2. Speech-to-Text
```http
POST https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/transcriptions
Authorization: Bearer {token}
x-sfdc-app-context: EinsteinGPT
Content-Type: multipart/form-data

file: [audio binary]

Response:
{
  "text": "Transcribed speech"
}
```

#### 3. Agentforce Chat
```http
POST https://api.salesforce.com/einstein/ai-agent/v1/conversations/{sessionId}/messages
Authorization: Bearer {token}
Content-Type: application/json

{
  "agentId": "{agent-id}",
  "message": "User message",
  "contextVariables": {}
}

Response:
{
  "messageId": "msg-123",
  "response": "Agent response text",
  "conversationId": "conv-456"
}
```

#### 4. Text-to-Speech
```http
POST https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/speech-synthesis
Authorization: Bearer {token}
Content-Type: application/json

{
  "text": "Text to speak",
  "voiceId": "xctasy8XvGp2cVO9HL9k",
  "modelId": "eleven_turbo_v2_5"
}

Response: Binary audio stream (MP3)
```

---

## 🎯 Salesforce Platform Features Demonstrated

### 1. Agentforce (Einstein AI Agent)

**What It Does:**
- Natural language understanding
- Topic routing and intent detection
- Action execution (calls Flows, Apex, APIs)
- Context retention across conversation
- Multi-turn conversations

**How We Use It:**
```typescript
// Send message to agent
const response = await agentforceService.sendMessage(
  sessionId,
  userMessage
);
```

**Customer Value:**
- "Your CRM that talks back"
- Automates complex business processes via natural conversation
- Reduces need for clicking through multiple screens

---

### 2. Speech Foundations API

**What It Does:**
- Speech-to-Text (STT) using industry-leading models
- Text-to-Speech (TTS) with ElevenLabs premium voices
- Multiple voice options and languages
- Low latency (~75ms for TTS)

**How We Use It:**
```typescript
// Speech to Text
const transcript = await speechService.transcribe(audioFile);

// Text to Speech
const audioStream = await speechService.synthesize(text, 'allison');
```

**Customer Value:**
- Hands-free operation for field workers
- Accessibility for users with disabilities
- Modern, consumer-grade UX expectations

---

### 3. Connected Apps (OAuth 2.0)

**What It Does:**
- Secure authentication without username/password
- Client credentials flow for server-to-server
- Granular permission scoping
- Centralized credential management

**How We Use It:**
- Two separate Connected Apps (Agentforce + Speech)
- Server-side authentication only
- Credentials never exposed to frontend

**Customer Value:**
- Enterprise-grade security
- No user credentials needed for integration
- Audit trail of API usage

---

### 4. External Client Apps

**What It Does:**
- Modern OAuth management for platform APIs
- Replaces legacy Connected Apps for some use cases
- Better suited for Einstein platform APIs

**How We Use It:**
- Speech Foundations authentication
- Client credentials flow
- API-only user context

---

## 🎤 Demo Talking Points for SEs

### Opening (30 seconds)

> "What you're seeing is a production-ready voice interface for Salesforce Agentforce. Instead of typing or clicking, users can have natural conversations with their CRM using voice. This is built 100% on the Salesforce platform - no third-party AI services."

### Voice Quality (Show, don't tell)

> "Notice the voice quality - that's ElevenLabs, the same premium voice technology used by major consumer apps. Salesforce Speech Foundations gives you access to this enterprise-grade voice AI with simple API calls."

### Real-time Feedback

> "Watch the visual feedback - blue means the app is listening, yellow means the agent is thinking, green means the agent is speaking. This creates a natural, conversational flow just like talking to a real person."

### Architecture Simplicity

> "From a technical standpoint, this is surprisingly simple:
> 1. Voice goes to Salesforce Speech API - gets text back
> 2. Text goes to Agentforce - gets intelligent response back
> 3. Response goes to Speech API - gets voice back
> 
> All authenticated with standard OAuth, all built on Salesforce platform APIs."

### Mobile Experience

> "This is a Progressive Web App, which means it installs like a native app on iOS and Android. No app store approval needed, no separate codebases - one web app works everywhere."

### Customization

> "Here's the best part - you can swap out the Agentforce agent without changing any code. Want a different voice? Change one parameter. Different agent? Update one environment variable. The architecture is designed for flexibility."

---

## ❓ Common Customer Questions & Answers

### Q: "Is this using OpenAI or ChatGPT?"

**A:** "No, this uses 100% Salesforce platform capabilities:
- **Agentforce** for the AI agent (your Salesforce data, your business logic)
- **Speech Foundations** for voice (which partners with ElevenLabs for premium voices)
- All authentication, all data, all processing happens in your Salesforce org."

---

### Q: "Can it access my Salesforce data?"

**A:** "Absolutely! That's the power of Agentforce. The agent you configure can:
- Query Salesforce objects (Accounts, Cases, Opportunities, etc.)
- Execute Flows to update data
- Call Apex methods for custom logic
- Integrate with external systems via APIs

This demo uses a basic agent, but in production, it would have full access to your CRM data based on the permissions you configure."

---

### Q: "Is the voice data secure?"

**A:** "Yes, multiple layers of security:
1. **In transit:** All communication is HTTPS encrypted
2. **At rest:** Audio files are processed in real-time, not stored
3. **Authentication:** OAuth 2.0 with client credentials flow
4. **Isolation:** Each deployment has its own database and credentials
5. **Compliance:** Salesforce Speech Foundations is SOC 2 certified

The audio is transcribed immediately and then discarded - we only store the text in the conversation history."

---

### Q: "How much does this cost to run?"

**A:** "Infrastructure costs are minimal:
- **Heroku Hosting:** ~$10/month (Eco dyno + PostgreSQL)
- **Salesforce APIs:** Included in your org's API limits
  - Speech Foundations: Check your org's entitlements
  - Agentforce: Based on your license tier

The bigger cost consideration is Salesforce licensing (Agentforce seats, Speech API usage), not the hosting infrastructure."

---

### Q: "Can this work offline?"

**A:** "The PWA capabilities allow the UI to load offline, but the core functionality requires internet:
- **Why:** Voice processing and AI inference happen in Salesforce cloud
- **Offline capability:** The app shell loads instantly, shows cached conversations
- **Online required:** New conversations, voice processing, agent responses

This is by design - you get the latest AI models and your current Salesforce data."

---

### Q: "What about languages?"

**A:** "Salesforce Speech Foundations supports multiple languages. You can:
- Configure STT (Speech-to-Text) for different languages
- Use different voice models for TTS (Text-to-Speech)
- Agentforce can understand and respond in multiple languages based on configuration

The app architecture doesn't limit language support - it's determined by your Salesforce org configuration."

---

### Q: "How does it compare to Siri/Alexa/Google Assistant?"

**A:** "Great question! Key differences:
- **Your data:** Agentforce knows your Salesforce CRM data (customer history, open cases, etc.)
- **Your actions:** Can execute your business processes (create cases, update records, run workflows)
- **Your control:** You define the agent's knowledge, guardrails, and capabilities
- **Enterprise security:** Runs in your Salesforce org with your security policies

Consumer assistants are general-purpose. This is purpose-built for your business."

---

### Q: "Can we customize the UI?"

**A:** "Absolutely! It's open source and built with standard web technologies:
- **Branding:** Colors, logos, fonts (all in Tailwind CSS)
- **Components:** React components you can modify
- **Behavior:** Adjust animations, add features, change workflows
- **White-label:** Completely rebrand for different customers

The architecture separates UI from logic, making customization straightforward."

---

## 🔧 Customization Guide for SEs

### Quick Customization Options (No Code Changes)

#### 1. Change the Agent
```bash
# In Heroku dashboard → Settings → Config Vars
SALESFORCE_AGENT_ID=0Xx... # Your new agent ID
```
**Restart required:** Yes (automatic on config change)

#### 2. Change the Voice
Edit `server/routes.ts`, line ~207:
```typescript
const voiceMapping: { [key: string]: string } = {
  'allison': 'xctasy8XvGp2cVO9HL9k',  // Default: Millennial female
  'shimmer': 'pNInz6obpgDQGcFmaJgB',  // Clear male
  'onyx': 'VR6AewLTigWG4xSOukaG',     // Strong male
  'echo': '21m00Tcm4TlvDq8ikWAM',     // Deep male
  'nova': 'pMsXgVXv3BLzUgSXRplE',     // Expressive female
};

// Change default:
const { text, voice = 'onyx' } = req.query; // Now uses Onyx
```

#### 3. Adjust App Title/Branding
Edit `client/src/components/ChatHeader.tsx`:
```typescript
<h1 className="text-xl font-semibold">
  Your Company Name - AI Assistant
</h1>
```

Edit `public/manifest.json`:
```json
{
  "name": "Your Company AI Assistant",
  "short_name": "AI Assistant",
  "description": "Your custom description"
}
```

---

### Advanced Customization (Code Changes)

#### Add Authentication
```typescript
// server/index.ts - Add before other routes
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (token === process.env.SECRET_TOKEN) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});
```

#### Add Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

#### Add Custom Context to Agent
```typescript
// server/agentforce.ts - sendMessage method
const response = await fetch(url, {
  method: 'POST',
  headers: this.getHeaders(accessToken),
  body: JSON.stringify({
    agentId: this.agentId,
    message: userMessage,
    contextVariables: {
      userLocation: 'San Francisco',
      userTier: 'Premium',
      sessionId: conversationId
      // Add any context your agent needs
    }
  })
});
```

---

## 🐛 Troubleshooting Guide for SEs

### Issue: "No audio playback on iPhone"

**Cause:** iOS requires user interaction before playing audio

**Solution:**
1. Ensure user taps/clicks before first playback
2. App already handles this - audio plays after user releases mic button
3. If still failing, check iPhone is not in silent mode

**Demo Tip:** Mention this shows proper iOS development practices

---

### Issue: "Agent responses are slow"

**Possible Causes:**
1. **Heroku dyno asleep** - First request after 30min idle is slow
2. **Agentforce agent complexity** - Complex agents with many topics take longer
3. **Network latency** - User's internet connection

**Solutions:**
1. Visit app URL 5 min before demo (wakes dyno)
2. Simplify agent for demos (fewer topics)
3. Use paid Heroku dyno (never sleeps)

**Demo Tip:** "In production, you'd use an always-on dyno"

---

### Issue: "Authentication failed" errors

**Cause:** Invalid or expired credentials

**Check:**
```bash
# View current config
heroku config -a your-app-name

# Verify each variable is set:
# - SALESFORCE_DOMAIN_URL
# - SALESFORCE_CONSUMER_KEY
# - SALESFORCE_CONSUMER_SECRET
# - SALESFORCE_AGENT_ID
# - SALESFORCE_SPEECH_CONSUMER_KEY
# - SALESFORCE_SPEECH_CONSUMER_SECRET
```

**Common mistakes:**
- Extra spaces in config vars
- Using sandbox URLs instead of production (or vice versa)
- Consumer secret expired (regenerate in Salesforce)

---

### Issue: "Microphone not working"

**Browser Permissions:**
- Chrome/Safari require HTTPS for microphone access
- Heroku provides HTTPS automatically
- User must explicitly grant permission

**Demo Tip:** 
"Notice how the browser asks for permission - this is a security feature. In production, you'd only need to grant this once."

---

## 📊 Performance Characteristics

### Latency Breakdown (Typical)

| Stage | Time | Notes |
|-------|------|-------|
| **Voice recording** | 1-5 sec | User-controlled |
| **Upload to server** | 100-500ms | Depends on connection |
| **Speech-to-Text** | 500-1500ms | Salesforce API processing |
| **Agentforce response** | 1-3 sec | Depends on agent complexity |
| **Text-to-Speech** | 500-1000ms | Salesforce API + ElevenLabs |
| **Audio playback** | 2-10 sec | Depends on response length |
| **Total (user perspective)** | 5-15 sec | Feels conversational |

### Optimization Opportunities

**Client-side:**
- Streaming audio playback (start playing before complete)
- Optimistic UI updates (show message immediately)
- Audio compression (already using Opus codec)

**Server-side:**
- Parallel API calls where possible
- Token caching (already implemented)
- Connection pooling to Salesforce

**Infrastructure:**
- CDN for static assets
- Redis for session caching
- WebSocket for real-time updates

---

## 🚀 Deployment Best Practices

### For Demos

```bash
# 1. Create demo-specific deployment
heroku create customer-demo-acme-2024

# 2. Use sandbox org for safety
SALESFORCE_DOMAIN_URL=https://yourcompany--sandbox.my.salesforce.com

# 3. Create simple demo agent
# - 2-3 topics max
# - Clear, concise responses
# - No sensitive data

# 4. Test thoroughly before demo
# - Record voice messages
# - Check audio playback
# - Verify agent responses

# 5. Wake dyno 15 min before demo
curl https://customer-demo-acme-2024.herokuapp.com

# 6. After demo, delete or disable
heroku apps:destroy customer-demo-acme-2024
```

### For Production

```bash
# 1. Use production-grade Heroku dyno
heroku ps:resize web=standard-1x

# 2. Enable automated backups
heroku pg:backups:schedule --at '02:00 America/Los_Angeles'

# 3. Add monitoring
heroku addons:create papertrail  # Logs
heroku addons:create librato      # Metrics

# 4. Set up CI/CD
# - GitHub Actions for automated deploys
# - Staging environment for testing

# 5. Configure custom domain
heroku domains:add voice.yourcompany.com
```

---

## 📚 Additional Resources

### Salesforce Documentation
- [Agentforce Developer Guide](https://developer.salesforce.com/docs/einstein/genai/guide/agentforce.html)
- [Speech Foundations API Reference](https://developer.salesforce.com/docs/einstein/genai/guide/speech-foundations.html)
- [Connected Apps Guide](https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm)

### Development Resources
- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Heroku Dev Center](https://devcenter.heroku.com/)

### This App
- [GitHub Repository](https://github.com/ejochims/agentforce-speech-app)
- [Installation Guide](./README.md)
- [Contributing Guide](./CONTRIBUTING.md)

---

## 💡 Ideas for Customer Conversations

### Discovery Questions

1. **"What manual processes do your team members handle repeatedly?"**
   → Position voice interface as automation opportunity

2. **"Do your field workers need hands-free access to information?"**
   → Highlight voice-only mode for mobile workers

3. **"How much time does your team spend searching for information in CRM?"**
   → Show how natural language queries are faster than clicking

4. **"Are you thinking about AI, but not sure where to start?"**
   → This is a concrete, tangible implementation

### Value Propositions

**For IT/Technical Buyers:**
- "Built on Salesforce platform - no additional security review needed"
- "OAuth 2.0 authentication - integrates with your existing SSO"
- "Open source - you own the code and can customize freely"
- "Modern tech stack - easy to find developers who know React/Node"

**For Business Buyers:**
- "Reduces training time - users already know how to talk"
- "Increases adoption - more accessible than complex UI"
- "Enables multitasking - hands-free operation while doing other work"
- "Future-proof - positions you for voice-first future"

**For Executives:**
- "Differentiates customer experience with modern AI capabilities"
- "Leverages existing Salesforce investment - no rip and replace"
- "Scalable architecture - start with pilot, expand to enterprise"
- "Measurable ROI - track time savings, adoption rates, satisfaction scores"

---

## 🎯 Success Metrics to Track

If a customer deploys this, suggest tracking:

**Adoption Metrics:**
- Number of voice interactions per day
- Unique users engaging with voice interface
- Percentage of users who return after first use

**Performance Metrics:**
- Average conversation length
- Time to resolution (voice vs. traditional UI)
- Task completion rate

**Business Metrics:**
- Reduction in support tickets
- Increase in field worker productivity
- Customer satisfaction scores
- Time saved per interaction

**Technical Metrics:**
- API call volume and costs
- Error rates and types
- Average response latency
- Uptime/availability

---

## 🔮 Future Enhancement Ideas

Share these with customers as "art of the possible":

**Short-term (Low Effort):**
- Add conversation export (PDF, email transcript)
- Multi-language support
- Custom voice selection per user
- Dark mode theme toggle

**Medium-term (Moderate Effort):**
- Salesforce authentication (only employees can access)
- CRM record linking (attach conversations to Accounts/Cases)
- Sentiment analysis of conversations
- Admin dashboard for usage analytics

**Long-term (Higher Effort):**
- Real-time streaming (like ChatGPT)
- Voice biometrics for authentication
- Multi-modal (voice + screen sharing + documents)
- Telephony integration (call in to your agent)

---

## ✅ Pre-Demo Checklist

Print this and check before every demo:

- [ ] Heroku app is deployed and running
- [ ] Visited URL 15 minutes ago (woke dyno)
- [ ] Tested voice recording (microphone works)
- [ ] Tested agent response (correct agent ID)
- [ ] Tested audio playback (speakers work)
- [ ] Tested on demo device (phone/laptop)
- [ ] Backup plan ready (screen recording if live fails)
- [ ] Demo script prepared (questions that showcase agent)
- [ ] Customer context researched (industry, use cases)
- [ ] Credentials secured (never share screen with config vars)

---

**Questions?** Review the [Installation Guide](./README.md) or reach out to your team's Agentforce specialists.

**Ready to demo?** Remember: Focus on the business value, not just the tech. This prototype shows what's possible when you combine Salesforce's AI platform with modern UX design.

🎤 **Good luck with your demos!**


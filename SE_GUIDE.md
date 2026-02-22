# SE Guide: Agentforce Speech App

> One reference for Salesforce Solution Engineers to understand, demo, customize, and extend this app.

**Jump to:**
[Architecture](#architecture) · [How It Works](#how-it-works) · [API Reference](#api-reference) · [Built-In Features](#built-in-features) · [Agent Types](#agent-types-service-vs-employee) · [Customization](#customization) · [Demo Playbook](#demo-playbook) · [Customer Q&A](#customer-qa) · [Troubleshooting](#troubleshooting) · [Development Guide](#development-guide) · [Performance](#performance)

---

## Architecture

```
Client (React 18 + TypeScript + Vite)
    ├── PWA shell (service worker, manifest, offline UI)
    ├── Voice recording (MediaRecorder — WebM/Opus, M4A fallback for iOS Safari)
    ├── SSE streaming consumer with early TTS latency optimization
    ├── Agent Transparency Panel (per-request observability)
    ├── Animated UI (Tailwind + shadcn/ui)
    └── Server state via React Query; routing via wouter (2KB)

Server (Node.js + Express + TypeScript)
    ├── Salesforce Agentforce API client
    │     └── SSE streaming endpoint with JSON fallback + conversation expiry recovery
    ├── Salesforce Speech Foundations API proxy (STT + TTS)
    ├── Two independent OAuth2 client-credentials connections
    │     └── In-memory token caching with 25-min expiry
    └── IStorage interface → MemStorage (default) or PostgreSQL (swap-in)

Database (PostgreSQL via Drizzle ORM)
    ├── Conversation sessions
    └── Message turns (user + agent, with Salesforce message IDs)
```

```
┌─────────────────────────────────────────────────────────────────┐
│  USER DEVICE (Browser/PWA)                                      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Frontend — React + TypeScript                          │    │
│  │  • Voice recording (Web Audio API)                      │    │
│  │  • Visual feedback (animations)                         │    │
│  │  • Audio playback                                       │    │
│  │  • Conversation UI                                      │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTPS (REST / SSE)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│  HEROKU (Node.js Server)                                        │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Backend — Express + TypeScript                         │    │
│  │  • /api/stt  /api/agentforce  /api/tts                  │    │
│  │  • OAuth 2.0 authentication + token caching             │    │
│  │  • Session management + database operations             │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  PostgreSQL — conversations, turns, settings            │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────┬──────────────────────┬─────────────────────────────────┘
          │                      │
          ▼                      ▼
┌──────────────────────┐  ┌──────────────────────┐
│  Speech Foundations  │  │  Agentforce API       │
│  • STT (Scribe v1)   │  │  • Agent runtime      │
│  • TTS (ElevenLabs)  │  │  • Conversation mgmt  │
└──────────────────────┘  └──────────────────────┘
```

### Key Technical Decisions

**SSE streaming with graceful fallback.** `/api/agentforce/stream` exposes Agentforce responses as Server-Sent Events. If the SSE endpoint is unavailable or returns an error, the client transparently falls back to the blocking `/api/agentforce` endpoint. Conversation expiry (404) triggers automatic session recovery.

**Early TTS latency optimization.** The streaming client watches for the first complete sentence (`.`, `!`, `?`) and fires TTS immediately. Users hear audio start while generation continues — cutting perceived latency significantly.

**Dual independent OAuth2 connections.** Agentforce API and Speech Foundations each use separate Connected Apps with their own client credentials, minimal scopes, and independent token caching. Credentials are never exposed to the frontend.

**Agent Transparency Panel.** Collapsible sidebar (bottom sheet on mobile) showing per-request pipeline timing, Agentforce session IDs, message type breakdowns, and expandable raw API responses — built for technical demo reviews.

**iOS Safari audio handling.** `unlockAudioForSafari()` fires on `onBeforeRecording` to unlock the audio context during the user gesture. A single "blessed" `HTMLAudioElement` ref is reused for TTS playback to avoid autoplay restrictions.

**Storage interface abstraction.** `IStorage` defines all CRUD ops; `MemStorage` (default) uses in-memory Maps with no database required. Swapping to PostgreSQL means implementing `IStorage` and replacing the export.

---

## How It Works

### Complete Voice Interaction — Step by Step

**Step 1 — User presses mic button**

Frontend starts `MediaRecorder` (WebM/Opus; M4A fallback on Safari), displays blue animation, buffers audio chunks.

**Step 2 — User releases mic button**

Frontend finalizes the audio blob, POSTs it as multipart to `/api/stt`, shows amber "processing" animation.

**Step 3 — Backend transcribes speech**

```
SpeechFoundationsClient
  → gets OAuth token (cached or new)
  → POST https://api.salesforce.com/einstein/platform/v1/
          models/transcribeInternalV1/transcriptions
  → returns { "transcription": ["User's words"] }
```

Headers: `Authorization: Bearer {token}`, `x-sfdc-app-context: EinsteinGPT`, `x-client-feature-id: external-edc`

**Step 4 — Backend sends to Agentforce**

```
AgentforceClient
  → if new conversation: POST /agents/{agentId}/sessions
        body: { externalSessionKey, instanceConfig, streamingCapabilities }
  → POST /sessions/{sessionId}/messages
        body: { message: { sequenceId, type: "Text", text } }
  → streams SSE chunks or returns blocking JSON
```

**Step 5 — Backend synthesizes speech**

```
SpeechFoundationsClient
  → POST https://api.salesforce.com/einstein/platform/v1/
          models/transcribeInternalV1/speech-synthesis
        body: input=<text>, request={"engine":"elevenlabs","voice_id":"...","language":"en"}
  → returns { "audioStream": "<base64 MP3>" }
  → decoded to Buffer, streamed to frontend as audio/mpeg
```

**Step 6 — Frontend plays audio**

Receives audio blob, plays via reused `HTMLAudioElement`, shows green animation. Text appears in conversation UI simultaneously.

**Step 7 — Save to database**

Conversation row created (UUID), user turn inserted, agent turn inserted, Agentforce `session_id` stored for context continuity across subsequent messages.

---

### Visual Feedback States

| Color | State |
|-------|-------|
| Blue | Recording |
| Amber | STT processing |
| Purple | Agent thinking |
| Green | Agent speaking |

---

### Authentication

Both connections use OAuth 2.0 Client Credentials (server-to-server only):

```
Backend                             Salesforce
  │  POST /services/oauth2/token        │
  │  grant_type=client_credentials      │
  │  client_id + client_secret ──────>  │
  │  <──── { access_token: "00D..." }   │
  │  API call with Bearer token ──────> │
  │  <──── response ─────────────────── │
```

Tokens cached in memory, auto-refreshed at 25-min expiry. Credentials never reach the frontend.

---

### Database Schema

```sql
CREATE TABLE conversations (
  id        VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title     TEXT NOT NULL,
  status    VARCHAR NOT NULL DEFAULT 'active',
  session_id TEXT,   -- Agentforce session ID (nullable)
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE turns (
  id               VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  VARCHAR NOT NULL REFERENCES conversations(id),
  role             VARCHAR NOT NULL,  -- 'user' | 'assistant'
  text             TEXT NOT NULL,
  audio_url        TEXT,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE settings (
  id              VARCHAR PRIMARY KEY DEFAULT 'default',
  voice           VARCHAR NOT NULL DEFAULT 'allison',
  language        VARCHAR NOT NULL DEFAULT 'en-US',
  stt_provider    VARCHAR NOT NULL DEFAULT 'salesforce',
  tts_provider    VARCHAR NOT NULL DEFAULT 'salesforce',
  agentforce_mode VARCHAR NOT NULL DEFAULT 'real'
);
```

Two distinct "session" concepts:
- **Conversation ID** (UUID) — app-level, stored in browser `localStorage`, persists across page loads
- **Agentforce Session ID** — Salesforce API-level, stored in `conversations.session_id`, reused across turns for context continuity

---

### Frontend Component Hierarchy

```
App.tsx
  └── VoiceChat.tsx (entire UI)
       ├── <header> (title, mode toggle, history drawer, settings)
       ├── <main>
       │    ├── Conversation mode: MessageBubble.tsx + MessageSkeleton.tsx
       │    └── Voice-only mode: ambient orb (inline JSX)
       ├── AgentTransparencyPanel.tsx (sidebar/bottom sheet)
       └── <footer>
            ├── VoiceRecordButton.tsx
            │    └── AudioVisualizer.tsx (live waveform)
            └── Text input row (inline)
```

State: React Query for server state (conversations, turns); `useState`/`useRef` for local UI state.

---

## API Reference

### Frontend → Backend

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/stt` | Multipart audio → `{ text, transparency }` |
| POST | `/api/agentforce` | `{ text, conversationId }` → agent response JSON |
| POST | `/api/agentforce/stream` | `{ text, conversationId }` → SSE chunks |
| GET | `/api/tts?text=...&voice=allison` | Text → `audio/mpeg` stream |
| POST | `/api/tts` | `{ text, voice }` → `audio/mpeg` stream |
| CRUD | `/api/conversations` | Conversation persistence |
| CRUD | `/api/conversations/:id/turns` | Turn persistence |
| GET/PUT | `/api/settings` | App settings |

**SSE stream events:**
```
event: chunk   data: {"text": "partial..."}
event: done    data: {"text": "full", "conversationId": "...", "sessionId": "...", "transparency": {...}}
event: error   data: {"error": "message"}
```

### Backend → Salesforce

| Call | Endpoint |
|------|----------|
| OAuth token | `POST {domain}/services/oauth2/token` |
| STT | `POST api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/transcriptions` |
| Start session | `POST api.salesforce.com/einstein/ai-agent/v1/agents/{id}/sessions` |
| Send message | `POST api.salesforce.com/einstein/ai-agent/v1/sessions/{id}/messages` |
| TTS | `POST api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/speech-synthesis` |

---

## Built-In Features

### Voice Interaction
- Press-and-hold mic to record; release to send
- Speech-to-Text via Salesforce Speech Foundations (ElevenLabs Scribe v1)
- SSE streaming responses with early TTS — first sentence plays before full response arrives
- Text-to-Speech via ElevenLabs voices through Speech Foundations (~75ms latency)
- Text input fallback for noisy environments

### User Interface
- **Voice-Only Mode** — minimal UI, large mic button, state-driven animations; ideal for live demos
- **Conversation View Mode** — full chat bubble history with timestamps; ideal for technical reviews
- **Agent Transparency Panel** — real-time pipeline timing, session IDs, raw API response viewer
- **Audio toggle** — mute/unmute voice responses; preference persists
- **Dark mode** — available via Settings

### PWA
- Installable: iOS (Safari → Add to Home Screen), Android (Chrome → Install app), desktop
- App shell loads offline; new AI interactions require internet

### Session & Data
- Conversations auto-saved to PostgreSQL; UUID persists in `localStorage`
- Multi-turn context: agent remembers conversation within a session
- History drawer: view past conversations or start a new one to reset context

---

## Agent Types: Service vs. Employee

**TL;DR:** This prototype uses **Agentforce Service Agent** — right for demos and customer-facing POCs. Employee Agent requires user-level OAuth and is better for internal tools where per-user record access matters.

| Aspect | Service Agent (current) | Employee Agent (requires work) |
|--------|------------------------|-------------------------------|
| Authentication | None (anonymous) | User logs in with Salesforce |
| OAuth flow | Client Credentials (bot user) | User-Delegated (logged-in user) |
| Data access | Bot user's permissions | Individual user's permissions |
| Sharing rules enforced | No | Yes |
| Deployment time | ~30 min | 30 min + OAuth setup (~2–3 hrs) |
| Best for | Demos, customer-facing, field service | Internal employees, personalized data |

### Use Service Agent when:
- Demoing to prospects or showing customer-facing scenarios
- Field service (hands-free, no login friction)
- Quick POCs where anyone should be able to try it immediately
- Users don't need personalized per-user data

### Consider Employee Agent when:
- Internal employee tools (HR, IT, sales reps seeing their own data)
- Record-level security and sharing rules must be enforced
- Compliance requires user-specific audit trails

### What Employee Agent support would require
1. OAuth Web Server Flow — replace client credentials with user login + auth code exchange
2. User session management — store/refresh per-user tokens, login/logout lifecycle
3. Frontend — login page, OAuth redirect handling, user identity display, logout
4. Backend — per-user token storage, session middleware, token refresh
5. DB — link conversations to users, store sessions securely

**Estimated effort:** 2–3 days. Standard OAuth (like "Login with Google"), but meaningful architecture addition.

**Positioning for customers:**
> "This prototype demonstrates voice + AI capabilities with Service Agent — no login friction, deploy in 30 minutes. For internal scenarios where individual permissions matter, Employee Agent support is a standard OAuth implementation — about 2–3 days of work."

---

## Customization

### Level 1: No code — Heroku Config Vars

**Swap the agent:**
```bash
heroku config:set SALESFORCE_AGENT_ID=0XxNEWID123 -a your-app-name
# App restarts automatically — no code change needed
```

**Point to a different org** (sandbox, production, different customer):
```bash
heroku config:set SALESFORCE_DOMAIN_URL=https://other-org.my.salesforce.com
heroku config:set SALESFORCE_SPEECH_DOMAIN_URL=https://other-org.my.salesforce.com
```

---

### Level 2: Simple code edits

#### Change the voice

Edit `server/routes.ts`, GET `/api/tts` handler:

```typescript
const { text, voice = 'allison' } = req.query; // change default here
```

| Name | Character |
|------|-----------|
| `allison` | Millennial female, conversational (default) |
| `shimmer` | Clear male, neutral |
| `alloy` | Mature male, warm |
| `echo` | Deep male, professional |
| `onyx` | Strong male, assertive |
| `nova` | Expressive female, energetic |
| `fable` | Expressive female, animated |

#### Rebrand the app

| What | Where |
|------|-------|
| Agent name in header | `client/src/components/ChatHeader.tsx` — `agentName` default |
| PWA name on home screen | `public/manifest.json` — `name`, `short_name`, `description` |
| Theme/background color | `public/manifest.json` — `theme_color`, `background_color` |
| App icons | Replace `public/agentforce-icon-192.png` + `agentforce-icon-512.png` (PNG, square) |
| In-app logo | Replace `public/agentforce-logo.png` |

#### Change animation colors

`client/src/index.css`:
```css
--recording-active: 59 130 246;  /* blue  — recording    */
--processing: 234 179 8;          /* amber — STT/thinking */
--speaking: 34 197 94;            /* green — agent speaking */
```

---

### Level 3: Salesforce configuration (no code)

Everything the agent knows and can do lives in Salesforce — not in this app.

- **Topics** — what the agent helps with; each has instructions and actions
- **Instructions** — personality, tone, response length, guardrails
- **Data sources** — Knowledge articles, Salesforce objects, external APIs
- **Actions** — Flows, Apex, Platform Events, Quick Actions

Setup → Agentforce Agents → your agent → Open in Builder → Activate → Deploy. No app code changes needed.

---

### Level 4: Advanced (requires development)

#### Basic password protection
```typescript
// server/index.ts — add before other routes
app.use((req, res, next) => {
  const expected = 'Basic ' + Buffer.from('demo:password123').toString('base64');
  if (req.headers.authorization === expected) { next(); }
  else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Demo"');
    res.status(401).send('Authentication required');
  }
});
```

#### Rate limiting
```typescript
import rateLimit from 'express-rate-limit';
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
```

#### Context variables for the agent
```typescript
// server/agentforce.ts — sendMessage body
contextVariables: {
  userLocation: 'San Francisco',
  customerTier: 'Premium',
  accountId: 'ACC-12345'
}
```

#### Add a new API endpoint
```typescript
// 1. shared/schema.ts
export const mySchema = z.object({ /* fields */ });

// 2. server/routes.ts
app.post('/api/my-feature', async (req, res) => {
  const data = mySchema.parse(req.body);
  res.json(result);
});
```

---

### Common Scenarios

**Industry-specific demo (e.g., healthcare):**
Change app name, replace icons, configure agent with healthcare topics, use `alloy` or `shimmer` voice.

**Field service demo:**
Default voice-only mode, use `onyx` for noisy environments, configure agent with work order / inventory topics.

**Customer-facing production app:**
Add Salesforce OAuth login, per-user conversation history, rate limiting, production agent with escalation rules, analytics, custom domain.

**Internal employee assistant:**
Employee Agent + Salesforce SSO (see [Agent Types](#agent-types-service-vs-employee)), HR/IT topics, employee context variables.

---

## Demo Playbook

### Three modes

| Mode | When to use |
|------|-------------|
| **Voice-Only** (hide conversation) | Executives — clean, theatrical, immediately understandable |
| **Hybrid** (show conversation) | Technical reviews — shows persistence and multi-turn context |
| **Transparency** (open panel) | Technical buyers — real-time pipeline timing, raw API responses |

### Demo flow

1. Open in voice-only mode — most striking first impression
2. Speak a question — show blue → amber → purple → green progression
3. Toggle conversation view on — demonstrate persistence and context
4. Ask a follow-up — show multi-turn memory
5. Open Transparency Panel — for technical audiences
6. Mention agent swap — one env var, different industry, same app

### Talking points

**Opening:**
> "A production-ready voice interface for Salesforce Agentforce — built 100% on the Salesforce platform, no third-party AI."

**Voice quality:**
> "That's ElevenLabs, delivered through Salesforce Speech Foundations. Premium consumer-grade voice via a simple API call."

**Visual states:**
> "Blue is listening, amber is transcribing, purple is thinking, green is speaking — four states that make the AI feel alive."

**Architecture:**
> "Three API calls: voice to Speech Foundations → text to Agentforce → response back to Speech Foundations. All OAuth-authenticated, all Salesforce."

**Mobile:**
> "Progressive Web App — installs like a native app on iOS and Android in seconds. No App Store needed."

**Customization:**
> "Swap the agent with one environment variable. Different industry, different use case, same app."

### Before every demo

- [ ] Visit Heroku URL 15 minutes early (wakes dyno)
- [ ] Test voice recording on the actual demo device
- [ ] Test end-to-end agent response
- [ ] Prepare 3–5 questions tuned to your agent's topics
- [ ] Check audio volume and mic permissions
- [ ] Have a screen recording backup
- [ ] Never show Config Vars on screen

---

## Customer Q&A

**"Is this using OpenAI or ChatGPT?"**
No — 100% Salesforce platform. Agentforce for AI, Speech Foundations for voice. Your data, your business logic, Salesforce infrastructure.

**"Can it access my Salesforce data?"**
Yes. The Agentforce agent can query objects, run Flows, call Apex, trigger Platform Events — based on the permissions you configure. This demo uses a basic agent; in production it has full access to whatever you set up.

**"Is voice data secure?"**
All traffic is HTTPS. Audio is transcribed in real time and discarded — only text is stored. OAuth 2.0 client credentials flow, credentials never reach the frontend. Salesforce Speech Foundations is SOC 2 certified.

**"How much does it cost?"**
Heroku hosting is ~$10/month (Eco dyno + Postgres Essential). Salesforce API costs depend on your org's Agentforce and Speech Foundations entitlements.

**"Can it work offline?"**
The PWA shell loads instantly and shows cached conversations offline. New interactions require internet — processing runs in Salesforce cloud.

**"What about languages?"**
Speech Foundations supports multiple languages for STT and TTS. Agentforce can respond in multiple languages based on agent configuration. The app doesn't limit this.

**"How does it compare to Siri/Alexa/Google Assistant?"**
Consumer assistants are general-purpose. This is purpose-built: your CRM data, your business processes, your security policies, in your Salesforce org.

**"Can we customize the UI?"**
Open source, standard React + TypeScript — brand it, restyle it, white-label it completely.

**"Can this work with Employee Agent?"**
Yes, technically feasible. Currently uses Service Agent (no login required). Employee Agent adds Salesforce OAuth login and per-user session management — standard implementation, about 2–3 days of work.

---

## Troubleshooting

### Deployment

| Error | Cause | Fix |
|-------|-------|-----|
| "Failed to parse URL" | Domain URL missing `https://` | Config Vars → add `https://` prefix |
| 401 Unauthorized | Bad credentials or propagation delay | Verify Consumer Key/Secret; wait 2–10 min after Connected App changes; confirm Client Credentials Flow is enabled and app is linked to agent |
| "Agent not found" | Wrong Agent ID or not deployed | Verify `SALESFORCE_AGENT_ID`; confirm agent is activated, deployed, and Connected App is added under Connections |
| Database not provisioned | Auto-provision failed | Resources → add Heroku Postgres Essential-0; Run console → `npm run db:push` |

**Common config mistakes:**
- Extra spaces in config var values
- Sandbox URL when production is needed (or vice versa)
- Consumer secret expired — regenerate in Salesforce

### During demos

| Issue | Fix |
|-------|-----|
| Microphone doesn't work | Grant browser permissions; must be HTTPS; on iOS tap first to trigger permission dialog |
| No audio | Check browser audio permissions, device volume, iOS mute switch |
| Slow first response | Wake dyno 15 min before demo; upgrade to Basic dyno for important demos |
| Auth errors mid-demo | Switch to text input; frame as a teaching moment about real API behavior |

---

## Development Guide

### Local setup

```bash
git clone <repo-url>
cd agentforce-speech-app
npm install
cp .env.example .env   # fill in Salesforce credentials
npm run dev            # http://localhost:5000
```

### Commands

```bash
npm run dev           # Development server (tsx, port 5000)
npm run build         # Production build → dist/
npm run check         # TypeScript type check
npm run test          # Run tests (Vitest)
npm run test:coverage # Tests with coverage
npm run db:push       # Push Drizzle schema (requires DATABASE_URL)
```

### Project structure

```
├── client/src/
│   ├── components/
│   │   ├── VoiceChat.tsx              # Main interface (entire UI)
│   │   ├── VoiceRecordButton.tsx
│   │   ├── AgentTransparencyPanel.tsx
│   │   ├── MessageBubble.tsx
│   │   └── ui/                        # shadcn/ui components
│   └── lib/                           # Utilities
├── server/
│   ├── agentforce.ts                  # AgentforceClient singleton
│   ├── speech-foundations.ts          # SpeechFoundationsClient singleton
│   ├── routes.ts                      # All API endpoints
│   ├── storage.ts                     # IStorage + MemStorage
│   └── index.ts                       # Express app + Vite wiring
├── shared/schema.ts                   # Drizzle schema + Zod types
└── public/                            # PWA assets (manifest, icons)
```

### Tests

`server/__tests__/` — Vitest in `node` environment. `@shared/` and `@/` path aliases both work.

**Manual test checklist:**
- [ ] Voice recording: Chrome desktop, iOS Safari, Android Chrome
- [ ] Agent response (correct agent, sensible reply)
- [ ] TTS audio playback (volume up, no iOS mute)
- [ ] Conversation persistence (reload page, turns still visible)
- [ ] PWA install on iOS and Android

### Security
- Never commit `.env` or credentials to git
- Use separate Connected Apps for dev / staging / prod
- Rotate secrets regularly; review Connected App permission scopes

---

## Performance

### Typical latency

| Stage | Time |
|-------|------|
| Voice recording | 1–5 sec (user-controlled) |
| Upload to server | 100–500ms |
| Speech-to-Text | 500–1,500ms |
| Agentforce response | 1–3 sec |
| Text-to-Speech | 500–1,000ms |
| Audio playback start | + response length |
| **Total perceived** | **5–15 sec** |

Early TTS optimization means audio starts playing before the full response is generated — the most impactful latency reduction in the pipeline.

### Production metrics to track

- STT/TTS latency (visible in Transparency Panel per request)
- Agentforce response time and error rates
- Daily voice interactions, unique users, return rate
- Task completion rate vs. traditional UI

---

## Resources

### Salesforce documentation
- [Agentforce Developer Guide](https://developer.salesforce.com/docs/einstein/genai/guide/agentforce.html)
- [Agent API Considerations](https://developer.salesforce.com/docs/einstein/genai/guide/agent-api-considerations.html)
- [Speech Foundations API Reference](https://developer.salesforce.com/docs/einstein/genai/guide/speech-foundations.html)
- [Connected Apps Guide](https://help.salesforce.com/s/articleView?id=sf.connected_app_overview.htm)
- [Salesforce OAuth Flows](https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_flows.htm)

### Tech stack
[React](https://react.dev) · [TypeScript](https://www.typescriptlang.org/docs/) · [Vite](https://vitejs.dev) · [Tailwind CSS](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) · [TanStack Query](https://tanstack.com/query) · [Drizzle ORM](https://orm.drizzle.team) · [Heroku Dev Center](https://devcenter.heroku.com)

### Getting help
- **GitHub Issues** — bugs and feature requests
- **Internal Slack** — #agentforce-demos or your team channel

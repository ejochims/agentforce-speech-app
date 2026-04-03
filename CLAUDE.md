# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev           # Start development server (tsx, port 5000)
npm run build         # Vite + esbuild production build → dist/
npm run start         # Run production build
npm run check         # TypeScript type check
npm run test          # Run tests once (Vitest)
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage report (v8, excludes index.ts and vite.ts)
npm run db:push       # Push Drizzle schema to database (requires DATABASE_URL)
```

## Architecture

Three-tier TypeScript PWA deployed to Heroku:

**Frontend** ([client/src/](client/src/)) — React 18 + Vite + Tailwind CSS + shadcn/ui
- Single route: [VoiceChat.tsx](client/src/components/VoiceChat.tsx) is the entire application UI
- Server state managed with React Query (TanStack); local state via `useState`/`useRef`
- Routing via `wouter` (lightweight, ~2KB)
- Path alias `@/` → `client/src/`

**Backend** ([server/](server/)) — Express + TypeScript, served via `tsx` in dev and `esbuild` bundle in prod
- [index.ts](server/index.ts) — Express app setup, request logging, Vite middleware wiring
- [routes.ts](server/routes.ts) — All API endpoints registered here via `registerRoutes()`
- [agentforce.ts](server/agentforce.ts) — `AgentforceClient` singleton; OAuth2 client-credentials flow, Agentforce REST API (session start/send/end, SSE streaming via `sendMessageStream` async generator)
- [speech-foundations.ts](server/speech-foundations.ts) — `SpeechFoundationsClient` singleton; Speech Foundations OAuth2, STT (`transcribeAudio`) and TTS (`synthesizeSpeech`)
- [storage.ts](server/storage.ts) — `IStorage` interface + `MemStorage` in-memory implementation exported as `storage` singleton
- [vite.ts](server/vite.ts) — Dev Vite middleware and production static file serving

**Shared** ([shared/schema.ts](shared/schema.ts)) — Drizzle ORM schema (PostgreSQL) for `users`, `conversations`, `turns`, `settings` tables plus Zod schemas via `drizzle-zod`. Path alias `@shared/` → `shared/`.

**Tests** — Vitest in `node` environment for server tests ([server/__tests__/](server/__tests__/)), `jsdom` for client tests ([client/__tests__/](client/__tests__)). Both `@shared` and `@` aliases work (configured in [vitest.config.ts](vitest.config.ts)).

## Directory Structure

```
├── client/src/
│   ├── components/          # VoiceChat.tsx (main UI), AgentTransparencyPanel, MessageBubble, etc.
│   ├── components/ui/       # 54 shadcn/ui components
│   ├── hooks/               # useConversation, useAgentStream, useAudioRecorder,
│   │                        #   useTextToSpeech, useWakeWord, usePipelineTransparency
│   ├── lib/                 # queryClient, safeStorage, time helpers
│   └── pages/               # not-found route
├── server/
│   ├── __tests__/           # agentforce.test.ts, storage.test.ts, transparency.test.ts
│   └── *.ts                 # index, routes, agentforce, speech-foundations, storage, vite
├── shared/schema.ts         # Drizzle schema + Zod validators
├── client/__tests__/        # useWakeWord.test.ts, silenceDetection.test.tsx
├── public/                  # PWA manifest + static assets
└── docs/                    # Screenshots
```

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/conversations` | List all conversations |
| POST | `/api/conversations` | Create conversation |
| GET | `/api/conversations/:id` | Fetch one conversation |
| PATCH | `/api/conversations/:id` | Update conversation title |
| GET | `/api/conversations/:id/turns` | Fetch turns in conversation |
| POST | `/api/conversations/:id/turns` | Create turn |
| POST | `/api/stt` | Multipart audio upload → transcribed text |
| GET/POST | `/api/tts` | Text → MP3 audio stream (ETag-cached) |
| POST | `/api/agentforce` | Text + conversationId → agent response JSON (blocking) |
| POST | `/api/agentforce/stream` | Text + conversationId → SSE chunks of agent response |
| GET/PUT | `/api/settings` | App settings |

## Salesforce Integration

Two independent OAuth2 client-credentials connections (both use token caching with 25-min expiry, lazy token-refresh serialization to prevent duplicate OAuth requests):

**Agentforce** — env vars: `SALESFORCE_DOMAIN_URL`, `SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`, `SALESFORCE_AGENT_ID`
- API base: `https://api.salesforce.com/einstein/ai-agent/v1`
- Primary call: `chatWithAgentInConversation(message, existingSessionId?)` — reuses or creates sessions, returns `{response, sessionId, metadata}`
- Session recovery: if session returns 404 (expired), automatically retries with a new session
- `sendMessageStream()` handles both true `text/event-stream` and JSON fallback in a single async generator

**Speech Foundations** — env vars: `SALESFORCE_SPEECH_DOMAIN_URL`, `SALESFORCE_SPEECH_CONSUMER_KEY`, `SALESFORCE_SPEECH_CONSUMER_SECRET`
- STT endpoint: `https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/transcriptions`
- TTS endpoint: `https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1/speech-synthesis`
- Required headers: `x-sfdc-app-context: EinsteinGPT`, `x-client-feature-id: external-edc`

If env vars are missing, clients log a warning and operate in stub/unavailable mode instead of crashing.

## Agentforce Response Parsing

The `AgentforceClient` handles multiple response shapes:
- `messages[]` array format → picks the last message
- Single `message` field → uses directly
- Empty/missing content → falls back to `"Response received from agent"`
- API connection failure → returns a fallback response explaining the issue (never throws to the route handler)

**Transparency metadata** returned with every response:
```typescript
{
  pipeline: { totalMs, agentProcessingMs, sessionCreationMs },
  session:  { sessionId, isNewSession },
  response: { messageCount, messageTypes, status },
  rawApiResponse: { ...full API response... },
  timestamp: ISO string
}
```

## Storage

`MemStorage` (default) holds all data in in-memory Maps — data is lost on server restart. The `IStorage` interface in [storage.ts](server/storage.ts) defines all CRUD methods; a PostgreSQL implementation only needs to implement that interface and replace the `storage` export.

Default settings: `voice: "allison"`, `language: "en-US"`, `sttProvider: "salesforce"`, `ttsProvider: "salesforce"`, `agentforceMode: "stub"`.

Database schema lives in [shared/schema.ts](shared/schema.ts). Run `npm run db:push` with `DATABASE_URL` set to apply it to PostgreSQL.

## Audio Handling

- **iOS Safari unlock**: AudioContext and HTMLAudioElement must be created/resumed inside a user gesture. `VoiceChat.tsx` calls `unlockAudioForSafari()` via `VoiceRecordButton`'s `onBeforeRecording` prop.
- **Blessed element**: A single `blessedAudioRef` HTMLAudioElement is reused across TTS calls for Safari compatibility.
- **iOS `ended` event**: Some iOS devices never fire the `ended` event; `useTextToSpeech` falls back to polling.
- **TTS queue**: `useTextToSpeech` maintains a sequential promise queue (`ttsQueueRef`) so early-TTS and remainder segments don't overlap. An incrementing `ttsGenerationRef` cancels all pending/queued TTS on new requests.
- **Early TTS**: `useAgentStream` triggers TTS on the first complete sentence (`[.!?]\s` regex) while the SSE stream is still in progress.
- **Recording**: `MediaRecorder` uses WebM/Opus (preferred) with M4A fallback for Safari/iOS. Minimum 100 bytes; recordings below threshold are rejected.
- **TTS caching**: `/api/tts` returns `ETag: sha1(text+voice)` with 1-hour `Cache-Control`; browsers send `If-None-Match` and receive `304 Not Modified` on cache hits.

## Voice Options

Seven voices mapped to ElevenLabs IDs in `routes.ts`:

| Name | Notes |
|------|-------|
| allison | Default |
| shimmer | |
| alloy | |
| echo | |
| fable | |
| onyx | |
| nova | |

## Audio Upload (STT)

Multer accepts `.webm`, `.mp3`, `.mpeg`, `.wav`, `.ogg`, `.m4a`, `.flac` (handles `audio/webm;codecs=opus` MIME variants). Max 10 MB. The file filter logs its decisions.

STT errors return specific messages for: invalid format (400), auth failure (401), timeout, and rate limit. Stack traces are only exposed in `NODE_ENV=development`.

## Client-Side Features

- **Wake word**: `useWakeWord()` listens for "Hey Agentforce" via Web Speech API and triggers mic programmatically.
- **Silence detection (VAD)**: auto-stops recording when silence is detected.
- **Auto-listen**: mic reopens automatically after the agent finishes speaking.
- **Conversation recovery**: if the server returns 404 for an existing conversation/session, `useConversation` calls `recoverAndRetry()` — creates a new conversation and replays the last message.
- **Pending messages**: optimistic UI tracks in-flight messages; shows error state with retry button on failure.
- **Transparency panel**: `AgentTransparencyPanel` displays pipeline timing, session IDs, message breakdown, and an expandable raw API response viewer.
- **Ambient orb**: visual feedback cycles through Ready → Listening → Thinking → Speaking states.

## localStorage Keys

| Key | Purpose |
|-----|---------|
| `currentConversationId` | Active conversation |
| `showConversation` | Conversation history sidebar visibility |
| `showTransparency` | Transparency panel visibility |
| `wakeWordEnabled` | Wake word detection toggle |
| `autoListen` | Auto-reopen mic after agent speaks |
| `darkMode` | Dark mode toggle |
| `audioEnabled` | Audio playback enabled |
| `hasSeenWelcome` | Welcome modal shown flag |

## SSE Streaming Fallback Chain

1. `POST /api/agentforce/stream` — true SSE (`event: chunk` → `event: done` | `event: error`)
2. If stream unavailable or errors → falls back to blocking `POST /api/agentforce`
3. `AgentforceClient` itself never throws — returns a fallback string response on any API failure

## Environment Variables

```env
# Agentforce
SALESFORCE_DOMAIN_URL=https://your-domain.my.salesforce.com
SALESFORCE_CONSUMER_KEY=...
SALESFORCE_CONSUMER_SECRET=...
SALESFORCE_AGENT_ID=...

# Speech Foundations
SALESFORCE_SPEECH_DOMAIN_URL=...
SALESFORCE_SPEECH_CONSUMER_KEY=...
SALESFORCE_SPEECH_CONSUMER_SECRET=...

# Database (Heroku-provided in production)
DATABASE_URL=postgresql://...

# Optional
NODE_ENV=development
PORT=5000
```

## Deployment

- `Procfile` — Heroku process definition (`web: npm run start`)
- `app.json` — Heroku app manifest
- `quick-deploy.sh` / `deploy-to-heroku.sh` — deployment scripts
- `init-db.js` / `init-db.sql` — database initialization

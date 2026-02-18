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
npm run test:coverage # Run tests with coverage report
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

**Tests** ([server/__tests__/](server/__tests__/)) — Vitest in `node` environment. Both `@shared` and `@` aliases work (configured in [vitest.config.ts](vitest.config.ts)).

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/stt` | Multipart audio upload → transcribed text |
| GET/POST | `/api/tts` | Text → MP3 audio stream |
| POST | `/api/agentforce` | Text + conversationId → agent response JSON |
| POST | `/api/agentforce/stream` | Text + conversationId → SSE chunks of agent response |
| CRUD | `/api/conversations` | Conversation persistence |
| CRUD | `/api/conversations/:id/turns` | Turn persistence |
| GET/PUT | `/api/settings` | App settings |

## Salesforce Integration

Two independent OAuth2 client-credentials connections (both use token caching with 25-min expiry):

**Agentforce** — env vars: `SALESFORCE_DOMAIN_URL`, `SALESFORCE_CONSUMER_KEY`, `SALESFORCE_CONSUMER_SECRET`, `SALESFORCE_AGENT_ID`
- API base: `https://api.salesforce.com/einstein/ai-agent/v1`

**Speech Foundations** — env vars: `SALESFORCE_SPEECH_DOMAIN_URL`, `SALESFORCE_SPEECH_CONSUMER_KEY`, `SALESFORCE_SPEECH_CONSUMER_SECRET`
- API base: `https://api.salesforce.com/einstein/platform/v1/models/transcribeInternalV1`

If env vars are missing, clients log a warning and operate in stub/unavailable mode instead of crashing.

The SSE streaming path in `sendMessageStream` handles both a true `text/event-stream` response and a JSON fallback in a single async generator — the route in `routes.ts` falls back to the blocking `/api/agentforce` endpoint if the stream endpoint is unavailable.

## Storage

`MemStorage` (default) holds all data in in-memory Maps — data is lost on server restart. The `IStorage` interface in [storage.ts](server/storage.ts) defines all CRUD methods; a PostgreSQL implementation only needs to implement that interface and replace the `storage` export.

Database schema lives in [shared/schema.ts](shared/schema.ts). Run `npm run db:push` with `DATABASE_URL` set to apply it to PostgreSQL.

## Audio Handling

- iOS Safari requires audio to be unlocked during a user gesture. `VoiceChat.tsx` handles this with `unlockAudioForSafari()` called via `VoiceRecordButton`'s `onBeforeRecording` prop.
- TTS is served as `audio/mpeg` from `/api/tts` (GET) and played via `HTMLAudioElement`. A "blessed" audio element ref is reused for Safari.
- Recording uses `MediaRecorder` (WebM/Opus preferred, M4A fallback for Safari/iOS).

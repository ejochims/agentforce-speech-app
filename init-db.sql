CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'active',
  session_id TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS turns (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR NOT NULL REFERENCES conversations(id),
  role VARCHAR NOT NULL,
  text TEXT NOT NULL,
  audio_url TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id VARCHAR PRIMARY KEY DEFAULT 'default',
  voice VARCHAR NOT NULL DEFAULT 'allison',
  language VARCHAR NOT NULL DEFAULT 'en-US',
  stt_provider VARCHAR NOT NULL DEFAULT 'salesforce',
  tts_provider VARCHAR NOT NULL DEFAULT 'salesforce',
  agentforce_mode VARCHAR NOT NULL DEFAULT 'real'
);


# Agentforce Voice Chat PWA

A production-ready Progressive Web App (PWA) that provides seamless voice conversation capabilities with Salesforce's Agentforce AI agents. Built with modern web technologies and optimized for mobile devices, especially iPhone.

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/ejochims/agentforce-speech-app)

> **Quick Deploy:** Click the button above to deploy your own instance to Heroku in minutes. You'll need Salesforce Agentforce and Speech Foundations API credentials. See [SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md) for setup instructions.

## ✨ Features

### 🎙️ Voice Conversation
- **Real-time voice recording** with visual feedback
- **Premium text-to-speech** using ElevenLabs Allison - millennial voice
- **High-quality speech recognition** with ElevenLabs Scribe v1 model
- **Visual status indicators** with animated ripple effects:
  - 🔵 Blue rings: Listening/Processing
  - 🟡 Yellow rings: Agent thinking
  - 🟢 Green rings: Agent speaking

### 📱 Mobile-First Design
- **PWA capabilities** - installable on iPhone/Android
- **Touch-optimized interface** with proper touch targets
- **Responsive design** adapts to all screen sizes
- **iOS Safari compatibility** with audio unlock mechanisms
- **Dark/Light mode** with system preference detection

### 💬 Conversation Management
- **Voice-only mode** for hands-free interaction
- **Text + voice hybrid mode** with conversation history
- **Session persistence** across app launches
- **Conversation history** with organized turns
- **Real-time audio playback** with streaming TTS

### 🔧 Technical Excellence
- **TypeScript** for type safety
- **React Query** for efficient data fetching
- **Modern CSS** with Tailwind utilities
- **Error handling** with graceful fallbacks
- **Accessibility** with ARIA labels and screen reader support

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ 
- **Salesforce org** with Agentforce and Speech Foundations API access
- **Heroku account** (for deployment)
- Salesforce **Connected App** credentials (OAuth 2.0 client credentials flow)

### Environment Variables

This app requires several Salesforce API credentials. See detailed setup instructions in:
- **[SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md)** - Complete Salesforce configuration guide
- **[HEROKU_DEPLOYMENT.md](./HEROKU_DEPLOYMENT.md)** - Heroku deployment instructions

Quick reference - copy `.env.example` to `.env` and fill in your values:

```env
# Salesforce Agentforce API
SALESFORCE_DOMAIN_URL=https://your-domain.my.salesforce.com
SALESFORCE_CONSUMER_KEY=your_connected_app_consumer_key
SALESFORCE_CONSUMER_SECRET=your_connected_app_consumer_secret
SALESFORCE_AGENT_ID=your_agentforce_agent_id

# Salesforce Speech Foundations API
SALESFORCE_SPEECH_DOMAIN_URL=https://your-domain.my.salesforce.com
SALESFORCE_SPEECH_CONSUMER_KEY=your_speech_consumer_key
SALESFORCE_SPEECH_CONSUMER_SECRET=your_speech_consumer_secret

# Database (auto-set by Heroku)
DATABASE_URL=postgresql://...

# Optional
NODE_ENV=development
```

### Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/agentforce-speech-app.git
   cd agentforce-speech-app
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up Salesforce:**
   - Follow the detailed guide in **[SALESFORCE_SETUP.md](./SALESFORCE_SETUP.md)**
   - Create Connected Apps for Agentforce and Speech Foundations APIs
   - Get your Agent ID from Salesforce

4. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your Salesforce credentials
   ```

5. **Set up local database (optional for local dev):**
   ```bash
   # Install PostgreSQL locally, then:
   npm run db:push
   ```

6. **Start the development server:**
   ```bash
   npm run dev
   ```

7. **Access the app:**
   - Local: `http://localhost:5000`
   - The app will automatically restart when you make changes

### Deploy to Heroku

For production deployment, see **[HEROKU_DEPLOYMENT.md](./HEROKU_DEPLOYMENT.md)**

Quick deploy:
```bash
heroku create your-app-name
heroku addons:create heroku-postgresql:essential-0
# Set all environment variables (see HEROKU_DEPLOYMENT.md)
git push heroku main
heroku run npm run db:push
```

## 🔧 Configuration

### Switching Agentforce Agents
To use a different Agentforce agent within the same Salesforce org:

1. Get your new agent ID from Salesforce Setup → Agents
2. Update the `SALESFORCE_AGENT_ID` environment variable
3. Restart the application

### Voice Settings
The app uses **Salesforce Speech Foundations API** which leverages **ElevenLabs voices** internally:
- **Default Voice**: Allison - millennial (natural, conversational female voice)
- **Model**: Uses ElevenLabs' ultra-fast model (~75ms latency)
- **Available Voices**: Configurable via voice mapping in `server/routes.ts`

To change the default voice or add new voices, edit the `voiceMapping` object in `server/routes.ts`:
```typescript
const voiceMapping: { [key: string]: string } = {
  'allison': 'xctasy8XvGp2cVO9HL9k',  // Default
  'shimmer': 'pNInz6obpgDQGcFmaJgB',  // Clear male
  'onyx': 'VR6AewLTigWG4xSOukaG',     // Strong male
  // Add more ElevenLabs voice IDs here
};
```

### PWA Installation
Users can install the app on their devices:
- **iPhone**: Safari → Share → "Add to Home Screen"
- **Android**: Chrome → Menu → "Add to Home Screen"
- **Desktop**: Browser address bar → Install button

## 🏗️ Architecture

### Frontend (`client/`)
- **React** with TypeScript
- **Wouter** for routing
- **TanStack Query** for server state
- **Shadcn/ui** components with Tailwind CSS
- **Lucide React** icons

### Backend (`server/`)
- **Express.js** server with TypeScript
- **Salesforce Agentforce API** integration
- **Salesforce Speech Foundations API** integration (STT/TTS)
- **PostgreSQL** database with Drizzle ORM
- **Session management** with conversation persistence
- **RESTful API** endpoints

### Key Components
- `VoiceChat.tsx` - Main voice interaction interface
- `VoiceRecordButton.tsx` - Audio recording with visual feedback
- `MessageBubble.tsx` - Chat message display
- `agentforce.ts` - Salesforce Agentforce API client
- `speech-foundations.ts` - Salesforce Speech Foundations API client
- `routes.ts` - API endpoints for STT/TTS/Agent interactions
- `storage.ts` - Database operations for conversations and turns

## 🎯 Usage

### Voice-Only Mode
1. Toggle off "Show Conversation" 
2. Press and hold the microphone button
3. Speak your message
4. Release to send
5. Watch the visual feedback:
   - Blue animations while listening/processing
   - Yellow pulse while agent thinks
   - Green ripples while agent speaks

### Text + Voice Mode
- View full conversation history
- Send text messages or voice messages
- Audio responses play automatically
- Conversation persistence across sessions

### Keyboard Shortcuts
- **Escape**: Close conversation history or cancel recording
- **Space**: Quick voice recording (when focused on record button)

## 🔊 Audio Features

### Speech-to-Text (STT)
- **Salesforce Einstein Transcribe** (Speech Foundations API)
- Powered by industry-leading transcription models
- Support for multiple audio formats (WebM, MP4, OGG, M4A)
- Real-time transcription with high accuracy
- Error handling with detailed feedback

### Text-to-Speech (TTS)  
- **Salesforce Einstein Speech** (Speech Foundations API)
- Powered by **ElevenLabs voices** for premium quality
- Streaming audio for immediate playback
- Multiple voice options (male/female, various tones)
- Optimized for conversational interactions

### Audio Management
- **Auto-initialization** on user return
- **iOS Safari compatibility** with audio context unlock
- **Graceful fallbacks** when audio permissions denied
- **Pending audio** system for failed playbacks

## 🛠️ Development

### File Structure
```
├── client/src/           # Frontend React app
│   ├── components/       # Reusable UI components  
│   ├── pages/           # Route components
│   ├── lib/             # Utilities and configs
│   └── hooks/           # Custom React hooks
├── server/              # Backend Express server
│   ├── agentforce.ts    # Salesforce integration
│   ├── routes.ts        # API routes
│   └── index.ts         # Server entry point
├── shared/              # Shared types and schemas
└── public/              # Static assets and PWA config
```

### Adding New Features
1. Define data types in `shared/schema.ts`
2. Add backend endpoints in `server/routes.ts`
3. Create frontend components in `client/src/components/`
4. Use React Query for data fetching
5. Follow existing patterns for error handling

### Testing Voice Features
- Test on actual mobile devices (especially iOS Safari)
- Verify audio permissions and context initialization
- Test in different network conditions
- Validate PWA installation flow

## 📄 License

This project is built for Salesforce Agentforce integration and voice interaction capabilities.

## 🤝 Contributing

When extending this application:
1. Maintain TypeScript strict mode compliance
2. Follow existing component patterns
3. Test audio functionality on mobile devices
4. Ensure PWA compatibility
5. Update this README with new features

## 🔍 Troubleshooting

### Audio Issues
- **No audio playback**: Check browser audio permissions
- **Recording fails**: Verify microphone permissions
- **iOS Safari issues**: Ensure user gesture before audio operations

### Salesforce Connection
- **Agent errors**: Verify SALESFORCE_AGENT_ID is correct and agent is deployed
- **Authentication failures**: Check consumer key/secret are correct
- **Domain issues**: Ensure SALESFORCE_DOMAIN_URL format is `https://your-domain.my.salesforce.com`
- **API permissions**: Verify Connected App has `einstein_gpt_api` scope

### Speech Foundations API  
- **STT failures**: Verify Speech Foundations is enabled in your org
- **TTS errors**: Check voice ID mapping in routes.ts
- **Authentication issues**: Verify SALESFORCE_SPEECH_CONSUMER_KEY/SECRET
- **Rate limits**: Monitor API usage in Salesforce Setup → Event Monitoring

---

**Built with ❤️ for seamless AI voice interactions**
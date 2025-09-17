# Agentforce Voice Chat PWA

A production-ready Progressive Web App (PWA) that provides seamless voice conversation capabilities with Salesforce's Agentforce AI agents. Built with modern web technologies and optimized for mobile devices, especially iPhone.

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
- Node.js 18+ 
- Access to Salesforce org with Agentforce
- ElevenLabs API account
- Salesforce Connected App credentials

### Environment Variables
Configure these secrets in your environment:

```env
# Salesforce Configuration
SALESFORCE_DOMAIN_URL=https://your-domain.my.salesforce.com
SALESFORCE_CONSUMER_KEY=your_connected_app_key
SALESFORCE_CONSUMER_SECRET=your_connected_app_secret
SALESFORCE_AGENT_ID=your_agentforce_agent_id

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Session Security
SESSION_SECRET=your_secure_random_string
```

### Installation & Setup

1. **Clone and install dependencies:**
   ```bash
   npm install
   ```

2. **Configure your environment variables** (see above)

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Access the app:**
   - Local: `http://localhost:5000`
   - The app will automatically restart when you make changes

## 🔧 Configuration

### Switching Agentforce Agents
To use a different Agentforce agent within the same Salesforce org:

1. Get your new agent ID from Salesforce Setup → Agents
2. Update the `SALESFORCE_AGENT_ID` environment variable
3. Restart the application

### Voice Settings
The app uses **ElevenLabs Allison - millennial** voice with optimized parameters:
- **Model**: `eleven_flash_v2_5` (ultra-fast, ~75ms latency)
- **Speed**: 1.10x for dynamic conversations
- **Stability**: 32% for natural variation
- **Similarity**: 54% for consistent tone

To modify voice settings, edit the TTS configuration in `server/routes.ts`.

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
- **ElevenLabs** STT/TTS integration
- **Session management** with secure storage
- **RESTful API** endpoints

### Key Components
- `VoiceChat.tsx` - Main voice interaction interface
- `VoiceRecordButton.tsx` - Audio recording with visual feedback
- `MessageBubble.tsx` - Chat message display
- `agentforce.ts` - Salesforce API client
- `routes.ts` - API endpoints for STT/TTS/Agent

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
- **ElevenLabs Scribe v1** model
- Support for multiple audio formats (WebM, MP4, OGG)
- Real-time transcription
- Error handling with retry mechanisms

### Text-to-Speech (TTS)  
- **ElevenLabs eleven_flash_v2_5** model
- Streaming audio for immediate playback
- Premium Allison voice with millennial tone
- Configurable speed and quality parameters

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
- **Agent errors**: Verify SALESFORCE_AGENT_ID is correct
- **Authentication failures**: Check consumer key/secret
- **Domain issues**: Ensure SALESFORCE_DOMAIN_URL format

### ElevenLabs Integration  
- **STT failures**: Verify API key and quota
- **TTS errors**: Check voice ID and model availability
- **Rate limits**: Monitor API usage in ElevenLabs dashboard

---

**Built with ❤️ for seamless AI voice interactions**
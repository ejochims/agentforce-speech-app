import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { agentforceClient } from "./agentforce";
import OpenAI from "openai";
import { 
  insertConversationSchema, 
  insertTurnSchema, 
  insertSettingsSchema 
} from "@shared/schema";
import multer from "multer";
import fs from "fs";
import path from "path";

// Initialize OpenAI client
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configure multer for audio file uploads
const upload = multer({
  dest: 'uploads/audio/',
  fileFilter: (req, file, cb) => {
    // Accept audio files with more flexible MIME type checking
    // This handles cases like 'audio/webm;codecs=opus'
    const isAudioFile = file.mimetype.startsWith('audio/') && 
      (file.mimetype.includes('wav') || 
       file.mimetype.includes('mp3') || 
       file.mimetype.includes('mpeg') || 
       file.mimetype.includes('webm') || 
       file.mimetype.includes('mp4') ||
       file.mimetype.includes('ogg') ||
       file.mimetype.includes('m4a') ||
       file.mimetype.includes('flac'));
       
    console.log('File filter check:', { mimetype: file.mimetype, accepted: isAudioFile });
    
    if (isAudioFile) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}`));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Conversations
  app.get('/api/conversations', async (req, res) => {
    try {
      const conversations = await storage.getConversations();
      res.json(conversations);
    } catch (error) {
      console.error('Error fetching conversations:', error);
      res.status(500).json({ error: 'Failed to fetch conversations' });
    }
  });

  app.post('/api/conversations', async (req, res) => {
    try {
      const conversationData = insertConversationSchema.parse(req.body);
      const conversation = await storage.createConversation(conversationData);
      res.json(conversation);
    } catch (error: any) {
      console.error('Error creating conversation:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid conversation data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create conversation' });
      }
    }
  });

  app.get('/api/conversations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      
      res.json(conversation);
    } catch (error) {
      console.error('Error fetching conversation:', error);
      res.status(500).json({ error: 'Failed to fetch conversation' });
    }
  });

  app.get('/api/conversations/:id/turns', async (req, res) => {
    try {
      const { id } = req.params;
      const turns = await storage.getTurnsByConversation(id);
      res.json(turns);
    } catch (error) {
      console.error('Error fetching turns:', error);
      res.status(500).json({ error: 'Failed to fetch turns' });
    }
  });

  app.post('/api/conversations/:id/turns', async (req, res) => {
    try {
      const { id } = req.params;
      
      // Validate that the conversation exists before creating a turn
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        console.log(`❌ Cannot create turn: Conversation ${id} not found`);
        return res.status(404).json({ 
          error: 'Conversation not found',
          message: `Cannot create turn for non-existent conversation: ${id}`
        });
      }
      
      console.log(`✓ Conversation ${id} exists, creating turn`);
      const turnData = insertTurnSchema.parse({ ...req.body, conversationId: id });
      const turn = await storage.createTurn(turnData);
      res.json(turn);
    } catch (error: any) {
      console.error('Error creating turn:', error);
      if (error.name === 'ZodError') {
        res.status(400).json({ error: 'Invalid turn data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create turn' });
      }
    }
  });

  // Speech-to-Text using ElevenLabs
  app.post('/api/stt', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      console.log('STT: Received file:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        filename: req.file.filename
      });

      // Create FormData for ElevenLabs API
      const formData = new FormData();
      const audioBuffer = fs.readFileSync(req.file.path);
      const audioBlob = new Blob([audioBuffer], { type: req.file.mimetype });
      
      // Add the audio file to form data
      formData.append('audio', audioBlob, 'audio.webm');
      
      // Add the required model_id parameter
      formData.append('model_id', 'eleven_multilingual_v1');

      console.log('STT: Calling ElevenLabs STT API...');
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('STT: Transcription successful:', result.text);

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ 
        text: result.text || '',
        duration: 0 // Duration not available from ElevenLabs STT API
      });
    } catch (error) {
      console.error('Error transcribing audio:', error);
      // Clean up file even on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to transcribe audio';
      if (error instanceof Error) {
        if (error.message.includes('Invalid file format') || error.message.includes('400')) {
          errorMessage = 'Invalid audio format. Please try recording again.';
        } else if (error.message.includes('API key') || error.message.includes('401')) {
          errorMessage = 'Audio transcription service unavailable. Please try again later.';
        } else if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
          errorMessage = 'Network timeout. Please check your connection and try again.';
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = 'Service temporarily busy. Please wait a moment and try again.';
        } else {
          errorMessage = `Transcription failed: ${error.message}`;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Voice mapping for ElevenLabs
  const voiceMapping: { [key: string]: string } = {
    'shimmer': 'pNInz6obpgDQGcFmaJgB', // Adam - clear male voice (default)
    'alloy': 'JBFqnCBsd6RMkjVDRZzb',   // George - mature male voice
    'echo': 'TxGEqnHWrfWFTfGW9XjX',    // Josh - deep male voice
    'fable': 'AZnzlk1XvdvUeBnXmlld',   // Domi - expressive female voice
    'onyx': 'VR6AewLTigWG4xSOukaG',    // Arnold - strong male voice
    'nova': 'EXAVITQu4vr4xnSDxMaL',    // Bella - expressive female voice
    'allison': 'MF3mGyEYCl7XYWbV9V6O'  // Allison - millennial female voice
  };


  // Text-to-Speech - Streaming version for faster playback
  app.get('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'shimmer', speed } = req.query;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      // Map voice name to ElevenLabs voice ID
      const voiceId = voiceMapping[voice as string] || voiceMapping['shimmer'];
      
      // Set default speed: 1.10x for Allison, 1.0x for others
      const defaultSpeed = voice === 'allison' ? 1.10 : 1.0;
      const speechSpeed = speed ? parseFloat(speed as string) : defaultSpeed;
      
      console.log('TTS: Generating speech with ElevenLabs...', { text: text.substring(0, 50) + '...', voice, voiceId, speed: speechSpeed });

      // Call ElevenLabs TTS API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5', // Fast model for low latency
          voice_settings: {
            speed: speechSpeed
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      // Stream the response directly without buffering
      res.set({
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });
      
      // Convert ReadableStream to Node.js stream for piping
      const stream = response.body;
      if (stream) {
        const reader = stream.getReader();
        const pump = (): Promise<void> => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            return pump();
          });
        };
        pump().catch((error: any) => {
          console.error('TTS streaming error:', error);
          res.status(500).json({ error: 'Streaming failed' });
        });
      } else {
        throw new Error('No audio stream received from ElevenLabs');
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to generate speech';
      if (error instanceof Error) {
        if (error.message.includes('API key') || error.message.includes('401')) {
          errorMessage = 'Speech generation service unavailable. Please try again later.';
        } else if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
          errorMessage = 'Network timeout. Please check your connection and try again.';
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = 'Service temporarily busy. Please wait a moment and try again.';
        } else {
          errorMessage = `Speech generation failed: ${error.message}`;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });
  
  // Keep POST endpoint for backward compatibility
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'shimmer', speed } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (!process.env.ELEVENLABS_API_KEY) {
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      // Map voice name to ElevenLabs voice ID
      const voiceId = voiceMapping[voice] || voiceMapping['shimmer'];
      
      // Set default speed: 1.10x for Allison, 1.0x for others
      const defaultSpeed = voice === 'allison' ? 1.10 : 1.0;
      const speechSpeed = speed || defaultSpeed;
      
      console.log('TTS: Generating speech with ElevenLabs...', { text: text.substring(0, 50) + '...', voice, voiceId, speed: speechSpeed });

      // Call ElevenLabs TTS API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5', // Fast model for low latency
          voice_settings: {
            speed: speechSpeed
          }
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} ${errorText}`);
      }

      // Stream the response directly without buffering
      res.set({
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
      });
      
      // Convert ReadableStream to Node.js stream for piping
      const stream = response.body;
      if (stream) {
        const reader = stream.getReader();
        const pump = (): Promise<void> => {
          return reader.read().then(({ done, value }) => {
            if (done) {
              res.end();
              return;
            }
            res.write(value);
            return pump();
          });
        };
        pump().catch((error: any) => {
          console.error('TTS streaming error:', error);
          res.status(500).json({ error: 'Streaming failed' });
        });
      } else {
        throw new Error('No audio stream received from ElevenLabs');
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to generate speech';
      if (error instanceof Error) {
        if (error.message.includes('API key') || error.message.includes('401')) {
          errorMessage = 'Speech generation service unavailable. Please try again later.';
        } else if (error.message.includes('timeout') || error.message.includes('ECONNRESET')) {
          errorMessage = 'Network timeout. Please check your connection and try again.';
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = 'Service temporarily busy. Please wait a moment and try again.';
        } else {
          errorMessage = `Speech generation failed: ${error.message}`;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Agentforce integration
  app.post('/api/agentforce', async (req, res) => {
    try {
      const { text, conversationId } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      if (!conversationId) {
        return res.status(400).json({ error: 'ConversationId is required' });
      }

      // Get the conversation to check for existing sessionId
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      // Call Agentforce API with session persistence
      const { response, sessionId } = await agentforceClient.chatWithAgentInConversation(
        text, 
        conversation.sessionId || undefined
      );

      // Validate response is not undefined or empty
      if (!response || typeof response !== 'string' || response.trim() === '') {
        console.error('❌ Agent returned invalid response:', response);
        return res.status(500).json({ 
          error: 'Agent response invalid',
          details: 'The agent did not provide a valid text response'
        });
      }

      console.log('✅ Agent response validated:', response.substring(0, 100) + '...');

      // Update conversation with sessionId if it's new or changed
      if (sessionId !== conversation.sessionId) {
        await storage.updateConversationSessionId(conversationId, sessionId);
      }

      res.json({ 
        text: response,
        conversationId,
        sessionId // Include sessionId in response for debugging
      });
    } catch (error: any) {
      console.error('Error calling Agentforce:', error);
      res.status(500).json({ 
        error: 'Failed to get Agentforce response',
        details: error.message 
      });
    }
  });

  // Settings
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching settings:', error);
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const settingsData = insertSettingsSchema.parse(req.body);
      const settings = await storage.updateSettings(settingsData);
      res.json(settings);
    } catch (error) {
      console.error('Error updating settings:', error);
      res.status(500).json({ error: 'Failed to update settings' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}

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

  // Speech-to-Text
  app.post('/api/stt', upload.single('audio'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      console.log('STT: Received file:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        filename: req.file.filename
      });

      // Create a proper file with the right extension for OpenAI
      const audioReadStream = fs.createReadStream(req.file.path);
      
      // For webm files, ensure OpenAI recognizes the format
      const fileOptions: any = {
        file: audioReadStream,
        model: "whisper-1",
      };

      // If it's a webm file, be explicit about the format
      if (req.file.originalname?.includes('.webm') || req.file.mimetype?.includes('webm')) {
        console.log('STT: Processing webm audio file');
        // Rename the stream to have .webm extension to help OpenAI recognize it
        Object.defineProperty(audioReadStream, 'name', {
          value: 'audio.webm',
          configurable: true
        });
      }

      console.log('STT: Calling OpenAI Whisper API...');
      const transcription = await openai.audio.transcriptions.create(fileOptions);
      console.log('STT: Transcription successful:', transcription.text);

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ 
        text: transcription.text,
        duration: 0 // Duration not available from Whisper API
      });
    } catch (error) {
      console.error('Error transcribing audio:', error);
      // Clean up file even on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ error: 'Failed to transcribe audio' });
    }
  });

  // Text-to-Speech - Streaming version for faster playback
  app.get('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'shimmer' } = req.query;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required' });
      }

      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice as string,
        input: text,
      });

      // Stream the response directly without buffering
      res.set({
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      });
      
      // Convert ReadableStream to Node.js stream for piping
      const stream = mp3.body;
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
        throw new Error('No audio stream received from OpenAI');
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      res.status(500).json({ error: 'Failed to generate speech' });
    }
  });
  
  // Keep POST endpoint for backward compatibility
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'shimmer' } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: text,
      });

      // Stream the response directly without buffering
      res.set({
        'Content-Type': 'audio/mpeg',
        'Transfer-Encoding': 'chunked',
      });
      
      // Convert ReadableStream to Node.js stream for piping
      const stream = mp3.body;
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
        throw new Error('No audio stream received from OpenAI');
      }
    } catch (error) {
      console.error('Error generating speech:', error);
      res.status(500).json({ error: 'Failed to generate speech' });
    }
  });

  // Agentforce integration
  app.post('/api/agentforce', async (req, res) => {
    try {
      const { text, conversationId } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Call real Agentforce API
      const response = await agentforceClient.chatWithAgent(text);

      res.json({ 
        text: response,
        conversationId 
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

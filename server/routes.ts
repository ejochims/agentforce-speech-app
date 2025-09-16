import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
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
    const allowedMimes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/webm', 'audio/ogg'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
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

      const audioReadStream = fs.createReadStream(req.file.path);

      const transcription = await openai.audio.transcriptions.create({
        file: audioReadStream,
        model: "whisper-1",
      });

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      res.json({ 
        text: transcription.text,
        duration: 0 // Duration not available from Whisper API
      });
    } catch (error) {
      console.error('Error transcribing audio:', error);
      res.status(500).json({ error: 'Failed to transcribe audio' });
    }
  });

  // Text-to-Speech
  app.post('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'alloy' } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice,
        input: text,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length,
      });
      
      res.send(buffer);
    } catch (error) {
      console.error('Error generating speech:', error);
      res.status(500).json({ error: 'Failed to generate speech' });
    }
  });

  // Agentforce integration (stub for now)
  app.post('/api/agentforce', async (req, res) => {
    try {
      const { text, conversationId } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Stub response - replace with real Agentforce API call
      const agentResponses = [
        "I understand your question. Let me help you with that. Based on the information you've provided, here's what I can tell you...",
        "That's a great point. From my analysis of similar cases, I would recommend considering the following options...",
        "Thank you for that information. I've processed your request and here are the key insights I can provide...",
        "I see what you're looking for. Let me break this down into actionable steps you can take...",
        "Based on my knowledge and experience with similar situations, here's my assessment and recommendations..."
      ];

      // Simulate realistic response time
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

      const response = agentResponses[Math.floor(Math.random() * agentResponses.length)];

      res.json({ 
        text: response,
        conversationId 
      });
    } catch (error) {
      console.error('Error calling Agentforce:', error);
      res.status(500).json({ error: 'Failed to get Agentforce response' });
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

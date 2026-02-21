import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { agentforceClient } from "./agentforce";
import { speechFoundationsClient } from "./speech-foundations";
import { 
  insertConversationSchema, 
  insertTurnSchema, 
  insertSettingsSchema 
} from "@shared/schema";
import multer from "multer";
import fs from "fs";
import path from "path";

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

  app.patch('/api/conversations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'title is required' });
      }
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      await storage.updateConversationTitle(id, title.trim());
      res.json({ ...conversation, title: title.trim() });
    } catch (error) {
      console.error('Error updating conversation title:', error);
      res.status(500).json({ error: 'Failed to update conversation' });
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

  // Speech-to-Text using Einstein Transcribe
  app.post('/api/stt', upload.single('file'), async (req, res) => {
    const sttStart = Date.now();

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

      // Read audio file
      const audioBuffer = fs.readFileSync(req.file.path);

      // Use Einstein Transcribe
      const transcription = await speechFoundationsClient.transcribeAudio(
        audioBuffer,
        req.file.mimetype,
        'english' // Default to English, can be made configurable
      );

      // Clean up uploaded file
      fs.unlinkSync(req.file.path);

      const sttMs = Date.now() - sttStart;

      res.json({
        text: transcription,
        duration: 0, // Duration not available from Einstein Transcribe API
        transparency: {
          sttProcessingMs: sttMs,
          audioSizeBytes: req.file.size,
          mimeType: req.file.mimetype,
        }
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
        } else if (error.message.includes('authentication') || error.message.includes('401')) {
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

  // Voice mapping for ElevenLabs (used by Einstein Speech V2)
  const voiceMapping: { [key: string]: string } = {
    'shimmer': 'pNInz6obpgDQGcFmaJgB', // Adam - clear male voice
    'alloy': 'JBFqnCBsd6RMkjVDRZzb',   // George - mature male voice
    'echo': 'TxGEqnHWrfWFTfGW9XjX',    // Josh - deep male voice
    'fable': 'AZnzlk1XvdvUeBnXmlld',   // Domi - expressive female voice
    'onyx': 'VR6AewLTigWG4xSOukaG',    // Arnold - strong male voice
    'nova': 'EXAVITQu4vr4xnSDxMaL',    // Bella - expressive female voice
    'allison': 'xctasy8XvGp2cVO9HL9k'  // Allison - millennial female voice (default)
  };


  // Text-to-Speech using Einstein Speech V2 with ElevenLabs voices
  app.get('/api/tts', async (req, res) => {
    try {
      const { text, voice = 'allison' } = req.query;
      
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Map voice name to ElevenLabs voice ID
      const voiceId = voiceMapping[voice as string] || voiceMapping['allison'];
      
      // Use Einstein Speech to synthesize
      const audioBuffer = await speechFoundationsClient.synthesizeSpeech(text, voiceId);

      // Stream the audio response
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
        'Cache-Control': 'no-cache',
      });
      
      res.send(audioBuffer);
    } catch (error) {
      console.error('Error generating speech:', error);
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to generate speech';
      if (error instanceof Error) {
        if (error.message.includes('authentication') || error.message.includes('401')) {
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
      const { text, voice = 'allison' } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      // Map voice name to ElevenLabs voice ID
      const voiceId = voiceMapping[voice] || voiceMapping['allison'];
      
      // Use Einstein Speech to synthesize
      const audioBuffer = await speechFoundationsClient.synthesizeSpeech(text, voiceId);

      // Stream the audio response
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
      });
      
      res.send(audioBuffer);
    } catch (error) {
      console.error('Error generating speech:', error);
      
      // Provide detailed error message based on error type
      let errorMessage = 'Failed to generate speech';
      if (error instanceof Error) {
        if (error.message.includes('authentication') || error.message.includes('401')) {
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

  // Agentforce streaming integration (SSE)
  app.post('/api/agentforce/stream', async (req, res) => {
    const pipelineStart = Date.now();
    // Hoisted so the catch block can clean up an orphaned session if needed
    let sessionId: string | undefined;
    let isNewSession = false;
    let sessionPersisted = true;

    try {
      const { text, conversationId } = req.body;

      if (!text) return res.status(400).json({ error: 'Text is required' });
      if (!conversationId) return res.status(400).json({ error: 'ConversationId is required' });

      const conversation = await storage.getConversation(conversationId);
      if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

      // Set SSE headers — X-Accel-Buffering disables nginx/Heroku proxy buffering
      res.set({
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.flushHeaders();

      const sendEvent = (event: string, data: object) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      sessionId = conversation.sessionId || undefined;
      isNewSession = !sessionId;
      let sessionCreationMs: number | undefined;
      sessionPersisted = !isNewSession; // pre-existing sessions are already stored

      if (!sessionId) {
        const sessionStart = Date.now();
        sessionId = await agentforceClient.startSession();
        sessionCreationMs = Date.now() - sessionStart;
        console.log(`New streaming session started: ${sessionId} (${sessionCreationMs}ms)`);
      } else {
        console.log('Reusing existing session for streaming:', sessionId);
      }

      let fullText = '';
      const agentStart = Date.now();

      for await (const event of agentforceClient.sendMessageStream(sessionId!, text)) {
        if (event.type === 'chunk') {
          fullText += event.text;
          sendEvent('chunk', { text: event.text });
        } else if (event.type === 'done') {
          const agentProcessingMs = Date.now() - agentStart;

          if (sessionId !== conversation.sessionId) {
            await storage.updateConversationSessionId(conversationId, sessionId!);
            sessionPersisted = true;
          }

          console.log(`✅ Streaming response complete (${agentProcessingMs}ms): ${fullText.substring(0, 80)}...`);

          sendEvent('done', {
            text: fullText,
            conversationId,
            sessionId,
            transparency: {
              pipeline: {
                totalMs: Date.now() - pipelineStart,
                agentProcessingMs,
                sessionCreationMs,
              },
              session: {
                sessionId,
                isNewSession,
              },
              response: {
                messageCount: 1,
                messageTypes: ['Text'],
                status: 'success',
              },
              rawApiResponse: event.rawResponse,
              timestamp: new Date().toISOString(),
            },
          });
          res.end();
        }
      }
    } catch (error: any) {
      console.error('Error in streaming Agentforce endpoint:', error);
      // If we created a new session but failed before persisting it, clean it up
      // to avoid leaking sessions on Salesforce.
      if (isNewSession && sessionId && !sessionPersisted) {
        agentforceClient.endSession(sessionId).catch((e) =>
          console.error('Failed to clean up orphaned session:', e)
        );
      }
      // If headers not sent yet, send JSON error; otherwise send SSE error event
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to get Agentforce response', details: error.message });
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
      }
    }
  });

  // Agentforce integration
  app.post('/api/agentforce', async (req, res) => {
    const pipelineStart = Date.now();

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
      const { response, sessionId, metadata } = await agentforceClient.chatWithAgentInConversation(
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

      const totalPipelineMs = Date.now() - pipelineStart;

      res.json({
        text: response,
        conversationId,
        sessionId,
        // Transparency panel data
        transparency: {
          pipeline: {
            totalMs: totalPipelineMs,
            agentProcessingMs: metadata.agentProcessingMs,
            sessionCreationMs: metadata.sessionCreationMs,
          },
          session: {
            sessionId: metadata.sessionId,
            isNewSession: metadata.isNewSession,
          },
          response: {
            messageCount: metadata.messageCount,
            messageTypes: metadata.messageTypes,
            status: metadata.status,
          },
          rawApiResponse: metadata.rawResponse,
          timestamp: new Date().toISOString(),
        }
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

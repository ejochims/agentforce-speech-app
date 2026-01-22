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

      res.json({ 
        text: transcription,
        duration: 0 // Duration not available from Einstein Transcribe API
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

  // Helper function to strip HTML tags for TTS
  function stripHtmlTags(html: string): string {
    return html
      .replace(/<br\s*\/?>/gi, '\n')           // Convert <br> to newlines
      .replace(/<\/p>/gi, '\n\n')              // Convert closing </p> to double newlines
      .replace(/<li[^>]*>/gi, '\n• ')          // Convert <li> to bullet points
      .replace(/<\/li>/gi, '')                 // Remove closing </li>
      .replace(/<[^>]+>/g, '')                 // Remove all other HTML tags
      .replace(/&nbsp;/g, ' ')                 // Convert &nbsp; to space
      .replace(/&amp;/g, '&')                  // Convert &amp; to &
      .replace(/&lt;/g, '<')                   // Convert &lt; to <
      .replace(/&gt;/g, '>')                   // Convert &gt; to >
      .replace(/&quot;/g, '"')                 // Convert &quot; to "
      .replace(/&#39;/g, "'")                  // Convert &#39; to '
      .replace(/\n\s*\n\s*\n/g, '\n\n')        // Collapse multiple newlines
      .trim();
  }

  // Helper function to process Agentforce response
  function processAgentforceResponse(rawResponse: string): { textForTts: string; textForUi: string; hasHtml: boolean } {
    try {
      // Try to parse as JSON to check for structured response
      const parsed = JSON.parse(rawResponse);

      // Check if response has the special data format with HTML
      if (parsed.data && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const firstDataItem = parsed.data[0];
        if (firstDataItem.value && firstDataItem.value.promptResponse) {
          const htmlContent = firstDataItem.value.promptResponse;
          const plainMessage = parsed.message || '';

          // Combine plain message with HTML content for UI
          const combinedHtml = plainMessage
            ? `<p>${plainMessage}</p>\n${htmlContent}`
            : htmlContent;

          // Extract plain text for TTS
          const textForTts = plainMessage + '\n' + stripHtmlTags(htmlContent);

          console.log('📊 Detected structured response with HTML');
          console.log('TTS text preview:', textForTts.substring(0, 100) + '...');

          return {
            textForTts: textForTts.trim(),
            textForUi: combinedHtml,
            hasHtml: true
          };
        }
      }

      // If parsed but no special format, treat as plain text
      return {
        textForTts: rawResponse,
        textForUi: rawResponse,
        hasHtml: false
      };
    } catch (e) {
      // Not JSON, treat as plain text
      return {
        textForTts: rawResponse,
        textForUi: rawResponse,
        hasHtml: false
      };
    }
  }

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

      // Process response to separate TTS and UI versions
      const processed = processAgentforceResponse(response);

      // Update conversation with sessionId if it's new or changed
      if (sessionId !== conversation.sessionId) {
        await storage.updateConversationSessionId(conversationId, sessionId);
      }

      res.json({
        text: processed.textForTts,        // Plain text for TTS
        textForUi: processed.textForUi,    // HTML or plain text for UI
        hasHtml: processed.hasHtml,        // Flag to indicate HTML content
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

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Phone, Settings, Download, Loader2, MessageCircle, History, Plus, Send, Calendar, Clock, Volume2, VolumeX, Zap, Square, ChevronDown, Pencil } from 'lucide-react';
import { 
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import VoiceRecordButton, { type VoiceRecordButtonHandle } from './VoiceRecordButton';
import AudioVisualizer from './AudioVisualizer';
import MessageBubble from './MessageBubble';
import MessageSkeleton from './MessageSkeleton';
import ConversationSkeleton from './ConversationSkeleton';
import { shouldGroupMessage, toSafeISOString, toSafeDate } from '@/lib/time';
import AgentTransparencyPanel, { type PipelineEvent, type TransparencyData } from './AgentTransparencyPanel';
import type { Conversation, Turn } from '@shared/schema';

const agentforceLogo = '/agentforce-logo.png';

type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

export default function VoiceChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isValidatingConversation, setIsValidatingConversation] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showConversation, setShowConversation] = useState<boolean>(() => {
    return localStorage.getItem('showConversation') === 'true'; // Default to false
  });
  const [pendingMessages, setPendingMessages] = useState<Map<string, { text: string; timestamp: Date; state: 'sending' | 'error'; conversationId: string; triggerAgent: boolean }>>(new Map());
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  
  // Transparency panel state
  const [showTransparency, setShowTransparency] = useState<boolean>(() => {
    return localStorage.getItem('showTransparency') === 'true';
  });
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);
  const currentPipelineRef = useRef<{ id: string; startTime: number; userMessage: string } | null>(null);

  // Streaming agent response state
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isAgentStreaming, setIsAgentStreaming] = useState(false);

  // Audio permission and playback state
  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    return localStorage.getItem('audioEnabled') === 'true';
  });
  const [showAudioPrompt, setShowAudioPrompt] = useState<boolean>(() => {
    return localStorage.getItem('audioEnabled') === null;
  });
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [pendingAudioText, setPendingAudioText] = useState<string | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState<boolean>(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  
  // Safari iOS workaround: Pre-create audio element during user gesture
  const blessedAudioRef = useRef<HTMLAudioElement | null>(null);
  const isAudioUnlockingRef = useRef<boolean>(false);

  // Currently-playing audio element (for stop/interrupt)
  const currentPlayingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll tracking for auto-scroll + jump-to-latest
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Hold-to-record / push-to-talk
  const voiceButtonRef = useRef<VoiceRecordButtonHandle>(null);
  const spaceHeldRef = useRef(false);
  const [holdToRecord, setHoldToRecord] = useState<boolean>(() =>
    localStorage.getItem('holdToRecord') === 'true'
  );

  // Global keyboard navigation + Space bar push-to-talk
  useEffect(() => {
    const isInTextInput = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Space bar push-to-talk (only when not typing in an input)
      if (e.key === ' ' && !e.repeat && !isInTextInput(e)) {
        e.preventDefault();
        if (!spaceHeldRef.current && !isValidatingConversation) {
          spaceHeldRef.current = true;
          // startRecording calls onBeforeRecording (unlockAudioForSafari) internally
          voiceButtonRef.current?.startRecording();
        }
        return;
      }

      // Esc key to close history drawer or cancel recording
      if (e.key === 'Escape') {
        if (isHistoryOpen) {
          e.preventDefault();
          setIsHistoryOpen(false);
        } else if (isRecording) {
          e.preventDefault();
          setRecordingState('idle');
          setIsRecording(false);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && spaceHeldRef.current && !isInTextInput(e)) {
        e.preventDefault();
        spaceHeldRef.current = false;
        voiceButtonRef.current?.stopRecording(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistoryOpen, isRecording, isValidatingConversation]);

  // Scroll handler: track whether user is near the bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 120;
    isNearBottomRef.current = near;
    setShowScrollButton(!near);
  }, []);

  // Auto-initialize audio context for returning users who previously enabled audio
  useEffect(() => {
    const restoreAudioContext = async () => {
      // Only auto-initialize if user previously enabled audio and we don't have a context yet
      if (audioEnabled && !audioContext) {
        console.log('🔊 Auto-restoring audio context for returning user...');
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          
          // AudioContext might be suspended initially, but we don't resume it here
          // It will be resumed automatically when we try to play audio
          setAudioContext(ctx);
          console.log('✓ Audio context restored successfully');
        } catch (error) {
          const errorDetails = {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'Unknown',
            stack: error instanceof Error ? error.stack : undefined
          };
          console.error('❌ Failed to restore audio context:', errorDetails);
          // If we can't create the context, disable audio
          setAudioEnabled(false);
          localStorage.setItem('audioEnabled', 'false');
        }
      }
    };

    restoreAudioContext();
  }, []); // Run only once on mount

  // Initialize audio context with user gesture
  const initializeAudio = useCallback(async () => {
    try {
      console.log('🔊 Initializing audio context...');
      
      // Create and resume audio context (for recording)
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      
      // Unlock HTML5 audio for Safari iOS (for TTS playback)
      console.log('🔓 Unlocking HTML5 audio for iOS Safari...');
      const silentAudio = new Audio();
      silentAudio.src = 'data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAAA==';
      (silentAudio as any).playsInline = true;
      silentAudio.muted = false;
      try {
        await silentAudio.play();
        console.log('✓ HTML5 audio unlocked successfully');
      } catch (e) {
        console.log('⚠️ HTML5 audio unlock failed (may work anyway):', e);
      }
      
      setAudioContext(ctx);
      setAudioEnabled(true);
      setShowAudioPrompt(false);
      
      // Store permission in localStorage
      localStorage.setItem('audioEnabled', 'true');
      
      console.log('✓ Audio context initialized successfully');
      
      // If there's pending audio, play it now
      if (pendingAudioText) {
        console.log('🎵 Playing pending audio text:', pendingAudioText.substring(0, 50) + '...');
        await playTextAsAudio(pendingAudioText);
        setPendingAudioText(null);
      }
      
      return true;
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      };
      console.error('❌ Failed to initialize audio:', errorDetails);
      setAudioEnabled(false);
      localStorage.setItem('audioEnabled', 'false');
      return false;
    }
  }, [pendingAudioText]);

  // Disable audio function
  const disableAudio = useCallback(() => {
    console.log('🔇 Disabling audio...');
    
    if (audioContext) {
      audioContext.close();
      setAudioContext(null);
    }
    
    setAudioEnabled(false);
    setShowAudioPrompt(false);
    setPendingAudioText(null);
    localStorage.setItem('audioEnabled', 'false');
  }, [audioContext]);

  // Validate conversation on component mount
  const validateAndSetConversation = useCallback(async (conversationId: string) => {
    setIsValidatingConversation(true);
    try {
      // Try to fetch the conversation to validate it exists
      const response = await fetch(`/api/conversations/${conversationId}`);
      
      if (response.ok) {
        const conversation = await response.json();
        console.log('✓ Valid conversation found:', conversationId);
        setCurrentConversationId(conversationId);
        return true;
      } else {
        throw new Error(`Conversation not found: ${response.status}`);
      }
    } catch (error) {
      console.log('✗ Conversation validation failed:', error);
      // Conversation doesn't exist, clean up localStorage and create new one
      localStorage.removeItem('currentConversationId');
      setCurrentConversationId(null);
      return false;
    } finally {
      setIsValidatingConversation(false);
    }
  }, []);

  // Initialize conversation on component mount
  useEffect(() => {
    const initializeConversation = async () => {
      const existingConversationId = localStorage.getItem('currentConversationId');
      
      if (existingConversationId) {
        console.log('🔍 Validating existing conversation:', existingConversationId);
        const isValid = await validateAndSetConversation(existingConversationId);
        
        if (!isValid) {
          console.log('📝 Creating new conversation after validation failed');
          createConversation({ title: 'Voice Chat', status: 'active' });
        }
      } else {
        console.log('📝 No existing conversation, creating new one');
        createConversation({ title: 'Voice Chat', status: 'active' });
      }
    };
    
    initializeConversation();
  }, [validateAndSetConversation]);

  // Get current conversation turns
  const { data: turns = [], isLoading: turnsLoading } = useQuery<Turn[]>({
    queryKey: ['/api/conversations', currentConversationId, 'turns'],
    enabled: !!currentConversationId && !isValidatingConversation,
  });

  // Get all conversations for history
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    enabled: true,
  });

  // Create conversation mutation with retry logic
  const { mutate: createConversation } = useMutation({
    mutationFn: (conversationData: { title: string; status: string; retryAgentRequest?: { text: string } }) =>
      apiRequest('/api/conversations', { method: 'POST', body: { title: conversationData.title, status: conversationData.status } }),
    onSuccess: (conversation: Conversation, variables) => {
      console.log('✓ New conversation created:', conversation.id);
      setCurrentConversationId(conversation.id);
      localStorage.setItem('currentConversationId', conversation.id);
      
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      
      // If this was created due to a failed agent request, retry it now
      if (variables.retryAgentRequest) {
        console.log('🔄 Retrying agent request with new conversation');
        setTimeout(() => {
          streamAgentResponse(variables.retryAgentRequest!.text, conversation.id);
        }, 100); // Small delay to ensure state is updated
      }
    },
  });

  // Function to start a new chat
  const startNewChat = () => {
    // Clear current conversation
    setCurrentConversationId(null);
    localStorage.removeItem('currentConversationId');

    // Clear any text input
    setTextMessage('');
    setShowTextInput(false);

    // Clear transparency pipeline events for the new conversation
    setPipelineEvents([]);
    currentPipelineRef.current = null;

    // Invalidate and refetch queries to clear cached data
    queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });

    // Create a new conversation
    createConversation({ title: 'Voice Chat', status: 'active' });
  };

  // Create turn mutation with message state tracking
  const { mutate: createTurn } = useMutation({
    mutationFn: (turnData: { conversationId: string; role: string; text: string; triggerAgent?: boolean; pendingId?: string }) => {
      // Add pending message for user messages
      if (turnData.role === 'user' && turnData.pendingId) {
        setPendingMessages(prev => new Map(prev.set(turnData.pendingId!, {
          text: turnData.text,
          timestamp: new Date(),
          state: 'sending',
          conversationId: turnData.conversationId,
          triggerAgent: turnData.triggerAgent ?? true,
        })));
      }
      
      return apiRequest(`/api/conversations/${turnData.conversationId}/turns`, {
        method: 'POST',
        body: { role: turnData.role, text: turnData.text },
      });
    },
    onSuccess: (data, variables) => {
      // Remove pending message on success
      if (variables.pendingId) {
        setPendingMessages(prev => {
          const newMap = new Map(prev);
          newMap.delete(variables.pendingId!);
          return newMap;
        });
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId, 'turns'] });
      
      // If this was a user turn that should trigger agent response, do it now
      if (variables.triggerAgent && variables.role === 'user') {
        streamAgentResponse(variables.text, variables.conversationId);
      }
    },
    onError: (error, variables) => {
      // Update pending message to error state
      if (variables.pendingId) {
        setPendingMessages(prev => new Map(prev.set(variables.pendingId!, {
          text: variables.text,
          timestamp: new Date(),
          state: 'error',
          conversationId: variables.conversationId,
          triggerAgent: variables.triggerAgent ?? true,
        })));
      }
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        status: (error as any)?.status,
        response: (error as any)?.response,
        stack: error instanceof Error ? error.stack : undefined
      };
      console.error('Error creating turn:', errorDetails);
    },
  });

  // Rename a conversation title
  const { mutate: updateConversationTitle } = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest(`/api/conversations/${id}`, { method: 'PATCH', body: { title } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    },
  });

  const saveTitle = (id: string) => {
    const trimmed = editingTitleValue.trim();
    const original = conversations.find((c: any) => c.id === id)?.title;
    if (trimmed && trimmed !== original) {
      updateConversationTitle({ id, title: trimmed });
    }
    setEditingTitleId(null);
  };

  // Retry a failed pending message
  const retryMessage = useCallback((pendingId: string) => {
    const pending = pendingMessages.get(pendingId);
    if (!pending || pending.state !== 'error') return;
    setPendingMessages(prev => new Map(prev.set(pendingId, { ...pending, state: 'sending' })));
    createTurn({
      conversationId: pending.conversationId,
      role: 'user',
      text: pending.text,
      triggerAgent: pending.triggerAgent,
      pendingId,
    });
  }, [pendingMessages, createTurn]);

  // Agentforce mutation with error handling
  const { mutate: getAgentResponse, isPending: agentPending } = useMutation({
    mutationFn: ({ text, conversationId }: { text: string; conversationId: string }) =>
      apiRequest('/api/agentforce', { method: 'POST', body: { text, conversationId } }),
    onSuccess: (response: { text: string; conversationId: string; transparency?: TransparencyData }) => {
      if (currentConversationId) {
        // Capture transparency data from the agent response
        if (response.transparency && currentPipelineRef.current) {
          const pipeline = currentPipelineRef.current;
          const totalClientMs = Date.now() - pipeline.startTime;

          setPipelineEvents(prev => {
            const existing = prev.find(e => e.id === pipeline.id);
            if (existing) {
              return prev.map(e => e.id === pipeline.id ? {
                ...e,
                agent: response.transparency!,
                totalClientMs,
                ttsRequested: audioEnabled,
              } : e);
            }
            // If no existing event (edge case), create one
            return [...prev, {
              id: pipeline.id,
              userMessage: pipeline.userMessage,
              timestamp: new Date().toISOString(),
              agent: response.transparency!,
              totalClientMs,
              ttsRequested: audioEnabled,
            }];
          });

          currentPipelineRef.current = null;
        }

        // Start TTS immediately for faster playback - don't wait for UI updates
        playTextAsAudio(response.text);

        // Create turn in parallel (UI update can happen while audio starts)
        createTurn({
          conversationId: currentConversationId,
          role: 'assistant',
          text: response.text,
        });
      }
    },
    onError: (error: any, variables) => {
      const errorDetails = {
        message: error?.message || String(error),
        name: error?.name,
        status: error?.status,
        response: error?.response,
        stack: error?.stack
      };
      console.error('Agentforce error:', errorDetails);
      
      // Check if it's a conversation not found error
      if (error.message?.includes('Conversation not found') || 
          error.status === 404 ||
          (typeof error === 'string' && error.includes('404'))) {
        console.log('🔄 Conversation not found, recovering by creating new conversation');
        
        // Clear current conversation and create a new one
        localStorage.removeItem('currentConversationId');
        setCurrentConversationId(null);
        
        // Create new conversation and retry the agent request
        createConversation({ 
          title: 'Voice Chat', 
          status: 'active',
          retryAgentRequest: { text: variables.text } // Pass data to retry after creation
        });
      }
    },
  });

  // Auto-scroll to bottom when new content arrives, if already near bottom
  useEffect(() => {
    if (isNearBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turns.length, pendingMessages.size, streamingText, agentPending]);

  // Stream agent response via SSE, with fallback to the blocking mutation
  const streamAgentResponse = async (userText: string, convId: string) => {
    setIsAgentStreaming(true);
    setStreamingText(null);

    try {
      const response = await fetch('/api/agentforce/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText, conversationId: convId }),
      });

      // If the server returned an error before sending SSE headers, fall back to the blocking endpoint
      if (!response.ok || !response.body) {
        console.warn('⚠️ Stream endpoint unavailable, falling back to blocking request');
        setIsAgentStreaming(false);
        getAgentResponse({ text: userText, conversationId: convId });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let ttsStarted = false;
      let doneReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE blocks are separated by double newline
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const eventMatch = block.match(/^event: (\w+)/m);
          const dataMatch = block.match(/^data: (.+)/ms);
          if (!eventMatch || !dataMatch) continue;

          const eventType = eventMatch[1];
          let data: any;
          try {
            data = JSON.parse(dataMatch[1]);
          } catch {
            continue;
          }

          if (eventType === 'chunk') {
            accumulatedText += data.text;
            setStreamingText(accumulatedText);

            // Start TTS on the first complete sentence to overlap generation and playback
            if (!ttsStarted && audioEnabled && /[.!?]\s/.test(accumulatedText)) {
              const firstSentenceMatch = accumulatedText.match(/^.*?[.!?](?:\s|$)/);
              if (firstSentenceMatch) {
                ttsStarted = true;
                console.log('🎵 Early TTS: starting on first sentence');
                playTextAsAudio(firstSentenceMatch[0].trim());
              }
            }
          } else if (eventType === 'done') {
            doneReceived = true;
            // Clear streaming bubble — real turn will appear via query invalidation
            setStreamingText(null);
            setIsAgentStreaming(false);

            // Update transparency panel
            if (data.transparency && currentPipelineRef.current) {
              const pipeline = currentPipelineRef.current;
              const totalClientMs = Date.now() - pipeline.startTime;
              setPipelineEvents(prev => prev.map(e =>
                e.id === pipeline.id
                  ? { ...e, agent: data.transparency, totalClientMs, ttsRequested: audioEnabled }
                  : e
              ));
              currentPipelineRef.current = null;
            }

            // Play full TTS only if we haven't started early playback
            if (!ttsStarted && audioEnabled) {
              playTextAsAudio(data.text);
            }

            // Save the assistant turn
            createTurn({
              conversationId: convId,
              role: 'assistant',
              text: data.text,
            });
          } else if (eventType === 'error') {
            console.error('❌ Streaming agent error:', data.error);
            setStreamingText(null);
            setIsAgentStreaming(false);
            // Fall back to blocking request on stream error
            getAgentResponse({ text: userText, conversationId: convId });
          }
        }
      }

      // Safety: if stream ended without a 'done' event and we still have text, save it
      if (accumulatedText && !doneReceived) {
        setStreamingText(null);
        setIsAgentStreaming(false);
        createTurn({ conversationId: convId, role: 'assistant', text: accumulatedText });
        if (!ttsStarted && audioEnabled) playTextAsAudio(accumulatedText);
      }
    } catch (error) {
      console.error('❌ Stream fetch error, falling back to blocking request:', error);
      setStreamingText(null);
      setIsAgentStreaming(false);
      getAgentResponse({ text: userText, conversationId: convId });
    }
  };

  // Removed auto-scroll to prevent interference with user interactions
  // Users can manually scroll to see new messages

  // Unlock audio for Safari iOS - must be called BEFORE starting recording
  const unlockAudioForSafari = async () => {
    // Prevent multiple simultaneous unlock attempts
    if (isAudioUnlockingRef.current || blessedAudioRef.current) {
      return;
    }
    
    isAudioUnlockingRef.current = true;
    
    try {
      console.log('🔓 Unlocking audio for Safari iOS on user gesture...');
      const audio = new Audio();
      (audio as any).playsInline = true;
      audio.preload = 'auto';
      
      // Play silent audio to unlock Safari's audio restrictions
      // This MUST happen during the user gesture, BEFORE recording starts
      const silentAudio = 'data:audio/mp3;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAAA==';
      audio.src = silentAudio;
      audio.muted = false;
      audio.volume = 0.01; // Very quiet but not muted
      
      try {
        // This play() call during user gesture unlocks audio for the session
        await audio.play();
        console.log('✓ Audio unlocked successfully for Safari iOS');
        audio.pause();
        audio.currentTime = 0;
      } catch (e) {
        console.warn('⚠️ Silent audio play failed (may still work):', e);
      }
      
      blessedAudioRef.current = audio;
      console.log('🎵 Created blessed audio element for Safari iOS');
      
      // If audio isn't enabled yet but we just unlocked it, auto-enable
      if (!audioEnabled) {
        console.log('🔊 Auto-enabling audio after successful unlock');
        setAudioEnabled(true);
        localStorage.setItem('audioEnabled', 'true');
        setShowAudioPrompt(false);
      }
    } finally {
      isAudioUnlockingRef.current = false;
    }
  };

  const stopAudio = useCallback(() => {
    const audio = currentPlayingAudioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      currentPlayingAudioRef.current = null;
    }
    setIsAudioPlaying(false);
  }, []);

  const handleRecordingStart = () => {
    setIsRecording(true);
    setRecordingState('recording');
    setRecordingError(null);
    console.log('Voice recording started');
  };

  const handleRecordingError = (error: string) => {
    console.error('Recording error:', error);
    setIsRecording(false);
    setRecordingState('error');
    setRecordingError(error);
    setIsProcessing(false);
  };

  const handleTextMessage = async () => {
    if (!textMessage.trim() || !currentConversationId) return;

    console.log('Sending text message:', textMessage);
    setIsProcessing(true);

    const pendingId = `pending-${Date.now()}-${Math.random()}`;
    const messageText = textMessage;

    // Start tracking a pipeline event for transparency (text input, no STT)
    const pipelineId = `pipeline-${Date.now()}`;
    currentPipelineRef.current = { id: pipelineId, startTime: Date.now(), userMessage: messageText };
    setPipelineEvents(prev => [...prev, {
      id: pipelineId,
      userMessage: messageText,
      timestamp: new Date().toISOString(),
      ttsRequested: audioEnabled,
    }]);

    try {
      // Create user turn and trigger agent response after it's saved
      createTurn({
        conversationId: currentConversationId,
        role: 'user',
        text: messageText,
        triggerAgent: true,
        pendingId,
      });
      
      setTextMessage('');
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      };
      console.error('Error sending text message:', errorDetails);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRecordingStop = async (audioBlob?: Blob) => {
    setIsRecording(false);
    console.log('Voice recording stopped', audioBlob?.size, 'bytes');
    
    if (!audioBlob || !currentConversationId) {
      setRecordingState('idle');
      return;
    }
    
    // Check if audio blob has data
    if (audioBlob.size === 0 || audioBlob.size < 100) {
      console.error('Audio recording is empty or too small:', audioBlob.size, 'bytes');
      setRecordingError('Recording too short or empty. Please hold the button longer and speak clearly.');
      setRecordingState('error');
      return;
    }

    setRecordingState('processing');
    setIsProcessing(true);
    
    try {
      // Convert audio to text using STT API
      const formData = new FormData();
      // Determine proper file extension based on actual MIME type
      let fileExtension = 'wav'; // default fallback
      if (audioBlob.type.includes('webm')) {
        fileExtension = 'webm';
      } else if (audioBlob.type.includes('mp4')) {
        fileExtension = 'm4a'; // Use m4a for mp4 audio, which OpenAI supports better
      } else if (audioBlob.type.includes('ogg')) {
        fileExtension = 'ogg';
      }
      
      console.log('Sending audio file:', `recording.${fileExtension}`, 'with type:', audioBlob.type);
      formData.append('file', audioBlob, `recording.${fileExtension}`);

      const sttResponse = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!sttResponse.ok) {
        const errorText = await sttResponse.text();
        let errorJson;
        try { 
          errorJson = JSON.parse(errorText); 
        } catch (e) { 
          // errorText is not JSON, use as is
        }
        const errorDetails = {
          status: sttResponse.status,
          statusText: sttResponse.statusText,
          body: errorJson || errorText,
          headers: Object.fromEntries(sttResponse.headers.entries())
        };
        console.error('STT API Error details:', errorDetails);
        throw new Error(`STT failed: ${sttResponse.status} ${errorJson?.error || errorText}`);
      }

      const sttResult = await sttResponse.json();
      const { text } = sttResult;
      console.log('Transcribed text:', text);

      if (text.trim()) {
        // Start tracking a pipeline event for transparency
        const pipelineId = `pipeline-${Date.now()}`;
        currentPipelineRef.current = { id: pipelineId, startTime: Date.now(), userMessage: text };

        // Capture STT transparency data from the response
        const sttTransparency = sttResult.transparency;
        if (sttTransparency) {
          setPipelineEvents(prev => [...prev, {
            id: pipelineId,
            userMessage: text,
            timestamp: new Date().toISOString(),
            stt: {
              processingMs: sttTransparency.sttProcessingMs,
              audioSizeBytes: sttTransparency.audioSizeBytes,
              mimeType: sttTransparency.mimeType,
            },
            ttsRequested: audioEnabled,
          }]);
        }

        const pendingId = `pending-${Date.now()}-${Math.random()}`;

        // Create user turn and trigger agent response after it's saved
        createTurn({
          conversationId: currentConversationId,
          role: 'user',
          text: text,
          triggerAgent: true,
          pendingId,
        });

        setRecordingState('idle');
      } else {
        setRecordingError('No speech detected. Please speak clearly and try again.');
        setRecordingState('error');
      }
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        response: (error as any)?.response,
        status: (error as any)?.status
      };
      console.error('Error processing voice:', errorDetails);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process recording';
      setRecordingError(`Processing failed: ${errorMessage}`);
      setRecordingState('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const playTextAsAudio = async (text: string): Promise<boolean> => {
    try {
      // Check if audio is enabled - HTML5 audio doesn't need audioContext
      if (!audioEnabled) {
        console.log('🔇 Audio disabled, storing as pending:', text.substring(0, 50) + '...');
        setPendingAudioText(text);
        return false;
      }

      console.log('🎵 Playing TTS audio:', text.substring(0, 50) + '...');
      
      // Use a unique URL with query params to enable audio streaming
      const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&voice=allison&_t=${Date.now()}`;
      
      // Safari iOS workaround: Reuse blessed audio element if available
      let audio: HTMLAudioElement;
      if (blessedAudioRef.current) {
        console.log('🎵 Reusing blessed audio element for Safari iOS');
        audio = blessedAudioRef.current;
        audio.src = audioUrl; // Update the source
      } else {
        // Fallback: Create new audio element (works on desktop browsers)
        console.log('🎵 Creating new audio element (desktop or no blessed audio)');
        audio = new Audio();
        audio.preload = 'auto';
        audio.src = audioUrl;
        (audio as any).playsInline = true;
      }
      
      // Ensure audio is not muted and has proper volume
      audio.muted = false;
      audio.volume = 1.0; // Restore full volume (might have been lowered during unlock)

      // Return a promise that resolves when playback starts or fails
      return new Promise((resolve) => {
        const cleanup = () => {
          audio.removeEventListener('canplay', onCanPlay);
          audio.removeEventListener('error', onError);
          audio.removeEventListener('ended', onEnded);
        };

        const onCanPlay = () => {
          console.log('🎵 Audio canplay event fired, attempting playback...');
          audio.play()
            .then(() => {
              console.log('✓ Audio playback started successfully');
              currentPlayingAudioRef.current = audio;
              setIsAudioPlaying(true);
              resolve(true);
            })
            .catch((playError) => {
              const errorDetails = {
                message: playError instanceof Error ? playError.message : String(playError),
                name: playError instanceof Error ? playError.name : 'Unknown',
                audioEnabled,
                blessedAudioExists: !!blessedAudioRef.current,
                audioSrc: audio.src,
                audioReadyState: audio.readyState
              };
              console.error('❌ Audio play failed:', errorDetails);
              console.error('💡 Hint: If on iOS Safari, make sure audio was unlocked during user gesture');
              // Store as pending for later manual play
              setIsAudioPlaying(false);
              setPendingAudioText(text);
              cleanup();
              resolve(false);
            });
        };

        const onError = (e: Event) => {
          const errorDetails = {
            type: e.type,
            target: e.target ? 'HTMLAudioElement' : 'Unknown',
            currentSrc: audio.currentSrc,
            readyState: audio.readyState,
            networkState: audio.networkState
          };
          console.error('❌ Audio loading error:', errorDetails);
          setIsAudioPlaying(false);
          setPendingAudioText(text);
          cleanup();
          resolve(false);
        };

        const onEnded = () => {
          console.log('✓ Audio playback completed');
          currentPlayingAudioRef.current = null;
          setIsAudioPlaying(false);
          cleanup();
        };

        audio.addEventListener('canplay', onCanPlay);
        audio.addEventListener('error', onError);
        audio.addEventListener('ended', onEnded);

        // Set a timeout in case the audio never loads
        setTimeout(() => {
          if (audio.readyState === 0) {
            console.warn('⚠️ Audio loading timeout');
            setPendingAudioText(text);
            cleanup();
            resolve(false);
          }
        }, 5000);
      });
      
    } catch (error) {
      const errorDetails = {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      };
      console.error('❌ Error in playTextAsAudio:', errorDetails);
      setPendingAudioText(text);
      return false;
    }
  };

  return (
    <div className="app-shell">
      {/* Mobile App Header */}
      <header className="app-header" role="banner">
        <div className="flex items-center justify-between px-lg py-md h-14">
          <div className="flex items-center gap-md flex-1">
            <img 
              src={agentforceLogo} 
              alt="Agentforce" 
              className="w-8 h-8 object-contain flex-shrink-0"
              data-testid="img-header-logo"
            />
            <h1 className="text-xl font-semibold text-foreground truncate" data-testid="text-agentforce-title">
              Agentforce
            </h1>
          </div>
          
          {/* Header Actions */}
          <div className="flex items-center gap-sm">
            <Drawer open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <DrawerTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="touch-target w-11 h-11 rounded-full"
                  data-testid="button-history"
                  aria-label="View conversation history"
                >
                  <History className="w-5 h-5" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[85vh]">
                <DrawerHeader className="text-center">
                  <DrawerTitle className="text-xl font-semibold">Conversation History</DrawerTitle>
                  <DrawerDescription className="text-muted-foreground">
                    Your recent conversations and chat history
                  </DrawerDescription>
                </DrawerHeader>
                
                <div className="px-lg pb-lg overflow-y-auto max-h-[calc(85vh-120px)]">
                  {conversationsLoading ? (
                    <div className="space-y-md" aria-busy="true" aria-label="Loading conversations">
                      {/* Show 6 skeleton conversation cards */}
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                    </div>
                  ) : conversations.length === 0 ? (
                    <div className="text-center py-xl" role="status">
                      <History className="w-16 h-16 text-muted-foreground mx-auto mb-lg" aria-hidden="true" />
                      <h3 className="text-xl font-semibold mb-md text-foreground">Ready to chat?</h3>
                      <p className="text-muted-foreground mb-lg max-w-sm mx-auto leading-relaxed">
                        Start a conversation with Agentforce using voice or text. Your chat history will appear here.
                      </p>
                      <Button 
                        onClick={() => setIsHistoryOpen(false)} 
                        className="rounded-full"
                        data-testid="button-start-new-conversation"
                        aria-label="Close history and start new conversation"
                      >
                        <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                        Start New Conversation
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-md">
                      {conversations.map((conversation) => {
                        const isCurrentConversation = conversation.id === currentConversationId;
                        const lastActivity = new Date(conversation.createdAt);
                        
                        return (
                          <Card
                            key={conversation.id}
                            className={`group hover-elevate cursor-pointer transition-all duration-200 ${
                              isCurrentConversation ? 'ring-2 ring-primary/20 border-primary/30' : ''
                            }`}
                            onClick={() => {
                              if (editingTitleId === conversation.id) return;
                              if (!isCurrentConversation) {
                                setCurrentConversationId(conversation.id);
                                localStorage.setItem('currentConversationId', conversation.id);
                                queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
                                // Clear transparency events — they belong to the previous session
                                setPipelineEvents([]);
                                currentPipelineRef.current = null;
                              }
                              setIsHistoryOpen(false);
                            }}
                            data-testid={`card-conversation-${conversation.id}`}
                          >
                            <CardContent className="p-lg">
                              <div className="flex items-start justify-between gap-md">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-sm mb-sm">
                                    {editingTitleId === conversation.id ? (
                                      <input
                                        value={editingTitleValue}
                                        onChange={(e) => setEditingTitleValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveTitle(conversation.id);
                                          if (e.key === 'Escape') setEditingTitleId(null);
                                          e.stopPropagation();
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={() => saveTitle(conversation.id)}
                                        autoFocus
                                        className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b border-primary outline-none py-0.5 text-foreground w-full"
                                        aria-label="Edit conversation title"
                                      />
                                    ) : (
                                      <>
                                        <h4 className="font-medium text-foreground truncate flex-1 min-w-0">
                                          {conversation.title}
                                        </h4>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingTitleId(conversation.id);
                                            setEditingTitleValue(conversation.title);
                                          }}
                                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-muted flex-shrink-0 transition-opacity"
                                          aria-label="Edit conversation title"
                                          title="Rename"
                                        >
                                          <Pencil className="w-3 h-3 text-muted-foreground" />
                                        </button>
                                      </>
                                    )}
                                    {isCurrentConversation && (
                                      <Badge variant="secondary" className="text-xs px-sm py-0.5 flex-shrink-0">
                                        Current
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-md text-xs text-muted-foreground">
                                    <div className="flex items-center gap-xs">
                                      <Clock className="w-3 h-3" />
                                      <span>
                                        {lastActivity.toLocaleDateString()} at {lastActivity.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-xs">
                                      <MessageCircle className="w-3 h-3" />
                                      <span>{conversation.status}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              </DrawerContent>
            </Drawer>
            
            {turns.length > 0 && (
              <Button
                size="icon"
                variant="ghost"
                className="touch-target w-11 h-11 rounded-full"
                onClick={startNewChat}
                data-testid="button-new-chat"
              >
                <Plus className="w-5 h-5" />
              </Button>
            )}
            
            {/* Audio Toggle Button */}
            <Button
              size="icon"
              variant="ghost"
              className="touch-target w-11 h-11 rounded-full"
              onClick={() => audioEnabled ? disableAudio() : initializeAudio()}
              data-testid={`button-audio-${audioEnabled ? 'enabled' : 'disabled'}`}
              title={audioEnabled ? 'Disable voice responses' : 'Enable voice responses'}
            >
              {audioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </Button>

            {/* Transparency Panel Toggle */}
            <Button
              size="icon"
              variant={showTransparency ? 'default' : 'ghost'}
              className="touch-target w-11 h-11 rounded-full"
              onClick={() => {
                const next = !showTransparency;
                setShowTransparency(next);
                localStorage.setItem('showTransparency', String(next));
              }}
              data-testid="button-transparency"
              title={showTransparency ? 'Hide agent transparency' : 'Show agent transparency'}
            >
              <Zap className="w-5 h-5" />
            </Button>
            
            <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <SheetTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="touch-target w-11 h-11 rounded-full"
                  data-testid="button-settings"
                >
                  <Settings className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-80">
                <SheetHeader>
                  <SheetTitle>Settings</SheetTitle>
                  <SheetDescription>
                    Customize your voice chat experience
                  </SheetDescription>
                </SheetHeader>
                
                <div className="space-y-6 mt-6">
                  <div className="flex items-center justify-between space-x-4">
                    <Label htmlFor="show-conversation" className="flex flex-col space-y-1">
                      <span className="text-sm font-medium">Show Conversation</span>
                      <span className="text-xs text-muted-foreground">
                        Display chat messages or voice-only mode
                      </span>
                    </Label>
                    <Switch
                      id="show-conversation"
                      checked={showConversation}
                      onCheckedChange={(checked) => {
                        setShowConversation(checked);
                        localStorage.setItem('showConversation', String(checked));
                      }}
                      data-testid="toggle-conversation"
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-4">
                    <Label htmlFor="hold-to-record" className="flex flex-col space-y-1">
                      <span className="text-sm font-medium">Hold to Speak</span>
                      <span className="text-xs text-muted-foreground">
                        Press &amp; hold the mic to record; release to send.
                        On desktop, Space bar works the same way.
                      </span>
                    </Label>
                    <Switch
                      id="hold-to-record"
                      checked={holdToRecord}
                      onCheckedChange={(checked) => {
                        setHoldToRecord(checked);
                        localStorage.setItem('holdToRecord', String(checked));
                      }}
                      data-testid="toggle-hold-to-record"
                    />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content + Transparency Panel Row */}
      <div className="flex flex-1 overflow-hidden">

      {/* Main Content Area */}
      <main
        ref={(el) => { scrollContainerRef.current = el; }}
        onScroll={handleScroll}
        className={`app-content relative flex-1 transition-all duration-200 ${showTransparency ? 'md:pr-80' : ''}`}
        role="main"
        aria-label="Chat conversation"
      >
        {showConversation ? (
          // Conversation Mode
          <div className="px-lg py-lg space-y-lg h-full">
          {/* Screen reader live region for chat updates */}
          <div className="sr-only" aria-live="polite" id="chat-announcements"></div>
          
          {/* Audio Enable Prompt */}
          {showAudioPrompt && !isValidatingConversation && (
            <div className="audio-prompt-container">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-lg text-center">
                  <Volume2 className="w-12 h-12 text-primary mx-auto mb-md" />
                  <h3 className="text-lg font-semibold text-foreground mb-sm">Enable Voice Responses?</h3>
                  <p className="text-sm text-muted-foreground mb-lg max-w-md mx-auto leading-relaxed">
                    Agentforce can speak its responses aloud for a more natural conversation experience. 
                    This requires your permission to play audio.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-sm justify-center">
                    <Button
                      onClick={initializeAudio}
                      className="rounded-full"
                      data-testid="button-enable-audio"
                    >
                      <Volume2 className="w-4 h-4 mr-2" />
                      Enable Voice Responses
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowAudioPrompt(false);
                        localStorage.setItem('audioEnabled', 'false');
                      }}
                      className="rounded-full"
                      data-testid="button-disable-audio"
                    >
                      <VolumeX className="w-4 h-4 mr-2" />
                      Keep Text Only
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Pending Audio Notification */}
          {pendingAudioText && !showAudioPrompt && (
            <div className="pending-audio-container">
              <Card className="border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950">
                <CardContent className="p-lg">
                  <div className="flex items-center justify-between gap-md">
                    <div className="flex items-center gap-sm">
                      <VolumeX className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                      <div>
                        <h4 className="font-medium text-orange-800 dark:text-orange-200">Voice Response Available</h4>
                        <p className="text-sm text-orange-700 dark:text-orange-300">
                          Tap to play the voice response
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-sm">
                      <Button
                        size="sm"
                        onClick={() => {
                          if (pendingAudioText) {
                            initializeAudio();
                          }
                        }}
                        className="rounded-full bg-orange-600 hover:bg-orange-700 text-white"
                        data-testid="button-play-pending-audio"
                      >
                        <Volume2 className="w-4 h-4 mr-1" />
                        Play
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPendingAudioText(null)}
                        className="rounded-full border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-600 dark:text-orange-300 dark:hover:bg-orange-900"
                        data-testid="button-dismiss-pending-audio"
                      >
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
          
          {/* Welcome State */}
          {turns.length === 0 && !turnsLoading && !isValidatingConversation && (
            <div className="flex flex-col items-center justify-center h-full text-center px-xl">
              <div className="mb-2xl">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-xl mx-auto">
                  <img 
                    src={agentforceLogo} 
                    alt="Agentforce" 
                    className="w-12 h-12 object-contain"
                    data-testid="img-agentforce-logo"
                  />
                </div>
                <h2 className="text-2xl font-semibold text-foreground mb-md" data-testid="text-main-title">
                  Talk to Agentforce
                </h2>
                <p className="text-base text-muted-foreground leading-relaxed max-w-sm" data-testid="text-instructions">
                  {holdToRecord
                    ? 'Press and hold the mic button to record. Release to send. On desktop, hold Space bar instead.'
                    : 'Tap the mic button to start recording. On desktop, hold the Space bar to speak hands-free.'}
                </p>
              </div>
            </div>
          )}

          {/* Connection State with Skeleton Messages */}
          {isValidatingConversation && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-center py-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
                <span className="ml-md text-base text-muted-foreground">Connecting...</span>
              </div>
              
              {/* Skeleton message bubbles to show loading conversation */}
              <div className="flex-1 overflow-y-auto" aria-busy="true" aria-label="Loading conversation messages">
                <MessageSkeleton isUser={false} isFirstInGroup={true} isLastInGroup={false} />
                <MessageSkeleton isUser={true} isFirstInGroup={true} isLastInGroup={true} />
                <MessageSkeleton isUser={false} isFirstInGroup={true} isLastInGroup={false} />
                <MessageSkeleton isUser={false} isFirstInGroup={false} isLastInGroup={true} />
                <MessageSkeleton isUser={true} isFirstInGroup={true} isLastInGroup={true} />
                <MessageSkeleton isUser={false} isFirstInGroup={true} isLastInGroup={true} />
                <MessageSkeleton isUser={true} isFirstInGroup={true} isLastInGroup={false} />
                <MessageSkeleton isUser={true} isFirstInGroup={false} isLastInGroup={true} />
              </div>
            </div>
          )}

          {/* Messages */}
          {turnsLoading && !isValidatingConversation ? (
            <div className="pb-lg" aria-busy="true" aria-label="Loading messages">
              {/* Skeleton messages while loading */}
              <MessageSkeleton isUser={false} isFirstInGroup={true} isLastInGroup={true} />
              <MessageSkeleton isUser={true} isFirstInGroup={true} isLastInGroup={false} />
              <MessageSkeleton isUser={true} isFirstInGroup={false} isLastInGroup={true} />
              <MessageSkeleton isUser={false} isFirstInGroup={true} isLastInGroup={false} />
              <MessageSkeleton isUser={false} isFirstInGroup={false} isLastInGroup={true} />
              <MessageSkeleton isUser={true} isFirstInGroup={true} isLastInGroup={true} />
            </div>
          ) : turns.length > 0 && (
            <div className="pb-lg" aria-busy={agentPending || isAgentStreaming} aria-live="polite">
              {/* Render saved messages */}
              {turns.map((turn, index) => {
                const previousTurn = index > 0 ? turns[index - 1] : null;
                const nextTurn = index < turns.length - 1 ? turns[index + 1] : null;
                
                const isGroupedWithPrevious = shouldGroupMessage(
                  { role: turn.role, createdAt: toSafeISOString(turn.createdAt) },
                  previousTurn ? { role: previousTurn.role, createdAt: toSafeISOString(previousTurn.createdAt) } : null
                );
                const isGroupedWithNext = nextTurn ? shouldGroupMessage(
                  { role: nextTurn.role, createdAt: toSafeISOString(nextTurn.createdAt) },
                  { role: turn.role, createdAt: toSafeISOString(turn.createdAt) }
                ) : false;
                
                const isFirstInGroup = !isGroupedWithPrevious;
                const isLastInGroup = !isGroupedWithNext;
                
                const isLastAgentTurn =
                  turn.role === 'assistant' &&
                  index === turns.length - 1 &&
                  !isAgentStreaming;

                return (
                  <MessageBubble
                    key={turn.id}
                    message={turn.text}
                    isUser={turn.role === 'user'}
                    timestamp={toSafeDate(turn.createdAt)}
                    isFirstInGroup={isFirstInGroup}
                    isLastInGroup={isLastInGroup}
                    showAvatar={true}
                    showTimestamp={true}
                    messageState="sent"
                    isPlaying={isAudioPlaying && isLastAgentTurn}
                  />
                );
              })}
              
              {/* Render pending messages */}
              {Array.from(pendingMessages.entries()).map(([pendingId, pendingMessage]) => {
                const lastTurn = turns[turns.length - 1];
                
                const isGroupedWithPrevious = lastTurn ? shouldGroupMessage(
                  { role: 'user', createdAt: toSafeISOString(pendingMessage.timestamp) },
                  { role: lastTurn.role, createdAt: toSafeISOString(lastTurn.createdAt) }
                ) : false;
                
                return (
                  <MessageBubble
                    key={pendingId}
                    message={pendingMessage.text}
                    isUser={true}
                    timestamp={pendingMessage.timestamp}
                    isFirstInGroup={!isGroupedWithPrevious}
                    isLastInGroup={true}
                    showAvatar={true}
                    showTimestamp={true}
                    messageState={pendingMessage.state}
                    onRetry={pendingMessage.state === 'error' ? () => retryMessage(pendingId) : undefined}
                  />
                );
              })}
              
              {/* Agent streaming text or typing indicator */}
              {isAgentStreaming && streamingText ? (
                <div aria-busy="true" aria-live="polite" role="status" aria-label="Agent is responding">
                  <MessageBubble
                    message={streamingText + '▌'}
                    isUser={false}
                    isTyping={false}
                    isFirstInGroup={true}
                    isLastInGroup={true}
                    showAvatar={true}
                    showTimestamp={false}
                    messageState="sent"
                    isPlaying={isAudioPlaying}
                  />
                </div>
              ) : (agentPending || isAgentStreaming) && (
                <div aria-busy="true" aria-live="polite" role="status" aria-label="Agent is responding">
                  <MessageBubble
                    message=""
                    isUser={false}
                    isTyping={true}
                    isFirstInGroup={true}
                    isLastInGroup={true}
                    showAvatar={true}
                    showTimestamp={false}
                  />
                </div>
              )}
            </div>
          )}
          
          <div ref={messagesEndRef} />
          </div>
        ) : (
          // Voice-Only Mode  
          <div className="flex-1 grid place-items-center px-lg py-xl">
            <div className="flex flex-col items-center gap-8 text-center" data-testid="voice-center">
              {/* Agentforce Logo with Animation */}
              <div className={`relative transition-transform duration-300 ${
                recordingState === 'recording' ? 'scale-110' :
                recordingState === 'processing' ? 'scale-105' :
                (agentPending || isAgentStreaming) ? 'scale-105' :
                isAudioPlaying ? 'scale-105' :
                'scale-100'
              }`}>
                {/* Ripple Rings — Listening (blue) */}
                {recordingState === 'recording' && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-blue-500/30 animate-ping" />
                    <div className="absolute inset-0 rounded-full border-2 border-blue-400/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                    <div className="absolute inset-0 rounded-full border-2 border-blue-300/10 animate-ping" style={{ animationDelay: '1s' }} />
                  </>
                )}

                {/* Ripple Rings — Processing (amber) */}
                {recordingState === 'processing' && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-amber-500/30 animate-ping" />
                    <div className="absolute inset-0 rounded-full border-2 border-amber-400/20 animate-ping" style={{ animationDelay: '0.4s' }} />
                    <div className="absolute inset-0 rounded-full border-2 border-amber-300/10 animate-ping" style={{ animationDelay: '0.8s' }} />
                  </>
                )}

                {/* Ripple Rings — Agent Thinking / Streaming (purple) */}
                {(agentPending || isAgentStreaming) && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/30 animate-ping" />
                    <div className="absolute inset-0 rounded-full border-2 border-purple-400/20 animate-ping" style={{ animationDelay: '0.3s' }} />
                    <div className="absolute inset-0 rounded-full border-2 border-purple-300/10 animate-ping" style={{ animationDelay: '0.6s' }} />
                  </>
                )}

                {/* Ripple Rings — Agent Speaking (green) */}
                {isAudioPlaying && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-green-500/30 animate-ping" />
                    <div className="absolute inset-0 rounded-full border-2 border-green-400/20 animate-ping" style={{ animationDelay: '0.4s' }} />
                    <div className="absolute inset-0 rounded-full border-2 border-green-300/10 animate-ping" style={{ animationDelay: '0.8s' }} />
                  </>
                )}

                {/* Logo Container — bg tints with state */}
                <div className={`w-32 h-32 rounded-full flex items-center justify-center relative overflow-hidden transition-colors duration-500 ${
                  recordingState === 'recording' ? 'bg-blue-500/10' :
                  recordingState === 'processing' ? 'bg-amber-500/10' :
                  (agentPending || isAgentStreaming) ? 'bg-purple-500/10' :
                  isAudioPlaying ? 'bg-green-500/10' :
                  'bg-primary/10'
                }`}>
                  <img
                    src={agentforceLogo}
                    alt="Agentforce"
                    className="w-20 h-20 object-contain"
                    data-testid="voice-mode-logo"
                  />
                </div>
              </div>

              {/* Status Text — color-coded to match active state */}
              <div className="space-y-2">
                <h2 className="text-xl font-semibold text-foreground">Voice Mode</h2>
                <p className={`text-sm max-w-sm transition-colors duration-300 ${
                  recordingState === 'recording' ? 'text-blue-500' :
                  recordingState === 'processing' ? 'text-amber-500' :
                  (agentPending || isAgentStreaming) ? 'text-purple-500' :
                  isAudioPlaying ? 'text-green-500' :
                  'text-muted-foreground'
                }`}>
                  {recordingState === 'recording' ? 'Listening...' :
                   recordingState === 'processing' ? 'Processing your message...' :
                   (agentPending || isAgentStreaming) ? (streamingText ? 'Agent is responding...' : 'Thinking...') :
                   isAudioPlaying ? 'Agent is speaking...' :
                   holdToRecord ? 'Hold the mic button to speak' :
                   'Tap the mic to start · Space bar on desktop'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Jump to latest — absolute overlay, appears when user scrolls up in conversation */}
        {showScrollButton && showConversation && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none z-10">
            <Button
              size="sm"
              variant="secondary"
              className="rounded-full shadow-lg gap-1 px-md pointer-events-auto"
              onClick={() => {
                messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                setShowScrollButton(false);
              }}
              aria-label="Jump to latest message"
            >
              <ChevronDown className="w-4 h-4" />
              Latest
            </Button>
          </div>
        )}
      </main>

      </div>

      {/* Voice Composer */}
      <footer className={`app-footer transition-all duration-200 ${showTransparency ? 'md:pr-80' : ''}`}>
        <div className="px-lg pt-lg pb-lg keyboard-aware">
          {/* Unified Composer Layout */}
          <div className="flex flex-col gap-lg">
            {/* Text Input Field - Show when expanded */}
            {showTextInput && (
              <div className="transition-all duration-300 ease-in-out">
                <div className="flex gap-md items-end">
                  <Input
                    value={textMessage}
                    onChange={(e) => setTextMessage(e.target.value)}
                    placeholder="Type your message..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleTextMessage();
                      }
                    }}
                    disabled={isProcessing || recordingState === 'processing'}
                    className="flex-1 h-12 rounded-full px-lg text-base touch-target"
                    data-testid="input-text-message"
                    aria-label="Type your message"
                  />
                  <Button
                    onClick={handleTextMessage}
                    disabled={isProcessing || recordingState === 'processing' || !textMessage.trim()}
                    size="icon"
                    className="touch-target w-12 h-12 rounded-full hover-elevate active-elevate-2"
                    data-testid="button-send-text"
                    aria-label={isProcessing ? 'Sending message...' : 'Send message'}
                    aria-busy={isProcessing}
                  >
                    {isProcessing ? (
                      <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="w-5 h-5" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Voice Interface */}
            <div className="flex flex-col items-center gap-lg">
              {/* Stop Speaking — shown when TTS audio is active */}
              {isAudioPlaying && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={stopAudio}
                  className="rounded-full h-9 px-lg text-sm text-green-600 dark:text-green-400 border-green-500/40 hover:bg-green-500/10 gap-sm"
                  aria-label="Stop speaking"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop Speaking
                </Button>
              )}

              <div aria-busy={recordingState === 'processing'} role="group" aria-label="Voice recording">
                <VoiceRecordButton
                  ref={voiceButtonRef}
                  onBeforeRecording={unlockAudioForSafari}
                  onRecordingStart={handleRecordingStart}
                  onRecordingStop={handleRecordingStop}
                  onError={handleRecordingError}
                  disabled={isValidatingConversation}
                  state={recordingState}
                  error={recordingError || undefined}
                  onRetry={() => {
                    setRecordingError(null);
                    setRecordingState('idle');
                  }}
                  holdToRecord={holdToRecord}
                />
                {/* Processing indicator - Only show in conversation mode */}
                {recordingState === 'processing' && showConversation && (
                  <div className="text-center mt-sm" role="status" aria-live="polite">
                    <div className="flex items-center justify-center gap-sm text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Processing audio...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Text Input Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTextInput(!showTextInput)}
                className="touch-target h-11 px-lg rounded-full text-sm text-muted-foreground hover-elevate transition-all duration-200"
                data-testid="button-toggle-text-input"
                aria-label={showTextInput ? 'Hide text input' : 'Show text input'}
                aria-expanded={showTextInput}
              >
                <MessageCircle className="w-4 h-4 mr-sm" aria-hidden="true" />
                {showTextInput ? 'Hide' : 'Show'} Text Input
              </Button>
            </div>
          </div>
        </div>
      </footer>

      {/* Agent Transparency Panel — rendered outside flex wrapper to avoid overflow clipping */}
      <AgentTransparencyPanel
        events={pipelineEvents}
        isVisible={showTransparency}
        onToggle={() => {
          setShowTransparency(false);
          localStorage.setItem('showTransparency', 'false');
        }}
      />
    </div>
  );
}
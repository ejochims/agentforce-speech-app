import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { safeStorage } from '@/lib/safeStorage';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings, Download, Loader2, MessageCircle, History, Plus, Send, Clock, Volume2, VolumeX, Square, ChevronDown, Pencil, Radio, Moon, Mic, KeyboardIcon, Sparkles } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MessageBubble from './MessageBubble';
import MessageSkeleton from './MessageSkeleton';
import ConversationSkeleton from './ConversationSkeleton';
import { shouldGroupMessage, toSafeISOString, toSafeDate } from '@/lib/time';
import AgentTransparencyPanel from './AgentTransparencyPanel';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useAudioRecorder, type SttTransparency } from '@/hooks/useAudioRecorder';
import { useAgentStream } from '@/hooks/useAgentStream';
import { usePipelineTransparency } from '@/hooks/usePipelineTransparency';
import { useConversation } from '@/hooks/useConversation';
import { useWakeWord } from '@/hooks/useWakeWord';
import VoiceRecordButton, { type VoiceRecordButtonHandle } from './VoiceRecordButton';
import type { Conversation, Turn } from '@shared/schema';

const agentforceLogo = '/agentforce-logo.png';

export default function VoiceChat() {
  // ─── UI-only state ────────────────────────────────────────────────────────
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showConversation, setShowConversation] = useState<boolean>(() =>
    safeStorage.getItem('showConversation') === 'true'
  );
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTransparency, setShowTransparency] = useState<boolean>(() =>
    safeStorage.getItem('showTransparency') === 'true'
  );
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [showVoiceHint] = useState(false); // retired — welcome state covers this
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(
    () => safeStorage.getItem('wakeWordEnabled') === 'true'
  );
  const [darkMode, setDarkMode] = useState<boolean>(
    () => safeStorage.getItem('darkMode') === 'true'
  );
  const [showWelcome, setShowWelcome] = useState<boolean>(
    () => !safeStorage.getItem('hasSeenWelcome')
  );

  // Ref to VoiceRecordButton so the wake word handler can start recording programmatically
  const voiceRecordRef = useRef<VoiceRecordButtonHandle>(null);

  // ─── Scroll tracking ──────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const isNearBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 120;
    isNearBottomRef.current = near;
    setShowScrollButton(!near);
  }, []);

  // ─── Domain hooks ─────────────────────────────────────────────────────────
  const tts = useTextToSpeech();
  const transparency = usePipelineTransparency();
  const { data: settings } = useQuery<{ agentforceMode: string }>({ queryKey: ['/api/settings'] });

  // Break circular dependency: useConversation.onTriggerAgent → agentStream.streamAgentResponse
  // agentStream is initialized after conversation, so we use a stable ref.
  const onTriggerAgentRef = useRef<((text: string, convId: string) => void) | null>(null);

  const conversation = useConversation({
    onTriggerAgent: useCallback((text: string, convId: string) => {
      onTriggerAgentRef.current?.(text, convId);
    }, []),
  });

  const agentStream = useAgentStream({
    audioEnabled: tts.audioEnabled,
    playTextAsAudio: tts.playTextAsAudio,
    onSaveTurn: useCallback((conversationId: string, text: string) => {
      conversation.createTurn({ conversationId, role: 'assistant', text });
    }, [conversation.createTurn]),
    onTransparencyUpdate: transparency.updateEventWithTransparency,
    currentPipelineRef: transparency.currentPipelineRef,
    onConversationExpired: conversation.recoverAndRetry,
  });

  // Wire the circular callback now that agentStream is initialized
  onTriggerAgentRef.current = agentStream.streamAgentResponse;

  const recorder = useAudioRecorder({
    onTranscription: useCallback((text: string, sttTransparency: SttTransparency | null) => {
      if (!conversation.currentConversationId) return;
      const pipelineId = `pipeline-${Date.now()}`;
      transparency.startEvent(
        pipelineId,
        text,
        sttTransparency ? {
          processingMs: sttTransparency.sttProcessingMs,
          audioSizeBytes: sttTransparency.audioSizeBytes,
          mimeType: sttTransparency.mimeType,
        } : undefined,
        tts.audioEnabled
      );
      const pendingId = `pending-${Date.now()}-${Math.random()}`;
      conversation.createTurn({
        conversationId: conversation.currentConversationId,
        role: 'user',
        text,
        triggerAgent: true,
        pendingId,
      });
    }, [conversation.currentConversationId, conversation.createTurn, transparency, tts.audioEnabled]),
  });

  // ─── Dark mode ────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // ─── Auto-scroll ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isNearBottomRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.turns.length, conversation.pendingMessages.size, agentStream.streamingText, agentStream.agentPending]);

  // ─── Keyboard navigation ──────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isHistoryOpen) {
          e.preventDefault();
          setIsHistoryOpen(false);
        } else if (recorder.isRecording) {
          e.preventDefault();
          recorder.resetError();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHistoryOpen, recorder.isRecording]);


  // ─── Event handlers ───────────────────────────────────────────────────────
  const handleTextMessage = async () => {
    if (!textMessage.trim() || !conversation.currentConversationId) return;
    setIsProcessing(true);

    const messageText = textMessage;
    const pipelineId = `pipeline-${Date.now()}`;
    transparency.startEvent(pipelineId, messageText, undefined, tts.audioEnabled);

    try {
      const pendingId = `pending-${Date.now()}-${Math.random()}`;
      conversation.createTurn({
        conversationId: conversation.currentConversationId,
        role: 'user',
        text: messageText,
        triggerAgent: true,
        pendingId,
      });
      setTextMessage('');
    } catch (error) {
      console.error('Error sending text message:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartNewChat = () => {
    conversation.startNewChat();
    transparency.clearEvents();
    setTextMessage('');
    setShowTextInput(false);
  };

  const handleExportTranscript = () => {
    const date = new Date();
    const lines: string[] = [
      'Agentforce Conversation',
      `Exported: ${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      '─'.repeat(40),
      '',
    ];
    conversation.turns.forEach((turn: Turn) => {
      const speaker = turn.role === 'user' ? 'You' : 'Agentforce';
      const time = turn.createdAt
        ? new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      lines.push(`[${speaker}${time ? ` · ${time}` : ''}]`);
      lines.push(turn.text);
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agentforce-${date.toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFirstRecordingStart = () => {
    recorder.handleRecordingStart();
  };

  const saveTitle = (id: string) => {
    const trimmed = editingTitleValue.trim();
    const original = conversation.conversations.find((c: Conversation) => c.id === id)?.title;
    if (trimmed && trimmed !== original) {
      conversation.updateConversationTitle({ id, title: trimmed });
    }
    setEditingTitleId(null);
  };

  // ─── Ambient voice mode computed values ──────────────────────────────────
  const isRecording = recorder.recordingState === 'recording';
  const isSttProcessing = recorder.recordingState === 'processing';
  const isThinking = agentStream.agentPending || agentStream.isAgentStreaming;
  const isSpeaking = tts.isAudioPlaying;

  // Pipeline is considered busy whenever the app is actively recording,
  // transcribing, waiting for the agent, or playing back audio.
  // Wake word detection is paused during these states.
  const isPipelineBusy = isRecording || isSttProcessing || isThinking || isSpeaking;

  const { isSupported: wakeWordSupported, isListening: wakeWordListening } = useWakeWord({
    enabled: wakeWordEnabled,
    isPipelineBusy,
    onDetected: useCallback(async () => {
      if (!voiceRecordRef.current) return;
      // VoiceRecordButton.startRecording() calls onBeforeRecording (stops TTS +
      // unlocks Safari audio) and then onRecordingStart — same path as a button tap.
      // silenceTimeoutMs enables VAD auto-stop so the user doesn't need to
      // manually tap the button after speaking their wake-word utterance.
      voiceRecordRef.current.startRecording({ silenceTimeoutMs: 1800 });
    }, []),
  });


  const glowHalo = isRecording    ? 'rgba(59,130,246,0.40)'
    : isSttProcessing ? 'rgba(245,158,11,0.35)'
    : isThinking      ? 'rgba(168,85,247,0.40)'
    : isSpeaking      ? 'rgba(34,197,94,0.35)'
    :                   'rgba(59,130,246,0.18)';

  const glowHaloOuter = isRecording    ? 'rgba(59,130,246,0.15)'
    : isSttProcessing ? 'rgba(245,158,11,0.12)'
    : isThinking      ? 'rgba(168,85,247,0.15)'
    : isSpeaking      ? 'rgba(34,197,94,0.12)'
    :                   'rgba(59,130,246,0.06)';

  const micDropShadow = isRecording
    ? 'drop-shadow(0 0 14px rgba(59,130,246,0.55))'
    : isSttProcessing
    ? 'drop-shadow(0 0 14px rgba(245,158,11,0.50))'
    : isThinking
    ? 'drop-shadow(0 0 14px rgba(168,85,247,0.55))'
    : isSpeaking
    ? 'drop-shadow(0 0 14px rgba(34,197,94,0.50))'
    : 'drop-shadow(0 0 10px rgba(59,130,246,0.22))';

  // ─── Render ───────────────────────────────────────────────────────────────

  // Subtle full-screen ambient tint for voice mode — eliminates the hard line
  // where the orb's local halos fade out before reaching the footer.
  const shellTint = !showConversation
    ? isRecording    ? 'rgba(59,130,246,0.06)'
      : isSttProcessing ? 'rgba(245,158,11,0.05)'
      : isThinking      ? 'rgba(168,85,247,0.06)'
      : isSpeaking      ? 'rgba(34,197,94,0.05)'
      :                   'transparent'
    : undefined;

  return (
    <div
      className="app-shell"
      style={shellTint !== undefined ? { backgroundColor: shellTint, transition: 'background-color 700ms ease' } : undefined}
    >
      {/* Mobile App Header */}
      <header className="app-header" role="banner">
        <div className="flex items-center justify-between px-lg py-sm">
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
            {/* Session status badge — only shown when connected to live Agentforce */}
            {settings && settings.agentforceMode !== 'stub' && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${
                conversation.turns.length > 0 || agentStream.isAgentStreaming
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-blue-50 border-blue-200 text-blue-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  conversation.turns.length > 0 || agentStream.isAgentStreaming
                    ? 'bg-emerald-500'
                    : 'bg-blue-400'
                }`} />
                {conversation.turns.length > 0 || agentStream.isAgentStreaming
                  ? 'Live'
                  : 'Connected'}
              </span>
            )}

            {/* Wake word active indicator — inside the left group so layout stays 2-column */}
            {wakeWordListening && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-violet-50 border-violet-200 text-violet-700 select-none flex-shrink-0">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                <span className="hidden sm:inline">Hey Agentforce</span>
              </span>
            )}
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-sm">
            {/* Conversation / Voice-only mode toggle */}
            <Button
              size="icon"
              variant="ghost"
              className={`rounded-full ${showConversation ? 'text-primary bg-primary/10' : ''}`}
              onClick={() => {
                const next = !showConversation;
                setShowConversation(next);
                safeStorage.setItem('showConversation', String(next));
              }}
              title={showConversation ? 'Switch to voice-only mode' : 'Show conversation'}
              aria-label={showConversation ? 'Switch to voice-only mode' : 'Show conversation'}
              data-testid="button-toggle-conversation-mode"
            >
              {showConversation ? <MessageCircle className="w-4 h-4" /> : <Radio className="w-4 h-4" />}
            </Button>

            <Drawer open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
              <DrawerTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full"
                  data-testid="button-history"
                  aria-label="View conversation history"
                >
                  <History className="w-4 h-4" />
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
                  {conversation.conversationsLoading ? (
                    <div className="space-y-md" aria-busy="true" aria-label="Loading conversations">
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                      <ConversationSkeleton />
                    </div>
                  ) : conversation.conversations.length === 0 ? (
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
                      {conversation.conversations.map((conv: Conversation) => {
                        const isCurrentConversation = conv.id === conversation.currentConversationId;
                        const lastActivity = new Date(conv.createdAt);

                        return (
                          <Card
                            key={conv.id}
                            className={`group hover-elevate cursor-pointer transition-all duration-200 ${
                              isCurrentConversation ? 'ring-2 ring-primary/20 border-primary/30' : ''
                            }`}
                            onClick={() => {
                              if (editingTitleId === conv.id) return;
                              if (!isCurrentConversation) {
                                conversation.setCurrentConversationId(conv.id);
                                safeStorage.setItem('currentConversationId', conv.id);
                                conversation.queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
                                transparency.clearEvents();
                              }
                              setIsHistoryOpen(false);
                            }}
                            data-testid={`card-conversation-${conv.id}`}
                          >
                            <CardContent className="p-lg">
                              <div className="flex items-start justify-between gap-md">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-sm mb-sm">
                                    {editingTitleId === conv.id ? (
                                      <input
                                        value={editingTitleValue}
                                        onChange={(e) => setEditingTitleValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') saveTitle(conv.id);
                                          if (e.key === 'Escape') setEditingTitleId(null);
                                          e.stopPropagation();
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={() => saveTitle(conv.id)}
                                        autoFocus
                                        className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b border-primary outline-none py-0.5 text-foreground w-full"
                                        aria-label="Edit conversation title"
                                      />
                                    ) : (
                                      <>
                                        <h4 className="font-medium text-foreground truncate flex-1 min-w-0">
                                          {conv.title}
                                        </h4>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingTitleId(conv.id);
                                            setEditingTitleValue(conv.title);
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
                                      <span>{conv.status}</span>
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

            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              onClick={handleStartNewChat}
              data-testid="button-new-chat"
              title="New conversation"
              aria-label="Start new conversation"
            >
              <Plus className="w-4 h-4" />
            </Button>

            <Sheet open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
              <SheetTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="rounded-full"
                  data-testid="button-settings"
                >
                  <Settings className="w-4 h-4" />
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
                    <Label htmlFor="voice-responses" className="flex flex-col space-y-1">
                      <span className="text-sm font-medium">Voice Responses</span>
                      <span className="text-xs text-muted-foreground">
                        Speak agent replies aloud
                      </span>
                    </Label>
                    <Switch
                      id="voice-responses"
                      checked={tts.audioEnabled}
                      onCheckedChange={(checked) => {
                        checked ? tts.initializeAudio() : tts.disableAudio();
                      }}
                      data-testid="toggle-voice-responses"
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-4">
                    <Label htmlFor="dark-mode" className="flex flex-col space-y-1">
                      <span className="text-sm font-medium">Dark Mode</span>
                      <span className="text-xs text-muted-foreground">
                        Switch to a darker colour scheme
                      </span>
                    </Label>
                    <Switch
                      id="dark-mode"
                      checked={darkMode}
                      onCheckedChange={(checked) => {
                        setDarkMode(checked);
                        safeStorage.setItem('darkMode', String(checked));
                      }}
                      data-testid="toggle-dark-mode"
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-4">
                    <Label
                      htmlFor="wake-word"
                      className={`flex flex-col space-y-1 ${!wakeWordSupported ? 'opacity-50' : ''}`}
                    >
                      <span className="text-sm font-medium">Wake Word</span>
                      <span className="text-xs text-muted-foreground">
                        {wakeWordSupported
                          ? "Say \"Hey Agentforce\" to start recording"
                          : 'Not supported in this browser'}
                      </span>
                    </Label>
                    <Switch
                      id="wake-word"
                      checked={wakeWordEnabled}
                      disabled={!wakeWordSupported}
                      onCheckedChange={(checked) => {
                        setWakeWordEnabled(checked);
                        safeStorage.setItem('wakeWordEnabled', String(checked));
                      }}
                      data-testid="toggle-wake-word"
                    />
                  </div>

                  <div className="flex items-center justify-between space-x-4">
                    <Label htmlFor="show-transparency" className="flex flex-col space-y-1">
                      <span className="text-sm font-medium">Agent Transparency</span>
                      <span className="text-xs text-muted-foreground">
                        Show pipeline timing and debug info
                      </span>
                    </Label>
                    <Switch
                      id="show-transparency"
                      checked={showTransparency}
                      onCheckedChange={(checked) => {
                        setShowTransparency(checked);
                        safeStorage.setItem('showTransparency', String(checked));
                      }}
                      data-testid="button-transparency"
                    />
                  </div>

                  {conversation.turns.length > 0 && (
                    <div className="pt-2 border-t">
                      <Button
                        variant="outline"
                        className="w-full rounded-full"
                        onClick={() => { handleExportTranscript(); setIsSettingsOpen(false); }}
                        data-testid="button-export-transcript"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download Transcript
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main Content + Transparency Panel Row */}
      <div className={`flex flex-1 ${showConversation ? 'overflow-hidden' : 'overflow-visible'}`}>

      {/* Main Content Area */}
      <main
        ref={(el) => { scrollContainerRef.current = el; }}
        onScroll={handleScroll}
        className={`app-content relative flex-1 transition-all duration-700 ${showTransparency ? 'md:pr-80' : ''}`}
        style={!showConversation ? { overflow: 'visible' } : undefined}
        role="main"
        aria-label="Chat conversation"
      >
        <AnimatePresence mode="wait">
        {showConversation ? (
          // Conversation Mode
          <motion.div
            key="conversation"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="px-lg py-lg space-y-lg h-full"
          >
          {/* Screen reader live region for chat updates */}
          <div className="sr-only" aria-live="polite" id="chat-announcements"></div>

          {/* Audio Enable Prompt */}
          {tts.showAudioPrompt && !conversation.isValidatingConversation && (
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
                      onClick={tts.initializeAudio}
                      className="rounded-full"
                      data-testid="button-enable-audio"
                    >
                      <Volume2 className="w-4 h-4 mr-2" />
                      Enable Voice Responses
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        tts.setShowAudioPrompt(false);
                        safeStorage.setItem('audioEnabled', 'false');
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
          {tts.pendingAudioText && !tts.showAudioPrompt && (
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
                        onClick={() => { if (tts.pendingAudioText) tts.initializeAudio(); }}
                        className="rounded-full bg-orange-600 hover:bg-orange-700 text-white"
                        data-testid="button-play-pending-audio"
                      >
                        <Volume2 className="w-4 h-4 mr-1" />
                        Play
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => tts.setPendingAudioText(null)}
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
          {conversation.turns.length === 0 && !conversation.turnsLoading && !conversation.isValidatingConversation && (
            <div className="flex flex-col items-center justify-center h-full text-center px-xl select-none">
              <div className="mb-2xl">
                {/* Orb with blur halo — matches voice mode visual language */}
                <div className="relative w-fit mx-auto mb-xl">
                  <div className="absolute -inset-8 rounded-full blur-2xl bg-blue-400/15" />
                  <div className="relative w-32 h-32 rounded-full bg-blue-50 border border-blue-100/80 flex items-center justify-center shadow-sm">
                    <img
                      src={agentforceLogo}
                      alt="Agentforce"
                      className="w-20 h-20 object-contain"
                      data-testid="img-agentforce-logo"
                    />
                  </div>
                </div>
                <h2 className="text-xl font-semibold text-foreground mb-sm" data-testid="text-main-title">
                  Talk to Agentforce
                </h2>
                <p className="text-sm text-muted-foreground" data-testid="text-instructions">
                  Tap the mic to begin
                </p>
              </div>
            </div>
          )}

          {/* Connection State with Skeleton Messages */}
          {conversation.isValidatingConversation && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-center py-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
                <span className="ml-md text-base text-muted-foreground">Connecting...</span>
              </div>
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
          {conversation.turnsLoading && !conversation.isValidatingConversation ? (
            <div className="pb-lg" aria-busy="true" aria-label="Loading messages">
              <MessageSkeleton isUser={false} isFirstInGroup={true} isLastInGroup={true} />
              <MessageSkeleton isUser={true} isFirstInGroup={true} isLastInGroup={false} />
              <MessageSkeleton isUser={true} isFirstInGroup={false} isLastInGroup={true} />
              <MessageSkeleton isUser={false} isFirstInGroup={true} isLastInGroup={false} />
              <MessageSkeleton isUser={false} isFirstInGroup={false} isLastInGroup={true} />
              <MessageSkeleton isUser={true} isFirstInGroup={true} isLastInGroup={true} />
            </div>
          ) : conversation.turns.length > 0 && (
            <div className="pb-lg" aria-busy={agentStream.agentPending || agentStream.isAgentStreaming} aria-live="polite">
              {/* Saved messages */}
              {conversation.turns.map((turn: Turn, index: number) => {
                const previousTurn = index > 0 ? conversation.turns[index - 1] : null;
                const nextTurn = index < conversation.turns.length - 1 ? conversation.turns[index + 1] : null;

                const isGroupedWithPrevious = shouldGroupMessage(
                  { role: turn.role, createdAt: toSafeISOString(turn.createdAt) },
                  previousTurn ? { role: previousTurn.role, createdAt: toSafeISOString(previousTurn.createdAt) } : null
                );
                const isGroupedWithNext = nextTurn ? shouldGroupMessage(
                  { role: nextTurn.role, createdAt: toSafeISOString(nextTurn.createdAt) },
                  { role: turn.role, createdAt: toSafeISOString(turn.createdAt) }
                ) : false;

                const isLastAgentTurn =
                  turn.role === 'assistant' &&
                  index === conversation.turns.length - 1 &&
                  !agentStream.isAgentStreaming;

                return (
                  <MessageBubble
                    key={turn.id}
                    message={turn.text}
                    isUser={turn.role === 'user'}
                    timestamp={toSafeDate(turn.createdAt)}
                    isFirstInGroup={!isGroupedWithPrevious}
                    isLastInGroup={!isGroupedWithNext}
                    showAvatar={true}
                    showTimestamp={true}
                    messageState="sent"
                    isPlaying={tts.isAudioPlaying && isLastAgentTurn}
                  />
                );
              })}

              {/* Pending messages */}
              {[...conversation.pendingMessages.entries()].map(([pendingId, pendingMessage]) => {
                const lastTurn = conversation.turns[conversation.turns.length - 1];
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
                    onRetry={pendingMessage.state === 'error' ? () => conversation.retryMessage(pendingId) : undefined}
                  />
                );
              })}

              {/* Agent streaming text or typing indicator */}
              {agentStream.isAgentStreaming && agentStream.streamingText ? (
                <div aria-busy="true" aria-live="polite" role="status" aria-label="Agent is responding">
                  <MessageBubble
                    message={agentStream.streamingText + '▌'}
                    isUser={false}
                    isTyping={false}
                    isFirstInGroup={true}
                    isLastInGroup={true}
                    showAvatar={true}
                    showTimestamp={false}
                    messageState="sent"
                    isPlaying={tts.isAudioPlaying}
                  />
                </div>
              ) : (agentStream.agentPending || agentStream.isAgentStreaming) && (
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
          </motion.div>
        ) : (
          // Voice-Only Mode — Ambient Canvas
          <motion.div
            key="voice"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center justify-center h-full gap-10 select-none pt-16"
            data-testid="voice-center"
          >

            {/* ── Ambient Orb ── */}
            {/* Outer wrapper establishes position context without will-change, so halo isn't clipped by compositing layer */}
            <div className="relative">
              {/* Halo sits outside the animated div so will-change:transform doesn't clip it */}
              <div
                className="absolute -inset-16 rounded-full blur-3xl transition-all duration-700 pointer-events-none"
                style={{ background: glowHalo }}
              />
              <div
                className="absolute -inset-28 rounded-full blur-3xl transition-all duration-700 pointer-events-none"
                style={{ background: glowHaloOuter }}
              />

              <div className={`relative animate-orb-glow transition-transform duration-500 ${
                isRecording || isThinking || isSpeaking ? 'scale-110' :
                isSttProcessing ? 'scale-105' : 'scale-100'
              }`}>
              {/* Orb — tinted interior */}
              <div
                className="relative w-48 h-48 rounded-full flex items-center justify-center transition-all duration-700"
              >
                {/* State-tinted inner background */}
                <div className={`absolute inset-0 rounded-full transition-all duration-700 ${
                  isRecording    ? 'bg-blue-100/70' :
                  isSttProcessing ? 'bg-amber-100/60' :
                  isThinking     ? 'bg-purple-100/65' :
                  isSpeaking     ? 'bg-emerald-100/60' :
                                   'bg-blue-50/50'
                }`} />
                {/* Pulsing colored border — stays on the orb, no overflow */}
                <div className={`absolute inset-0 rounded-full border-2 transition-all duration-700 ${
                  isRecording    ? 'border-blue-400/70 animate-pulse' :
                  isSttProcessing ? 'border-amber-400/60 animate-pulse' :
                  isThinking     ? 'border-purple-400/65 animate-pulse' :
                  isSpeaking     ? 'border-emerald-400/60 animate-pulse' :
                                   'border-gray-200/60'
                }`} />
                <img
                  src={agentforceLogo}
                  alt="Agentforce"
                  className="relative w-28 h-28 object-contain z-10"
                  data-testid="voice-mode-logo"
                />
              </div>
              </div>
            </div>

            {/* ── Status text ── */}
            <div className="text-center space-y-2">
              <p className={`text-2xl font-light tracking-wide transition-colors duration-500 ${
                isRecording    ? 'text-blue-600' :
                isSttProcessing ? 'text-amber-600' :
                isThinking     ? 'text-purple-600' :
                isSpeaking     ? 'text-emerald-600' :
                                 'text-gray-400'
              }`}>
                {isRecording    ? 'Listening...' :
                 isSttProcessing ? 'Processing...' :
                 isThinking     ? (agentStream.streamingText ? 'Responding...' : 'Thinking...') :
                 isSpeaking     ? 'Speaking...' :
                                  'Ready'}
              </p>
              {!isRecording && !isSttProcessing && !isThinking && !isSpeaking && (
                <p className="text-sm text-gray-300">
                  {wakeWordListening ? 'Say "Hey Agentforce" or tap the mic' : 'Tap the mic to start'}
                </p>
              )}
              {conversation.turns.length > 0 && !isRecording && !isSttProcessing && !isThinking && !isSpeaking && (
                <button
                  onClick={handleStartNewChat}
                  className="text-xs text-gray-300 hover:text-gray-500 transition-colors duration-200 mt-2"
                  aria-label="Start a new conversation"
                >
                  + New conversation
                </button>
              )}
            </div>

          </motion.div>
        )}
        </AnimatePresence>

        {/* Jump to latest */}
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
      <footer className={`app-footer transition-all duration-200 ${showTransparency ? 'md:pr-80' : ''} ${!showConversation ? '!border-t-0 !bg-transparent !backdrop-blur-none' : ''} ${showConversation && conversation.turns.length === 0 ? '!border-t-0' : ''}`}>
        <div className="px-lg pt-md pb-lg keyboard-aware">

          {/* Text Input — slides in above the mic row, never shifts mic position */}
          <AnimatePresence>
            {showTextInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="flex gap-md items-end pb-md px-px">
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
                    disabled={isProcessing || recorder.recordingState === 'processing'}
                    className="flex-1 h-12 rounded-full px-lg text-base touch-target"
                    data-testid="input-text-message"
                    aria-label="Type your message"
                    autoFocus
                  />
                  <Button
                    onClick={handleTextMessage}
                    disabled={isProcessing || recorder.recordingState === 'processing' || !textMessage.trim()}
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
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mic row — 3-column grid so mic stays centered regardless of flanking controls */}
          <div className="grid grid-cols-3 items-center">

            {/* Left: Stop Speaking */}
            <div className="flex items-center justify-start">
              <AnimatePresence>
                {tts.isAudioPlaying && (
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.18 }}
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={tts.stopAudio}
                      className="rounded-full h-9 px-md text-sm text-green-600 dark:text-green-400 border-green-500/40 hover:bg-green-500/10 gap-sm"
                      aria-label="Stop speaking"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      Stop
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Center: Mic button */}
            <div className="flex flex-col items-center gap-sm">
              <div
                style={!showConversation ? { filter: micDropShadow, transition: 'filter 0.7s ease' } : undefined}
                aria-busy={recorder.recordingState === 'processing'} role="group" aria-label="Voice recording"
              >
                <VoiceRecordButton
                  ref={voiceRecordRef}
                  onBeforeRecording={async () => { tts.stopAudio(); await tts.unlockAudioForSafari(); }}
                  onRecordingStart={handleFirstRecordingStart}
                  onRecordingStop={recorder.handleRecordingStop}
                  onError={recorder.handleRecordingError}
                  disabled={conversation.isValidatingConversation}
                  state={recorder.recordingState}
                  error={recorder.recordingError || undefined}
                  onRetry={recorder.resetError}
                  showStatusText={showConversation}
                />
                {/* Processing indicator — conversation mode only */}
                {recorder.recordingState === 'processing' && showConversation && (
                  <div className="text-center mt-sm" role="status" aria-live="polite">
                    <div className="flex items-center justify-center gap-sm text-sm text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Processing...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Type instead toggle */}
            <div className="flex items-center justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTextInput(!showTextInput)}
                className={`touch-target h-9 w-9 rounded-full transition-all duration-200 ${
                  showTextInput
                    ? 'text-primary bg-primary/10'
                    : !showConversation
                    ? 'text-gray-400 hover:text-gray-600'
                    : 'text-muted-foreground'
                }`}
                data-testid="button-toggle-text-input"
                aria-label={showTextInput ? 'Hide text input' : 'Show text input'}
                aria-expanded={showTextInput}
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>

          </div>
        </div>
      </footer>

      {/* Welcome Dialog — shown once to new users */}
      <Dialog open={showWelcome} onOpenChange={(open) => {
        if (!open) {
          setShowWelcome(false);
          safeStorage.setItem('hasSeenWelcome', 'true');
        }
      }}>
        <DialogContent className="sm:max-w-sm rounded-2xl" data-testid="dialog-welcome">
          <DialogHeader className="text-center items-center pb-2">
            <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100/80 flex items-center justify-center mb-3 mx-auto">
              <img src={agentforceLogo} alt="Agentforce" className="w-10 h-10 object-contain" />
            </div>
            <DialogTitle className="text-xl">Welcome to Agentforce</DialogTitle>
            <DialogDescription className="text-sm text-center">
              Your AI-powered voice assistant. Here's how to get started.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Mic className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Tap to talk</p>
                <p className="text-xs text-muted-foreground">Press the mic button and speak your question</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <KeyboardIcon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Or type instead</p>
                <p className="text-xs text-muted-foreground">Tap the pencil icon to switch to text input</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Volume2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Voice responses</p>
                <p className="text-xs text-muted-foreground">Enable voice in Settings to hear replies spoken aloud</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Hands-free mode</p>
                <p className="text-xs text-muted-foreground">Say "Hey Agentforce" to start recording — enable in Settings</p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              className="w-full rounded-full"
              onClick={() => {
                setShowWelcome(false);
                safeStorage.setItem('hasSeenWelcome', 'true');
              }}
              data-testid="button-welcome-get-started"
            >
              Get Started
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agent Transparency Panel */}
      <AgentTransparencyPanel
        events={transparency.pipelineEvents}
        isVisible={showTransparency}
        onToggle={() => {
          setShowTransparency(false);
          safeStorage.setItem('showTransparency', 'false');
        }}
      />
    </div>
  );
}

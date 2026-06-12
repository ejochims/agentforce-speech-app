import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { safeStorage } from '@/lib/safeStorage';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, MessageCircle, Plus, Send, Volume2, VolumeX, Square, ChevronDown, Pencil, Radio } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MessageBubble from './MessageBubble';
import MessageSkeleton from './MessageSkeleton';
import { shouldGroupMessage, toSafeISOString, toSafeDate } from '@/lib/time';
import AgentTransparencyPanel from './AgentTransparencyPanel';
import AmbientOrb, { type OrbState } from './AmbientOrb';
import AmbientGradient from './AmbientGradient';
import ConversationHistoryDrawer from './ConversationHistoryDrawer';
import SettingsSheet from './SettingsSheet';
import WelcomeDialog from './WelcomeDialog';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useAudioRecorder, type SttTransparency } from '@/hooks/useAudioRecorder';
import { useAgentStream } from '@/hooks/useAgentStream';
import { usePipelineTransparency } from '@/hooks/usePipelineTransparency';
import { useConversation } from '@/hooks/useConversation';
import { useWakeWord } from '@/hooks/useWakeWord';
import { useMicLevel } from '@/hooks/useMicLevel';
import VoiceRecordButton, { type VoiceRecordButtonHandle } from './VoiceRecordButton';
import type { Turn } from '@shared/schema';

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
  const [wakeWordEnabled, setWakeWordEnabled] = useState<boolean>(
    () => safeStorage.getItem('wakeWordEnabled') === 'true'
  );
  const [autoListen, setAutoListen] = useState<boolean>(
    () => safeStorage.getItem('autoListen') === 'true'
  );
  const [darkMode, setDarkMode] = useState<boolean>(
    () => safeStorage.getItem('darkMode') === 'true'
  );
  const [showWelcome, setShowWelcome] = useState<boolean>(
    () => !safeStorage.getItem('hasSeenWelcome')
  );

  // Ref to VoiceRecordButton so the wake word handler can start recording programmatically
  const voiceRecordRef = useRef<VoiceRecordButtonHandle>(null);

  // Live mic stream (while recording) → RMS level ref that drives the orb's amplitude
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const micLevelRef = useMicLevel(micStream);

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
  const sendTextMessage = (messageText: string) => {
    if (!messageText.trim() || !conversation.currentConversationId) return false;
    // Unlock AudioContext during this user gesture so TTS works when the
    // agent responds (iOS Safari suspends AudioContext outside gestures).
    tts.stopAudio();
    tts.unlockAudioForSafari();

    const pipelineId = `pipeline-${Date.now()}`;
    transparency.startEvent(pipelineId, messageText, undefined, tts.audioEnabled);

    const pendingId = `pending-${Date.now()}-${Math.random()}`;
    conversation.createTurn({
      conversationId: conversation.currentConversationId,
      role: 'user',
      text: messageText,
      triggerAgent: true,
      pendingId,
    });
    return true;
  };

  const handleTextMessage = async () => {
    setIsProcessing(true);
    try {
      if (sendTextMessage(textMessage)) {
        setTextMessage('');
      }
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

  const handleSelectConversation = (id: string) => {
    conversation.setCurrentConversationId(id);
    safeStorage.setItem('currentConversationId', id);
    conversation.queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    transparency.clearEvents();
  };

  // ─── Ambient voice mode computed values ──────────────────────────────────
  const isRecording = recorder.recordingState === 'recording';
  const isSttProcessing = recorder.recordingState === 'processing';
  const hasPendingAgentTrigger = [...conversation.pendingMessages.values()].some(m => m.state === 'sending');
  const isThinking = agentStream.agentPending || agentStream.isAgentStreaming || hasPendingAgentTrigger;
  const isSpeaking = tts.isAudioPlaying || tts.isTtsFetching;

  // Latch thinking state so the orb never flickers to idle between thinking→speaking.
  // Holds until speaking begins, or clears after a short timeout if speaking never starts.
  const [thinkingLatch, setThinkingLatch] = useState(false);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (isThinking) {
      clearTimeout(thinkingTimerRef.current);
      setThinkingLatch(true);
      return;
    }
    if (!isSpeaking) {
      // isThinking just dropped and speaking hasn't started — hold briefly
      thinkingTimerRef.current = setTimeout(() => setThinkingLatch(false), 600);
      return () => clearTimeout(thinkingTimerRef.current);
    }
    // Speaking is already running — release latch immediately
    clearTimeout(thinkingTimerRef.current);
    setThinkingLatch(false);
  }, [isThinking, isSpeaking]);

  const effectivelyThinking = isThinking || thinkingLatch;

  // Auto-listen: when speaking ends, automatically open the mic for the next turn.
  // Only fires when the user has opted in and nothing else is running.
  const prevIsSpeakingRef = useRef(false);
  useEffect(() => {
    const wasSpeaking = prevIsSpeakingRef.current;
    prevIsSpeakingRef.current = isSpeaking;
    if (wasSpeaking && !isSpeaking && autoListen && !isRecording && !isSttProcessing && !isThinking) {
      const t = setTimeout(() => {
        voiceRecordRef.current?.startRecording({ silenceTimeoutMs: 1800 });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isSpeaking, autoListen, isRecording, isSttProcessing, isThinking]);

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


  const orbState: OrbState = isRecording         ? 'recording'
    : isSttProcessing    ? 'processing'
    : effectivelyThinking ? 'thinking'
    : isSpeaking          ? 'speaking'
    :                       'idle';

  // RGB triple used for the ambient radial gradient overlay (CSS can't transition
  // gradient keywords, so we cross-fade per-state divs using opacity transitions)
  const micDropShadow = isRecording
    ? 'drop-shadow(0 0 14px rgba(59,130,246,0.55))'
    : isSttProcessing
    ? 'drop-shadow(0 0 14px rgba(245,158,11,0.50))'
    : effectivelyThinking
    ? 'drop-shadow(0 0 14px rgba(168,85,247,0.55))'
    : isSpeaking
    ? 'drop-shadow(0 0 14px rgba(34,197,94,0.50))'
    : 'drop-shadow(0 0 10px rgba(59,130,246,0.22))';

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="app-shell relative">
      <AmbientGradient orbState={orbState} showConversation={showConversation} />

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
            <h1 className="text-xl font-semibold tracking-tight text-foreground truncate" data-testid="text-agentforce-title">
              Agentforce
            </h1>
            {/* Session status badge — only shown when connected to live Agentforce */}
            {settings && settings.agentforceMode !== 'stub' && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${
                conversation.turns.length > 0 || agentStream.isAgentStreaming
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300'
                  : 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-950/60 dark:border-blue-800 dark:text-blue-300'
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
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border bg-violet-50 border-violet-200 text-violet-700 dark:bg-violet-950/60 dark:border-violet-800 dark:text-violet-300 select-none flex-shrink-0">
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

            <ConversationHistoryDrawer
              open={isHistoryOpen}
              onOpenChange={setIsHistoryOpen}
              conversations={conversation.conversations}
              conversationsLoading={conversation.conversationsLoading}
              currentConversationId={conversation.currentConversationId}
              onSelectConversation={handleSelectConversation}
              onUpdateTitle={(id, title) => conversation.updateConversationTitle({ id, title })}
            />

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

            <SettingsSheet
              open={isSettingsOpen}
              onOpenChange={setIsSettingsOpen}
              audioEnabled={tts.audioEnabled}
              onAudioEnabledChange={(checked) => {
                checked ? tts.initializeAudio() : tts.disableAudio();
              }}
              darkMode={darkMode}
              onDarkModeChange={(checked) => {
                setDarkMode(checked);
                safeStorage.setItem('darkMode', String(checked));
              }}
              wakeWordEnabled={wakeWordEnabled}
              wakeWordSupported={wakeWordSupported}
              onWakeWordEnabledChange={(checked) => {
                setWakeWordEnabled(checked);
                safeStorage.setItem('wakeWordEnabled', String(checked));
              }}
              autoListen={autoListen}
              onAutoListenChange={(checked) => {
                setAutoListen(checked);
                safeStorage.setItem('autoListen', String(checked));
              }}
              showTransparency={showTransparency}
              onShowTransparencyChange={(checked) => {
                setShowTransparency(checked);
                safeStorage.setItem('showTransparency', String(checked));
              }}
              hasTurns={conversation.turns.length > 0}
              onExportTranscript={handleExportTranscript}
            />
          </div>
        </div>
      </header>

      {/* Main Content + Transparency Panel Row */}
      <div className={`flex flex-1 ${showConversation ? 'overflow-hidden' : 'overflow-visible'}`}>

      {/* Main Content Area */}
      <main
        ref={(el) => { scrollContainerRef.current = el; }}
        onScroll={handleScroll}
        className={`app-content relative flex-1 transition-[padding] duration-300 ease-out ${showTransparency ? 'md:pr-80' : ''}`}
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
                        onClick={async () => {
                          const text = tts.pendingAudioText;
                          if (!text) return;
                          // Unlock AudioContext + blessed element during this gesture
                          // so audio.play() succeeds when doPlay runs asynchronously.
                          await tts.unlockAudioForSafari();
                          // Clear optimistically; playTextAsAudio will restore it if playback fails.
                          tts.setPendingAudioText(null);
                          tts.playTextAsAudio(text);
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
                <div className="flex justify-center mb-xl" data-testid="img-agentforce-logo">
                  <AmbientOrb state={orbState} logoSrc={agentforceLogo} size={128} levelRef={micLevelRef} />
                </div>
                <h2 className="text-xl font-semibold tracking-tight text-foreground mb-sm" data-testid="text-main-title">
                  Talk to Agentforce
                </h2>
                <p className="text-sm text-muted-foreground" data-testid="text-instructions">
                  Tap the mic to begin, or try one of these
                </p>
                <div className="flex flex-wrap justify-center gap-sm mt-lg">
                  {[
                    'What can you help me with?',
                    'Tell me about yourself',
                    'How does this work?',
                  ].map((suggestion, i) => (
                    <motion.button
                      key={suggestion}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      onClick={() => sendTextMessage(suggestion)}
                      className="px-lg py-sm rounded-full border border-border bg-card/70 backdrop-blur-sm text-sm text-muted-foreground shadow-xs hover:text-foreground hover:border-primary/30 hover:shadow-sm transition-all duration-200"
                      data-testid={`button-suggestion-${i}`}
                    >
                      {suggestion}
                    </motion.button>
                  ))}
                </div>
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
                    message={agentStream.streamingText}
                    isUser={false}
                    isTyping={false}
                    isFirstInGroup={true}
                    isLastInGroup={true}
                    showAvatar={true}
                    showTimestamp={false}
                    messageState="sent"
                    isPlaying={tts.isAudioPlaying}
                    showCaret={true}
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
            <AmbientOrb state={orbState} logoSrc={agentforceLogo} size={192} levelRef={micLevelRef} />

            {/* ── Status text ── */}
            <div className="text-center space-y-2">
              <p className={`text-2xl font-light tracking-wide transition-colors duration-500 ${
                isRecording         ? 'text-blue-600 dark:text-blue-400' :
                isSttProcessing     ? 'text-amber-600 dark:text-amber-400' :
                effectivelyThinking ? 'text-purple-600 dark:text-purple-400' :
                isSpeaking          ? 'text-emerald-600 dark:text-emerald-400' :
                                      'text-muted-foreground/70'
              }`}>
                {isRecording         ? 'Listening...' :
                 isSttProcessing     ? 'Processing...' :
                 effectivelyThinking ? (agentStream.streamingText ? 'Responding...' : 'Thinking...') :
                 isSpeaking          ? 'Speaking...' :
                                       'Ready'}
              </p>
              {!isRecording && !isSttProcessing && !effectivelyThinking && !isSpeaking && (
                <p className="text-sm text-muted-foreground/50">
                  {wakeWordListening ? 'Say "Hey Agentforce" or tap the mic' : 'Tap the mic to start'}
                </p>
              )}
              {conversation.turns.length > 0 && !isRecording && !isSttProcessing && !effectivelyThinking && !isSpeaking && (
                <button
                  onClick={handleStartNewChat}
                  className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors duration-200 mt-2"
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
                  onStreamChange={setMicStream}
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
                    ? 'text-muted-foreground/60 hover:text-muted-foreground'
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
      <WelcomeDialog
        open={showWelcome}
        onClose={() => {
          setShowWelcome(false);
          safeStorage.setItem('hasSeenWelcome', 'true');
        }}
        logoSrc={agentforceLogo}
      />

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

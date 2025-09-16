import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Phone, Settings, Download, Loader2, MessageCircle, History, Plus, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import VoiceRecordButton from './VoiceRecordButton';
import AudioVisualizer from './AudioVisualizer';
import MessageBubble from './MessageBubble';
import { shouldGroupMessage, toSafeISOString, toSafeDate } from '@/lib/time';
import agentforceLogo from '@assets/agentforce logo_1758045885910.png';
import type { Conversation, Turn } from '@shared/schema';

type RecordingState = 'idle' | 'recording' | 'processing' | 'error';

export default function VoiceChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [currentView, setCurrentView] = useState<'chat' | 'history'>('chat');
  const [isValidatingConversation, setIsValidatingConversation] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Map<string, { text: string; timestamp: Date; state: 'sending' | 'error' }>>(new Map());
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

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
          getAgentResponse({
            text: variables.retryAgentRequest!.text,
            conversationId: conversation.id,
          });
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
          state: 'sending' 
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
        getAgentResponse({
          text: variables.text,
          conversationId: variables.conversationId,
        });
      }
    },
    onError: (error, variables) => {
      // Update pending message to error state
      if (variables.pendingId) {
        setPendingMessages(prev => new Map(prev.set(variables.pendingId!, { 
          text: variables.text, 
          timestamp: new Date(), 
          state: 'error' 
        })));
      }
      console.error('Error creating turn:', error);
    },
  });

  // Agentforce mutation with error handling
  const { mutate: getAgentResponse, isPending: agentPending } = useMutation({
    mutationFn: ({ text, conversationId }: { text: string; conversationId: string }) =>
      apiRequest('/api/agentforce', { method: 'POST', body: { text, conversationId } }),
    onSuccess: (response: { text: string; conversationId: string }) => {
      if (currentConversationId) {
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
      console.error('Agentforce error:', error);
      
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

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, agentPending]);

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
      console.error('Error sending text message:', error);
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
      formData.append('audio', audioBlob, `recording.${fileExtension}`);

      const sttResponse = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!sttResponse.ok) {
        const errorText = await sttResponse.text();
        throw new Error(`STT failed: ${sttResponse.status} ${errorText}`);
      }

      const { text } = await sttResponse.json();
      console.log('Transcribed text:', text);

      if (text.trim()) {
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
      console.error('Error processing voice:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to process recording';
      setRecordingError(`Processing failed: ${errorMessage}`);
      setRecordingState('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const playTextAsAudio = async (text: string) => {
    try {
      // Use a unique URL with query params to enable audio streaming
      const audioUrl = `/api/tts?text=${encodeURIComponent(text)}&voice=shimmer&_t=${Date.now()}`;
      
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = audioUrl;
      
      // Start playing as soon as enough data is available
      audio.addEventListener('canplay', () => {
        audio.play().catch(console.error);
      });
      
      // Handle any playback errors
      audio.addEventListener('error', (e) => {
        console.error('Audio playback error:', e);
      });
      
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  return (
    <div className="app-shell">
      {/* Mobile App Header */}
      <header className="app-header">
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
            <Button
              size="icon"
              variant="ghost"
              className="touch-target w-11 h-11 rounded-full"
              data-testid="button-settings"
            >
              <Settings className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="app-content relative">
        <div className="px-lg py-lg space-y-lg h-full">
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
                  Start a conversation by tapping the microphone button below. Speak naturally and I'll help you with whatever you need.
                </p>
              </div>
            </div>
          )}

          {/* Connection State */}
          {isValidatingConversation && (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="flex items-center gap-md mb-md">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="text-base text-muted-foreground">Connecting...</span>
              </div>
              <p className="text-sm text-muted-foreground/80">Establishing secure connection</p>
            </div>
          )}

          {/* Messages */}
          {turns.length > 0 && (
            <div className="pb-lg">
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
                  />
                );
              })}
              
              {/* Agent typing indicator */}
              {agentPending && (
                <MessageBubble
                  message=""
                  isUser={false}
                  isTyping={true}
                  isFirstInGroup={true}
                  isLastInGroup={true}
                  showAvatar={true}
                  showTimestamp={false}
                />
              )}
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Voice Composer */}
      {currentView === 'chat' && (
        <footer className="app-footer">
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
                      aria-label="Send message"
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Voice Interface */}
              <div className="flex flex-col items-center gap-lg">
                <VoiceRecordButton
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
                />
                
                {/* Text Input Toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTextInput(!showTextInput)}
                  className="touch-target h-11 px-lg rounded-full text-sm text-muted-foreground hover-elevate transition-all duration-200"
                  data-testid="button-toggle-text-input"
                  aria-label={showTextInput ? 'Hide text input' : 'Show text input'}
                >
                  <MessageCircle className="w-4 h-4 mr-sm" />
                  {showTextInput ? 'Hide' : 'Show'} Text Input
                </Button>
              </div>
            </div>
          </div>
        </footer>
      )}
      
      {/* History View */}
      {currentView === 'history' && (
        <footer className="app-footer">
          <div className="px-lg py-lg">
            <div className="text-center max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-full bg-muted/20 flex items-center justify-center mx-auto mb-lg">
                <History className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold mb-md" data-testid="text-history-title">Conversation History</h3>
              <p className="text-base text-muted-foreground mb-lg leading-relaxed" data-testid="text-history-description">
                Your current conversation is displayed above. 
                {turns.length > 0 ? `You have ${turns.length} messages in this conversation.` : 'No messages yet.'}
              </p>
              <Button
                variant="outline"
                onClick={() => setCurrentView('chat')}
                className="touch-target h-12 px-xl rounded-full font-medium"
                data-testid="button-back-to-chat"
              >
                Back to Chat
              </Button>
            </div>
          </div>
        </footer>
      )}

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-[var(--z-sticky)] glass-blur-strong border-t border-border" 
           style={{ paddingBottom: 'var(--safe-area-inset-bottom)' }}>
        <div className="flex justify-center py-sm">
          <Button 
            variant="ghost" 
            className="touch-target flex flex-col items-center gap-xs py-md px-xl rounded-xl hover-elevate"
            data-testid="button-tab-history"
            onClick={() => {
              console.log('History tab clicked');
              setCurrentView(currentView === 'history' ? 'chat' : 'history');
            }}
          >
            <History className={`w-5 h-5 ${currentView === 'history' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-xs font-medium ${currentView === 'history' ? 'text-primary' : 'text-muted-foreground'}`}>History</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
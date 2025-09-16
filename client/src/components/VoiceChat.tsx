import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Phone, Settings, Download, Loader2, MessageCircle, History, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import VoiceRecordButton from './VoiceRecordButton';
import AudioVisualizer from './AudioVisualizer';
import MessageBubble from './MessageBubble';
import agentforceLogo from '@assets/agentforce logo_1758045885910.png';
import type { Conversation, Turn } from '@shared/schema';

export default function VoiceChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textMessage, setTextMessage] = useState('');
  const [currentView, setCurrentView] = useState<'chat' | 'history'>('chat');
  const [isValidatingConversation, setIsValidatingConversation] = useState(false);
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

  // Create turn mutation
  const { mutate: createTurn } = useMutation({
    mutationFn: (turnData: { conversationId: string; role: string; text: string; triggerAgent?: boolean }) =>
      apiRequest(`/api/conversations/${turnData.conversationId}/turns`, {
        method: 'POST',
        body: { role: turnData.role, text: turnData.text },
      }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId, 'turns'] });
      
      // If this was a user turn that should trigger agent response, do it now
      if (variables.triggerAgent && variables.role === 'user') {
        getAgentResponse({
          text: variables.text,
          conversationId: variables.conversationId,
        });
      }
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
    console.log('Voice recording started');
  };

  const handleTextMessage = async () => {
    if (!textMessage.trim() || !currentConversationId) return;
    
    console.log('Sending text message:', textMessage);
    setIsProcessing(true);
    
    try {
      // Create user turn and trigger agent response after it's saved
      createTurn({
        conversationId: currentConversationId,
        role: 'user',
        text: textMessage,
        triggerAgent: true, // This will trigger agent response after turn is saved
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
    
    if (!audioBlob || !currentConversationId) return;
    
    // Check if audio blob has data
    if (audioBlob.size === 0 || audioBlob.size < 100) {
      console.error('Audio recording is empty or too small:', audioBlob.size, 'bytes');
      alert('Recording too short or empty. Please hold the button longer and speak clearly.');
      return;
    }

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

      if (!sttResponse.ok) throw new Error('STT failed');

      const { text } = await sttResponse.json();
      console.log('Transcribed text:', text);

      if (text.trim()) {
        // Create user turn and trigger agent response after it's saved
        createTurn({
          conversationId: currentConversationId,
          role: 'user',
          text: text,
          triggerAgent: true, // This will trigger agent response after turn is saved
        });
      }
    } catch (error) {
      console.error('Error processing voice:', error);
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
    <div className="min-h-screen bg-background">
      {/* iOS-style Status Bar Area */}
      <div className="h-12"></div>
      
      {/* Header */}
      <div className="text-center py-6 relative">
        <div className="flex items-center justify-center gap-3 mb-2">
          <img 
            src={agentforceLogo} 
            alt="Agentforce" 
            className="w-10 h-10 object-contain"
            data-testid="img-header-logo"
          />
          <h1 className="text-2xl font-semibold text-primary" data-testid="text-agentforce-title">
            Agentforce
          </h1>
        </div>
        
        {/* New Chat Button - Show only when there's an active conversation */}
        {turns.length > 0 && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute top-4 right-4 w-9 h-9"
            onClick={startNewChat}
            data-testid="button-new-chat"
          >
            <Plus className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {turns.length === 0 && !turnsLoading && !isValidatingConversation && (
          <div className="text-center py-8">
            <img 
              src={agentforceLogo} 
              alt="Agentforce" 
              className="w-16 h-16 object-contain mx-auto mb-4"
              data-testid="img-agentforce-logo"
            />
            <h2 className="text-xl font-semibold text-foreground mb-2" data-testid="text-main-title">
              Talk to AgentForce
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-instructions">
              Hold the button below to start your conversation
            </p>
          </div>
        )}

        {isValidatingConversation && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Connecting...</span>
          </div>
        )}

        {turns.map((turn) => (
          <MessageBubble
            key={turn.id}
            message={turn.text}
            isUser={turn.role === 'user'}
            timestamp={new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          />
        ))}
        
        {agentPending && (
          <MessageBubble
            message=""
            isUser={false}
            isTyping={true}
          />
        )}

        {isProcessing && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
            <span className="text-sm text-muted-foreground">Processing your voice...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Voice Interface */}
      {currentView === 'chat' && (
        <div className="px-6 pt-6 pb-16 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <VoiceRecordButton
              onRecordingStart={handleRecordingStart}
              onRecordingStop={handleRecordingStop}
              disabled={isProcessing || isValidatingConversation}
            />
            
            {/* Text Input Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTextInput(!showTextInput)}
              className="text-xs text-muted-foreground"
              data-testid="button-toggle-text-input"
            >
              <MessageCircle className="w-4 h-4 mr-1" />
              {showTextInput ? 'Hide' : 'Show'} Text Input
            </Button>
            
            {/* Text Input Field */}
            {showTextInput && (
              <div className="w-full max-w-sm flex gap-2">
                <Input
                  value={textMessage}
                  onChange={(e) => setTextMessage(e.target.value)}
                  placeholder="Type your message..."
                  onKeyPress={(e) => e.key === 'Enter' && handleTextMessage()}
                  disabled={isProcessing}
                  data-testid="input-text-message"
                />
                <Button
                  onClick={handleTextMessage}
                  disabled={isProcessing || !textMessage.trim()}
                  data-testid="button-send-text"
                >
                  Send
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* History View */}
      {currentView === 'history' && (
        <div className="p-6 border-t border-border bg-background/95 backdrop-blur-sm">
          <div className="text-center">
            <History className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2" data-testid="text-history-title">Conversation History</h3>
            <p className="text-sm text-muted-foreground mb-4" data-testid="text-history-description">
              Your current conversation is displayed above. 
              {turns.length > 0 ? `You have ${turns.length} messages in this conversation.` : 'No messages yet.'}
            </p>
            <Button
              variant="outline"
              onClick={() => setCurrentView('chat')}
              data-testid="button-back-to-chat"
            >
              Back to Chat
            </Button>
          </div>
        </div>
      )}

      {/* Bottom Action Buttons */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="flex items-center gap-4">
          <Button
            size="icon"
            variant="destructive"
            className="w-12 h-12 rounded-full"
            data-testid="button-end-call"
            onClick={() => console.log('End call clicked')}
          >
            <Phone className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            variant="secondary"
            className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white"
            data-testid="button-mute"
            onClick={() => console.log('Mute clicked')}
          >
            <Mic className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            className="w-12 h-12 rounded-full"
            data-testid="button-more"
            onClick={() => console.log('More options clicked')}
          >
            <Download className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
        <div className="flex justify-around py-2 max-w-md mx-auto">
          <Button 
            variant="ghost" 
            className="flex flex-col items-center gap-1 py-3 px-4"
            data-testid="button-tab-history"
            onClick={() => {
              console.log('History tab clicked');
              setCurrentView(currentView === 'history' ? 'chat' : 'history');
            }}
          >
            <History className={`w-5 h-5 ${currentView === 'history' ? 'text-foreground' : 'text-muted-foreground'}`} />
            <span className={`text-xs ${currentView === 'history' ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>History</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
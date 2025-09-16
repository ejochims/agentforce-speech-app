import { useState, useEffect, useRef } from 'react';
import { Mic, Phone, Settings, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Create a new conversation on component mount (only if none exists)
  useEffect(() => {
    const existingConversationId = localStorage.getItem('currentConversationId');
    if (existingConversationId) {
      setCurrentConversationId(existingConversationId);
    } else {
      createConversation({ title: 'Voice Chat', status: 'active' });
    }
  }, []);

  // Get current conversation turns
  const { data: turns = [], isLoading: turnsLoading } = useQuery<Turn[]>({
    queryKey: ['/api/conversations', currentConversationId, 'turns'],
    enabled: !!currentConversationId,
  });

  // Create conversation mutation
  const { mutate: createConversation } = useMutation({
    mutationFn: (conversationData: { title: string; status: string }) =>
      apiRequest('/api/conversations', { method: 'POST', body: conversationData }),
    onSuccess: (conversation: Conversation) => {
      setCurrentConversationId(conversation.id);
      localStorage.setItem('currentConversationId', conversation.id);
    },
  });

  // Create turn mutation
  const { mutate: createTurn } = useMutation({
    mutationFn: (turnData: { conversationId: string; role: string; text: string }) =>
      apiRequest(`/api/conversations/${turnData.conversationId}/turns`, {
        method: 'POST',
        body: { role: turnData.role, text: turnData.text },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', currentConversationId, 'turns'] });
    },
  });

  // Agentforce mutation
  const { mutate: getAgentResponse, isPending: agentPending } = useMutation({
    mutationFn: ({ text, conversationId }: { text: string; conversationId: string }) =>
      apiRequest('/api/agentforce', { method: 'POST', body: { text, conversationId } }),
    onSuccess: (response: { text: string; conversationId: string }) => {
      if (currentConversationId) {
        createTurn({
          conversationId: currentConversationId,
          role: 'assistant',
          text: response.text,
        });
        
        // Play the response as speech
        playTextAsAudio(response.text);
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

  const handleRecordingStop = async (audioBlob?: Blob) => {
    setIsRecording(false);
    console.log('Voice recording stopped', audioBlob);
    
    if (!audioBlob || !currentConversationId) return;

    setIsProcessing(true);
    try {
      // Convert audio to text using STT API
      const formData = new FormData();
      const fileExtension = audioBlob.type.includes('webm') ? 'webm' : 'wav';
      formData.append('audio', audioBlob, `recording.${fileExtension}`);

      const sttResponse = await fetch('/api/stt', {
        method: 'POST',
        body: formData,
      });

      if (!sttResponse.ok) throw new Error('STT failed');

      const { text } = await sttResponse.json();
      console.log('Transcribed text:', text);

      if (text.trim()) {
        // Create user turn
        createTurn({
          conversationId: currentConversationId,
          role: 'user',
          text: text,
        });

        // Get agent response
        getAgentResponse({
          text,
          conversationId: currentConversationId,
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
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'alloy' }),
      });

      if (!response.ok) throw new Error('TTS failed');

      const audioBuffer = await response.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      
      const audio = new Audio(audioUrl);
      audio.play().catch(console.error);
      
      // Clean up URL after playback
      audio.onended = () => URL.revokeObjectURL(audioUrl);
    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* iOS-style Status Bar Area */}
      <div className="h-12"></div>
      
      {/* Header */}
      <div className="text-center py-6">
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
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {turns.length === 0 && !turnsLoading && (
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
      <div className="p-6 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <AudioVisualizer isActive={isRecording} />
          
          <VoiceRecordButton
            onRecordingStart={handleRecordingStart}
            onRecordingStop={handleRecordingStop}
            disabled={isProcessing}
          />
        </div>
      </div>

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
            data-testid="button-tab-download"
          >
            <Download className="w-5 h-5 text-primary" />
            <span className="text-xs text-muted-foreground">Download</span>
          </Button>
          
          <Button 
            variant="ghost" 
            className="flex flex-col items-center gap-1 py-3 px-4"
            data-testid="button-tab-history"
          >
            <div className="w-5 h-5 border-b-2 border-foreground"></div>
            <span className="text-xs text-foreground font-medium">History</span>
          </Button>
          
          <Button 
            variant="ghost" 
            className="flex flex-col items-center gap-1 py-3 px-4"
            data-testid="button-tab-settings"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Settings</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
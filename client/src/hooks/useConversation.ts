import { useState, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { Conversation, Turn } from '@shared/schema';

interface UseConversationConfig {
  onTriggerAgent: (text: string, conversationId: string) => void;
}

interface PendingMessage {
  text: string;
  timestamp: Date;
  state: 'sending' | 'error';
  conversationId: string;
  triggerAgent: boolean;
}

export function useConversation({ onTriggerAgent }: UseConversationConfig) {
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isValidatingConversation, setIsValidatingConversation] = useState(false);
  const [pendingMessages, setPendingMessages] = useState<Map<string, PendingMessage>>(new Map());

  const queryClient = useQueryClient();

  const { data: turns = [], isLoading: turnsLoading } = useQuery<Turn[]>({
    queryKey: ['/api/conversations', currentConversationId, 'turns'],
    enabled: !!currentConversationId && !isValidatingConversation,
  });

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/conversations'],
    enabled: true,
  });

  const { mutate: createConversation } = useMutation({
    mutationFn: (data: { title: string; status: string; retryAgentRequest?: { text: string } }) =>
      apiRequest('/api/conversations', { method: 'POST', body: { title: data.title, status: data.status } }),
    onSuccess: (conversation: Conversation, variables) => {
      console.log('✓ New conversation created:', conversation.id);
      setCurrentConversationId(conversation.id);
      localStorage.setItem('currentConversationId', conversation.id);
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });

      if (variables.retryAgentRequest) {
        console.log('🔄 Retrying agent request with new conversation');
        setTimeout(() => onTriggerAgent(variables.retryAgentRequest!.text, conversation.id), 100);
      }
    },
  });

  const { mutate: createTurn } = useMutation({
    mutationFn: (turnData: {
      conversationId: string;
      role: string;
      text: string;
      triggerAgent?: boolean;
      pendingId?: string;
    }) => {
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
    onSuccess: (_, variables) => {
      if (variables.pendingId) {
        setPendingMessages(prev => {
          const m = new Map(prev);
          m.delete(variables.pendingId!);
          return m;
        });
      }
      queryClient.invalidateQueries({
        queryKey: ['/api/conversations', currentConversationId, 'turns'],
      });
      // Auto-title the conversation using the first user message
      if (variables.role === 'user' && turns.length === 0 && currentConversationId) {
        const raw = variables.text.trim();
        const autoTitle = raw.length > 45 ? raw.slice(0, 45) + '…' : raw;
        updateConversationTitle({ id: currentConversationId, title: autoTitle });
      }
      if (variables.triggerAgent && variables.role === 'user') {
        onTriggerAgent(variables.text, variables.conversationId);
      }
    },
    onError: (error, variables) => {
      if (variables.pendingId) {
        setPendingMessages(prev => new Map(prev.set(variables.pendingId!, {
          text: variables.text,
          timestamp: new Date(),
          state: 'error',
          conversationId: variables.conversationId,
          triggerAgent: variables.triggerAgent ?? true,
        })));
      }
      console.error('Error creating turn:', error);
    },
  });

  const { mutate: updateConversationTitle } = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiRequest(`/api/conversations/${id}`, { method: 'PATCH', body: { title } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/conversations'] }),
  });

  const validateAndSetConversation = useCallback(async (conversationId: string) => {
    setIsValidatingConversation(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`);
      if (response.ok) {
        console.log('✓ Valid conversation found:', conversationId);
        setCurrentConversationId(conversationId);
        return true;
      }
      throw new Error(`Conversation not found: ${response.status}`);
    } catch (error) {
      console.log('✗ Conversation validation failed:', error);
      localStorage.removeItem('currentConversationId');
      setCurrentConversationId(null);
      return false;
    } finally {
      setIsValidatingConversation(false);
    }
  }, []);

  // Initialize conversation on mount
  useEffect(() => {
    const initializeConversation = async () => {
      const existingId = localStorage.getItem('currentConversationId');
      if (existingId) {
        console.log('🔍 Validating existing conversation:', existingId);
        const isValid = await validateAndSetConversation(existingId);
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
  }, [validateAndSetConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  const startNewChat = () => {
    setCurrentConversationId(null);
    localStorage.removeItem('currentConversationId');
    queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
    createConversation({ title: 'Voice Chat', status: 'active' });
  };

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

  // Called when agent returns a 404 (conversation expired) — creates new conversation and retries
  const recoverAndRetry = (text: string) => {
    console.log('🔄 Conversation not found, recovering by creating new conversation');
    localStorage.removeItem('currentConversationId');
    setCurrentConversationId(null);
    createConversation({ title: 'Voice Chat', status: 'active', retryAgentRequest: { text } });
  };

  return {
    currentConversationId,
    setCurrentConversationId,
    isValidatingConversation,
    pendingMessages,
    turns,
    turnsLoading,
    conversations,
    conversationsLoading,
    createTurn,
    updateConversationTitle,
    startNewChat,
    retryMessage,
    recoverAndRetry,
    queryClient,
  };
}

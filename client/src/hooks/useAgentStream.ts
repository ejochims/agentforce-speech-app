import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { TransparencyData } from '@/components/AgentTransparencyPanel';

interface PipelineRef {
  id: string;
  startTime: number;
  userMessage: string;
}

interface UseAgentStreamConfig {
  audioEnabled: boolean;
  playTextAsAudio: (text: string) => Promise<boolean>;
  onSaveTurn: (conversationId: string, text: string) => void;
  onTransparencyUpdate: (pipelineId: string, transparency: TransparencyData, totalClientMs: number, ttsRequested: boolean) => void;
  currentPipelineRef: React.MutableRefObject<PipelineRef | null>;
  onConversationExpired: (text: string) => void;
}

export function useAgentStream({
  audioEnabled,
  playTextAsAudio,
  onSaveTurn,
  onTransparencyUpdate,
  currentPipelineRef,
  onConversationExpired,
}: UseAgentStreamConfig) {
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [isAgentStreaming, setIsAgentStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Blocking fallback endpoint — used when SSE is unavailable or returns an error event
  const { mutate: getAgentResponse, isPending: agentPending } = useMutation({
    mutationFn: ({ text, conversationId }: { text: string; conversationId: string }) =>
      apiRequest('/api/agentforce', { method: 'POST', body: { text, conversationId } }),
    onSuccess: (response: { text: string; conversationId: string; transparency?: TransparencyData }) => {
      if (response.transparency && currentPipelineRef.current) {
        const pipeline = currentPipelineRef.current;
        onTransparencyUpdate(pipeline.id, response.transparency, Date.now() - pipeline.startTime, audioEnabled);
      }
      playTextAsAudio(response.text);
      onSaveTurn(response.conversationId, response.text);
    },
    onError: (error: any, variables) => {
      const details = { message: error?.message, name: error?.name, status: error?.status };
      console.error('Agentforce error:', details);

      if (
        error.message?.includes('Conversation not found') ||
        error.status === 404 ||
        (typeof error === 'string' && error.includes('404'))
      ) {
        console.log('🔄 Conversation not found, recovering by creating new conversation');
        onConversationExpired(variables.text);
      }
    },
  });

  const streamAgentResponse = async (userText: string, convId: string) => {
    // Abort any in-flight stream before starting a new one
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsAgentStreaming(true);
    setStreamingText(null);

    try {
      const response = await fetch('/api/agentforce/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText, conversationId: convId }),
        signal: controller.signal,
      });

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
      // Tracks how many characters of accumulatedText were already sent to early TTS
      // (including any trailing whitespace after the sentence-ending punctuation).
      let earlyTtsLength = 0;
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
          try { data = JSON.parse(dataMatch[1]); } catch { continue; }

          if (eventType === 'chunk') {
            accumulatedText += data.text;
            setStreamingText(accumulatedText);

            // Start TTS on the first complete sentence to overlap agent generation with
            // speech playback. earlyTtsLength records the position so the 'done' handler
            // can speak only the remaining text, avoiding any duplicate audio.
            if (!ttsStarted && audioEnabled && /[.!?]\s/.test(accumulatedText)) {
              const firstSentenceMatch = accumulatedText.match(/^.*?[.!?](?:\s|$)/);
              if (firstSentenceMatch) {
                ttsStarted = true;
                earlyTtsLength = firstSentenceMatch[0].length;
                console.log('🎵 Early TTS: starting on first sentence');
                playTextAsAudio(firstSentenceMatch[0].trim());
              }
            }
          } else if (eventType === 'done') {
            doneReceived = true;
            setStreamingText(null);
            setIsAgentStreaming(false);

            if (data.transparency && currentPipelineRef.current) {
              const pipeline = currentPipelineRef.current;
              onTransparencyUpdate(pipeline.id, data.transparency, Date.now() - pipeline.startTime, audioEnabled);
            }

            if (audioEnabled) {
              if (ttsStarted && earlyTtsLength > 0) {
                // Only speak the portion of the response that wasn't covered by early TTS.
                const remainder = data.text.slice(earlyTtsLength).trim();
                if (remainder) {
                  console.log('🎵 TTS: playing remainder after early TTS');
                  playTextAsAudio(remainder);
                }
              } else {
                playTextAsAudio(data.text);
              }
            }
            onSaveTurn(convId, data.text);
          } else if (eventType === 'error') {
            console.error('❌ Streaming agent error:', data.error);
            setStreamingText(null);
            setIsAgentStreaming(false);
            // Fall back to blocking request on stream error
            getAgentResponse({ text: userText, conversationId: convId });
          }
        }
      }

      // Safety: if stream ended without a 'done' event and we have accumulated text, save it
      if (accumulatedText && !doneReceived) {
        setStreamingText(null);
        setIsAgentStreaming(false);
        onSaveTurn(convId, accumulatedText);
        if (audioEnabled) {
          if (ttsStarted && earlyTtsLength > 0) {
            const remainder = accumulatedText.slice(earlyTtsLength).trim();
            if (remainder) playTextAsAudio(remainder);
          } else if (!ttsStarted) {
            playTextAsAudio(accumulatedText);
          }
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        // Intentionally cancelled — clean up state silently
        setStreamingText(null);
        setIsAgentStreaming(false);
        return;
      }
      console.error('❌ Stream fetch error, falling back to blocking request:', error);
      setStreamingText(null);
      setIsAgentStreaming(false);
      getAgentResponse({ text: userText, conversationId: convId });
    }
  };

  return {
    streamingText,
    isAgentStreaming,
    agentPending,
    streamAgentResponse,
  };
}

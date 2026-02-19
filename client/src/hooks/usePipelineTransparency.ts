import { useState, useRef } from 'react';
import type { PipelineEvent, TransparencyData } from '@/components/AgentTransparencyPanel';

export function usePipelineTransparency() {
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);
  const currentPipelineRef = useRef<{ id: string; startTime: number; userMessage: string } | null>(null);

  const startEvent = (
    id: string,
    userMessage: string,
    stt?: PipelineEvent['stt'],
    ttsRequested = false
  ) => {
    currentPipelineRef.current = { id, startTime: Date.now(), userMessage };
    setPipelineEvents(prev => [...prev, {
      id,
      userMessage,
      timestamp: new Date().toISOString(),
      stt,
      ttsRequested,
    }]);
  };

  const updateEventWithTransparency = (
    pipelineId: string,
    transparency: TransparencyData,
    totalClientMs: number,
    ttsRequested: boolean
  ) => {
    setPipelineEvents(prev => prev.map(e =>
      e.id === pipelineId
        ? { ...e, agent: transparency, totalClientMs, ttsRequested }
        : e
    ));
    currentPipelineRef.current = null;
  };

  const clearEvents = () => {
    setPipelineEvents([]);
    currentPipelineRef.current = null;
  };

  return {
    pipelineEvents,
    currentPipelineRef,
    startEvent,
    updateEventWithTransparency,
    clearEvents,
  };
}

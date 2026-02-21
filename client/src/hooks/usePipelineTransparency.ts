import { useState, useRef } from 'react';
import type { PipelineEvent, TransparencyData } from '@/components/AgentTransparencyPanel';

const MAX_PIPELINE_EVENTS = 50;

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
    setPipelineEvents(prev => {
      const next = [...prev, { id, userMessage, timestamp: new Date().toISOString(), stt, ttsRequested }];
      // Trim oldest events to prevent unbounded memory growth in long sessions
      return next.length > MAX_PIPELINE_EVENTS ? next.slice(next.length - MAX_PIPELINE_EVENTS) : next;
    });
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

import { useState } from 'react';
import { ChevronDown, ChevronRight, Zap, Brain, Volume2, Mic, Clock, Radio, Hash, Eye, EyeOff, Server, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

// Types for transparency data from the backend
export interface TransparencyData {
  pipeline: {
    totalMs: number;
    agentProcessingMs: number;
    sessionCreationMs?: number;
  };
  session: {
    sessionId: string;
    isNewSession: boolean;
  };
  response: {
    messageCount: number;
    messageTypes: string[];
    status?: string;
  };
  rawApiResponse: Record<string, any>;
  timestamp: string;
}

// Full pipeline event tracked on the frontend
export interface PipelineEvent {
  id: string;
  userMessage: string;
  timestamp: string;
  stt?: {
    processingMs: number;
    audioSizeBytes?: number;
    mimeType?: string;
  };
  agent?: TransparencyData;
  ttsRequested: boolean;
  totalClientMs?: number;
}

interface AgentTransparencyPanelProps {
  events: PipelineEvent[];
  isVisible: boolean;
  onToggle: () => void;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function PipelineStage({
  icon: Icon,
  label,
  timeMs,
  color,
  isActive
}: {
  icon: any;
  label: string;
  timeMs?: number;
  color: string;
  isActive?: boolean;
}) {
  return (
    <div className="flex items-center gap-sm">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color} ${isActive ? 'animate-pulse' : ''}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{label}</p>
        {timeMs !== undefined && (
          <p className="text-xs text-muted-foreground">{formatMs(timeMs)}</p>
        )}
      </div>
    </div>
  );
}

function PipelineArrow() {
  return (
    <div className="flex justify-center py-0.5">
      <ArrowRight className="w-3 h-3 text-muted-foreground/50 rotate-90" />
    </div>
  );
}

function EventCard({ event }: { event: PipelineEvent }) {
  const [isRawOpen, setIsRawOpen] = useState(false);
  const agentData = event.agent;

  return (
    <div className="border border-border rounded-lg p-md space-y-md bg-card">
      {/* Header */}
      <div className="flex items-start justify-between gap-sm">
        <p className="text-xs text-foreground font-medium leading-snug line-clamp-2 flex-1">
          "{event.userMessage}"
        </p>
        {event.totalClientMs && (
          <Badge variant="outline" className="text-[10px] shrink-0 px-1.5 py-0">
            {formatMs(event.totalClientMs)} total
          </Badge>
        )}
      </div>

      {/* Pipeline Visualization */}
      <div className="space-y-xs">
        {event.stt && (
          <>
            <PipelineStage
              icon={Mic}
              label="Speech-to-Text"
              timeMs={event.stt.processingMs}
              color="bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
            />
            {event.stt.audioSizeBytes && (
              <p className="text-[10px] text-muted-foreground pl-10">
                {(event.stt.audioSizeBytes / 1024).toFixed(1)}KB audio
              </p>
            )}
            <PipelineArrow />
          </>
        )}

        {agentData && (
          <>
            <PipelineStage
              icon={Brain}
              label="Agentforce Processing"
              timeMs={agentData.pipeline.agentProcessingMs}
              color="bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-400"
            />

            {/* Session info */}
            <div className="pl-10 space-y-0.5">
              {agentData.pipeline.sessionCreationMs !== undefined && (
                <p className="text-[10px] text-muted-foreground">
                  Session creation: {formatMs(agentData.pipeline.sessionCreationMs)}
                </p>
              )}
              <div className="flex items-center gap-xs flex-wrap">
                {agentData.session.isNewSession && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    New Session
                  </Badge>
                )}
                {agentData.response.status && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {agentData.response.status}
                  </Badge>
                )}
                {agentData.response.messageCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {agentData.response.messageCount} msg{agentData.response.messageCount > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              {agentData.response.messageTypes.length > 0 && (
                <div className="flex items-center gap-xs flex-wrap">
                  {agentData.response.messageTypes.map((type, i) => (
                    <span key={i} className="text-[10px] text-muted-foreground bg-muted px-1 py-0 rounded">
                      {type}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {event.ttsRequested && (
              <>
                <PipelineArrow />
                <PipelineStage
                  icon={Volume2}
                  label="Text-to-Speech"
                  color="bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400"
                />
              </>
            )}
          </>
        )}
      </div>

      {/* Session ID */}
      {agentData && (
        <div className="flex items-center gap-xs text-[10px] text-muted-foreground">
          <Hash className="w-3 h-3" />
          <span className="font-mono truncate">{agentData.session.sessionId}</span>
        </div>
      )}

      {/* Raw API Response - Collapsible */}
      {agentData?.rawApiResponse && (
        <Collapsible open={isRawOpen} onOpenChange={setIsRawOpen}>
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-xs text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full">
              {isRawOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <Server className="w-3 h-3" />
              <span>Raw API Response</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <pre className="mt-sm p-sm bg-muted rounded text-[10px] font-mono text-muted-foreground overflow-x-auto max-h-48 overflow-y-auto leading-relaxed">
              {JSON.stringify(agentData.rawApiResponse, null, 2)}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Timestamp */}
      <div className="flex items-center gap-xs text-[10px] text-muted-foreground">
        <Clock className="w-3 h-3" />
        <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

export default function AgentTransparencyPanel({ events, isVisible, onToggle }: AgentTransparencyPanelProps) {
  if (!isVisible) return null;

  return (
    <div className="fixed left-0 right-0 bottom-0 max-h-[75vh] border-t rounded-t-2xl md:left-auto md:top-14 md:bottom-0 md:max-h-none md:w-80 md:border-t-0 md:border-l md:rounded-none border-border bg-background/95 backdrop-blur-sm flex flex-col overflow-hidden z-[var(--z-overlay)]">
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-2 pb-1 shrink-0 md:hidden">
        <div className="w-8 h-1 rounded-full bg-muted-foreground/30" />
      </div>

      {/* Panel Header */}
      <div className="px-md py-md border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-sm">
          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Agent Transparency</h3>
            <p className="text-[10px] text-muted-foreground">Under the hood</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-8 h-8 rounded-full"
          onClick={onToggle}
        >
          <EyeOff className="w-4 h-4" />
        </Button>
      </div>

      {/* Events List */}
      <div className="flex-1 overflow-y-auto p-md space-y-md">
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-lg">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-md">
              <Radio className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground mb-xs">No activity yet</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Start a conversation and watch the Agentforce pipeline process your messages in real time.
            </p>
          </div>
        ) : (
          [...events].reverse().map((event) => (
            <EventCard key={event.id} event={event} />
          ))
        )}
      </div>

      {/* Panel Footer Stats */}
      {events.length > 0 && (
        <div className="px-md py-sm border-t border-border shrink-0">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{events.length} interaction{events.length > 1 ? 's' : ''}</span>
            <span>
              Avg: {formatMs(
                events.reduce((sum, e) => sum + (e.agent?.pipeline.agentProcessingMs || 0), 0) /
                events.filter(e => e.agent).length || 0
              )} agent time
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

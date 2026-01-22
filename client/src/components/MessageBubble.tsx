import { Bot, User, CheckCheck, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatRelativeTime } from '@/lib/time';
import { useState, useEffect, useMemo } from 'react';

const agentforceLogo = '/agentforce-logo.png';

interface MessageBubbleProps {
  message: string;
  isUser: boolean;
  timestamp?: string | Date;
  isTyping?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  messageState?: 'sending' | 'sent' | 'delivered' | 'error';
  showAvatar?: boolean;
  showTimestamp?: boolean;
}

export default function MessageBubble({
  message,
  isUser,
  timestamp,
  isTyping = false,
  isFirstInGroup = true,
  isLastInGroup = true,
  messageState = 'sent',
  showAvatar = true,
  showTimestamp = true
}: MessageBubbleProps) {
  const [hasAnimated, setHasAnimated] = useState(false);

  const formattedTimestamp = timestamp
    ? typeof timestamp === 'string'
      ? timestamp
      : formatRelativeTime(timestamp)
    : undefined;

  // Detect if message contains HTML tags
  const hasHtml = useMemo(() => {
    return /<[a-z][\s\S]*>/i.test(message);
  }, [message]);

  // Trigger animation on mount for new messages
  useEffect(() => {
    if (!isTyping && !hasAnimated) {
      const timer = setTimeout(() => setHasAnimated(true), 50);
      return () => clearTimeout(timer);
    }
  }, [isTyping, hasAnimated]);

  // Compute accessibility information
  const messageRole = isUser ? undefined : 'log';
  const ariaLabel = isTyping 
    ? `${isUser ? 'You are' : 'Agentforce is'} typing` 
    : `${isUser ? 'Your message' : 'Agentforce message'}: ${message}`;
  const screenReaderText = isTyping 
    ? undefined
    : `${isUser ? 'You' : 'Agentforce'} said: ${message}${formattedTimestamp ? ` at ${formattedTimestamp}` : ''}`;

  return (
    <div 
      className={`
        flex items-end gap-sm 
        ${isUser ? 'justify-end' : 'justify-start'}
        ${isFirstInGroup ? 'mt-lg' : 'mt-xs'}
        ${isLastInGroup ? 'mb-lg' : 'mb-xs'}
        ${!isTyping && hasAnimated ? 'animate-message-appear' : ''}
        ${!isTyping && !hasAnimated ? 'opacity-0' : ''}
      `}
      role={messageRole}
      aria-label={ariaLabel}
      data-testid={`message-${isUser ? 'user' : 'agent'}`}
    >
      {/* Agent Avatar - Left side for agent messages */}
      {!isUser && showAvatar && isFirstInGroup && (
        <div className="flex-shrink-0">
          <Avatar className="w-8 h-8">
            <AvatarImage src={agentforceLogo} alt="Agentforce assistant avatar" className="object-contain p-1" />
            <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
              <Bot className="w-4 h-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      
      {/* Agent Spacer when avatar is hidden to maintain alignment */}
      {!isUser && showAvatar && !isFirstInGroup && (
        <div className="w-8 flex-shrink-0" />
      )}
      
      {/* Message Content */}
      <div className={`max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Message Bubble */}
        <div
          className={`
            relative px-lg py-md break-words shadow-sm
            ${isUser 
              ? `
                bg-primary text-primary-foreground 
                ${isFirstInGroup 
                  ? 'rounded-l-2xl rounded-tr-2xl rounded-br-md' 
                  : isLastInGroup 
                  ? 'rounded-l-2xl rounded-t-md rounded-br-2xl'
                  : 'rounded-l-2xl rounded-r-md'
                }
              ` 
              : `
                bg-card text-card-foreground border border-card-border
                ${isFirstInGroup 
                  ? 'rounded-r-2xl rounded-tl-2xl rounded-bl-md' 
                  : isLastInGroup 
                  ? 'rounded-r-2xl rounded-t-md rounded-bl-2xl'
                  : 'rounded-r-2xl rounded-l-md'
                }
              `
            }
            ${messageState === 'error' ? 'ring-2 ring-destructive/20' : ''}
          `}
          aria-live={!isUser && !isTyping ? 'polite' : undefined}
        >
          {/* Screen reader text */}
          {screenReaderText && (
            <span className="sr-only">{screenReaderText}</span>
          )}
          
          {isTyping ? (
            <div className="flex gap-1 items-center py-1" aria-hidden="true">
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
              <span className="sr-only">{isUser ? 'You are typing' : 'Agentforce is typing'}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-xs">
              {hasHtml ? (
                <div
                  className="text-base leading-relaxed message-html-content"
                  aria-describedby={formattedTimestamp ? `timestamp-${isUser ? 'user' : 'agent'}` : undefined}
                  dangerouslySetInnerHTML={{ __html: message }}
                />
              ) : (
                <p className="text-base leading-relaxed whitespace-pre-wrap" aria-describedby={formattedTimestamp ? `timestamp-${isUser ? 'user' : 'agent'}` : undefined}>
                  {message}
                </p>
              )}

              {/* Message State Indicator for User Messages */}
              {isUser && messageState && (
                <div className={`flex items-center justify-end gap-xs text-xs ${
                  messageState === 'error' 
                    ? 'text-destructive' 
                    : isUser 
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`} aria-live="polite">
                  {messageState === 'sending' && (
                    <>
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      <span>Sending...</span>
                    </>
                  )}
                  {messageState === 'sent' && (
                    <>
                      <CheckCheck className="w-3 h-3" aria-hidden="true" />
                      <span className="sr-only">Message sent successfully</span>
                    </>
                  )}
                  {messageState === 'error' && (
                    <span role="alert">Failed to send</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Timestamp - Only show for last message in group */}
        {showTimestamp && formattedTimestamp && !isTyping && isLastInGroup && (
          <div 
            className={`flex items-center gap-xs mt-xs text-xs text-muted-foreground ${
              isUser ? 'justify-end' : 'justify-start'
            }`}
            data-testid="message-timestamp"
            id={`timestamp-${isUser ? 'user' : 'agent'}`}
          >
            <span aria-label={`Message sent ${formattedTimestamp}`}>
              {formattedTimestamp}
            </span>
          </div>
        )}
      </div>
      
      {/* User Avatar - Right side for user messages */}
      {isUser && showAvatar && isFirstInGroup && (
        <div className="flex-shrink-0">
          <Avatar className="w-8 h-8">
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
              <User className="w-4 h-4" aria-hidden="true" />
            </AvatarFallback>
          </Avatar>
        </div>
      )}
      
      {/* User Spacer when avatar is hidden to maintain alignment */}
      {isUser && showAvatar && !isFirstInGroup && (
        <div className="w-8 flex-shrink-0" />
      )}
    </div>
  );
}
import { Bot, User, CheckCheck, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatRelativeTime } from '@/lib/time';
import agentforceLogo from '@assets/agentforce logo_1758045885910.png';

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
  const formattedTimestamp = timestamp 
    ? typeof timestamp === 'string' 
      ? timestamp 
      : formatRelativeTime(timestamp)
    : undefined;
  return (
    <div 
      className={`
        flex items-end gap-sm 
        ${isUser ? 'justify-end flex-row-reverse' : 'justify-start'}
        ${isFirstInGroup ? 'mt-lg' : 'mt-xs'}
        ${isLastInGroup ? 'mb-lg' : 'mb-xs'}
      `}
      data-testid={`message-${isUser ? 'user' : 'agent'}`}
    >
      {/* Avatar - Only show for first message in group */}
      {showAvatar && isFirstInGroup && (
        <div className="flex-shrink-0">
          {isUser ? (
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-medium">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className="w-8 h-8">
              <AvatarImage src={agentforceLogo} alt="Agentforce" className="object-contain p-1" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                <Bot className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}
      
      {/* Spacer when avatar is hidden to maintain alignment */}
      {showAvatar && !isFirstInGroup && (
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
        >
          {isTyping ? (
            <div className="flex gap-1 items-center py-1">
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
            </div>
          ) : (
            <div className="flex flex-col gap-xs">
              <p className="text-base leading-relaxed whitespace-pre-wrap">{message}</p>
              
              {/* Message State Indicator for User Messages */}
              {isUser && messageState && (
                <div className={`flex items-center justify-end gap-xs text-xs ${
                  messageState === 'error' 
                    ? 'text-destructive' 
                    : isUser 
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`}>
                  {messageState === 'sending' && (
                    <>
                      <Clock className="w-3 h-3" />
                      <span>Sending...</span>
                    </>
                  )}
                  {messageState === 'sent' && (
                    <CheckCheck className="w-3 h-3" />
                  )}
                  {messageState === 'error' && (
                    <span>Failed to send</span>
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
          >
            <span>{formattedTimestamp}</span>
          </div>
        )}
      </div>
    </div>
  );
}
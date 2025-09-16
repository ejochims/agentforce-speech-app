import { Bot, User } from 'lucide-react';

interface MessageBubbleProps {
  message: string;
  isUser: boolean;
  timestamp?: string;
  isTyping?: boolean;
}

export default function MessageBubble({ 
  message, 
  isUser, 
  timestamp,
  isTyping = false 
}: MessageBubbleProps) {
  return (
    <div 
      className={`flex gap-3 mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}
      data-testid={`message-${isUser ? 'user' : 'agent'}`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <Bot className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      
      <div className={`max-w-[280px] ${isUser ? 'order-first' : ''}`}>
        <div
          className={`
            px-4 py-3 rounded-2xl break-words
            ${isUser 
              ? 'bg-primary text-primary-foreground rounded-br-md' 
              : 'bg-card text-card-foreground border border-card-border rounded-bl-md'
            }
          `}
        >
          {isTyping ? (
            <div className="flex gap-1 items-center py-1">
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed">{message}</p>
          )}
        </div>
        
        {timestamp && !isTyping && (
          <p 
            className={`text-xs text-muted-foreground mt-1 ${isUser ? 'text-right' : 'text-left'}`}
            data-testid="message-timestamp"
          >
            {timestamp}
          </p>
        )}
      </div>
      
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-secondary-foreground" />
        </div>
      )}
    </div>
  );
}
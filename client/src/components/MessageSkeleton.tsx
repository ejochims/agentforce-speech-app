import { Skeleton } from '@/components/ui/skeleton';

interface MessageSkeletonProps {
  isUser?: boolean;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  showAvatar?: boolean;
}

export default function MessageSkeleton({ 
  isUser = false, 
  isFirstInGroup = true,
  isLastInGroup = true,
  showAvatar = true
}: MessageSkeletonProps) {
  return (
    <div 
      className={`
        flex items-end gap-sm 
        ${isUser ? 'justify-end flex-row-reverse' : 'justify-start'}
        ${isFirstInGroup ? 'mt-lg' : 'mt-xs'}
        ${isLastInGroup ? 'mb-lg' : 'mb-xs'}
      `}
      role="status"
      aria-label={`${isUser ? 'Your' : 'Assistant'} message loading`}
    >
      {/* Avatar Skeleton - Only show for first message in group */}
      {showAvatar && isFirstInGroup && (
        <div className="flex-shrink-0">
          <Skeleton className="w-8 h-8 rounded-full" />
        </div>
      )}
      
      {/* Spacer when avatar is hidden to maintain alignment */}
      {showAvatar && !isFirstInGroup && (
        <div className="w-8 flex-shrink-0" />
      )}
      
      {/* Message Content Skeleton */}
      <div className={`max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Message Bubble Skeleton */}
        <div
          className={`
            relative px-lg py-md shadow-sm
            ${isUser 
              ? `
                ${isFirstInGroup 
                  ? 'rounded-l-2xl rounded-tr-2xl rounded-br-md' 
                  : isLastInGroup 
                  ? 'rounded-l-2xl rounded-t-md rounded-br-2xl'
                  : 'rounded-l-2xl rounded-r-md'
                }
              ` 
              : `
                border border-card-border
                ${isFirstInGroup 
                  ? 'rounded-r-2xl rounded-tl-2xl rounded-bl-md' 
                  : isLastInGroup 
                  ? 'rounded-r-2xl rounded-t-md rounded-bl-2xl'
                  : 'rounded-r-2xl rounded-l-md'
                }
              `
            }
          `}
        >
          <div className="flex flex-col gap-xs">
            {/* Text skeleton - variable width to simulate natural message lengths */}
            <Skeleton className={`h-4 ${
              Math.random() > 0.5 ? 'w-full' : 
              Math.random() > 0.5 ? 'w-4/5' : 'w-3/5'
            }`} />
            {Math.random() > 0.6 && (
              <Skeleton className={`h-4 ${
                Math.random() > 0.5 ? 'w-3/4' : 'w-1/2'
              }`} />
            )}
          </div>
        </div>
        
        {/* Timestamp Skeleton - Only show for last message in group */}
        {isLastInGroup && Math.random() > 0.5 && (
          <div className={`flex items-center gap-xs mt-xs ${
            isUser ? 'justify-end' : 'justify-start'
          }`}>
            <Skeleton className="h-3 w-16" />
          </div>
        )}
      </div>
    </div>
  );
}
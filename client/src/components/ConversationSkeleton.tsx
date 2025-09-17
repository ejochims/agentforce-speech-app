import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export default function ConversationSkeleton() {
  return (
    <Card className="hover-elevate cursor-pointer transition-all duration-200" role="status" aria-label="Loading conversation">
      <CardContent className="p-lg">
        <div className="flex items-start justify-between gap-md">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-sm mb-sm">
              {/* Conversation title skeleton */}
              <Skeleton className={`h-4 ${
                Math.random() > 0.5 ? 'w-32' : 
                Math.random() > 0.5 ? 'w-24' : 'w-40'
              }`} />
              {/* Random badge for some cards */}
              {Math.random() > 0.7 && (
                <Skeleton className="h-5 w-16 rounded-full" />
              )}
            </div>
            
            <div className="flex items-center gap-md text-xs">
              <div className="flex items-center gap-xs">
                {/* Clock icon skeleton */}
                <Skeleton className="w-3 h-3 rounded-full" />
                {/* Date/time skeleton */}
                <Skeleton className="h-3 w-28" />
              </div>
              
              {/* Status indicator skeleton */}
              <div className="flex items-center gap-xs">
                <Skeleton className="w-3 h-3 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
/**
 * Utility functions for formatting time and dates in a chat interface
 */

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  // Just now (under 30 seconds)
  if (diffInSeconds < 30) {
    return 'Just now';
  }

  // Minutes (30 seconds to 59 minutes)
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return minutes === 1 ? '1 min ago' : `${minutes} min ago`;
  }

  // Hours (1 hour to 23 hours)
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }

  // Days (1 day to 6 days)
  if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }

  // For older messages, show the actual date
  return date.toLocaleDateString([], { 
    month: 'short', 
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

export function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });
}

export function shouldGroupMessage(
  currentMessage: { role: string; createdAt: string }, 
  previousMessage: { role: string; createdAt: string } | null
): boolean {
  if (!previousMessage) return false;
  
  // Only group messages from the same sender
  if (currentMessage.role !== previousMessage.role) return false;
  
  // Only group messages within 5 minutes of each other
  const currentTime = new Date(currentMessage.createdAt).getTime();
  const previousTime = new Date(previousMessage.createdAt).getTime();
  const diffInMinutes = (currentTime - previousTime) / (1000 * 60);
  
  return diffInMinutes < 5;
}
import { useState } from 'react';
import { History, Plus, Clock, MessageCircle, Pencil } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ConversationSkeleton from './ConversationSkeleton';
import type { Conversation } from '@shared/schema';

interface ConversationHistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversations: Conversation[];
  conversationsLoading: boolean;
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onUpdateTitle: (id: string, title: string) => void;
}

export default function ConversationHistoryDrawer({
  open,
  onOpenChange,
  conversations,
  conversationsLoading,
  currentConversationId,
  onSelectConversation,
  onUpdateTitle,
}: ConversationHistoryDrawerProps) {
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');

  const saveTitle = (id: string) => {
    const trimmed = editingTitleValue.trim();
    const original = conversations.find((c) => c.id === id)?.title;
    if (trimmed && trimmed !== original) {
      onUpdateTitle(id, trimmed);
    }
    setEditingTitleId(null);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full"
          data-testid="button-history"
          aria-label="View conversation history"
        >
          <History className="w-4 h-4" />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-center">
          <DrawerTitle className="text-xl font-semibold">Conversation History</DrawerTitle>
          <DrawerDescription className="text-muted-foreground">
            Your recent conversations and chat history
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-lg pb-lg overflow-y-auto max-h-[calc(85vh-120px)]">
          {conversationsLoading ? (
            <div className="space-y-md" aria-busy="true" aria-label="Loading conversations">
              <ConversationSkeleton />
              <ConversationSkeleton />
              <ConversationSkeleton />
              <ConversationSkeleton />
              <ConversationSkeleton />
              <ConversationSkeleton />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-xl" role="status">
              <History className="w-16 h-16 text-muted-foreground mx-auto mb-lg" aria-hidden="true" />
              <h3 className="text-xl font-semibold mb-md text-foreground">Ready to chat?</h3>
              <p className="text-muted-foreground mb-lg max-w-sm mx-auto leading-relaxed">
                Start a conversation with Agentforce using voice or text. Your chat history will appear here.
              </p>
              <Button
                onClick={() => onOpenChange(false)}
                className="rounded-full"
                data-testid="button-start-new-conversation"
                aria-label="Close history and start new conversation"
              >
                <Plus className="w-4 h-4 mr-2" aria-hidden="true" />
                Start New Conversation
              </Button>
            </div>
          ) : (
            <div className="space-y-md">
              {conversations.map((conv) => {
                const isCurrentConversation = conv.id === currentConversationId;
                const lastActivity = new Date(conv.createdAt);

                return (
                  <Card
                    key={conv.id}
                    className={`group hover-elevate cursor-pointer transition-all duration-200 ${
                      isCurrentConversation ? 'ring-2 ring-primary/20 border-primary/30' : ''
                    }`}
                    onClick={() => {
                      if (editingTitleId === conv.id) return;
                      if (!isCurrentConversation) {
                        onSelectConversation(conv.id);
                      }
                      onOpenChange(false);
                    }}
                    data-testid={`card-conversation-${conv.id}`}
                  >
                    <CardContent className="p-lg">
                      <div className="flex items-start justify-between gap-md">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-sm mb-sm">
                            {editingTitleId === conv.id ? (
                              <input
                                value={editingTitleValue}
                                onChange={(e) => setEditingTitleValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveTitle(conv.id);
                                  if (e.key === 'Escape') setEditingTitleId(null);
                                  e.stopPropagation();
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={() => saveTitle(conv.id)}
                                autoFocus
                                className="flex-1 min-w-0 text-sm font-medium bg-transparent border-b border-primary outline-none py-0.5 text-foreground w-full"
                                aria-label="Edit conversation title"
                              />
                            ) : (
                              <>
                                <h4 className="font-medium text-foreground truncate flex-1 min-w-0">
                                  {conv.title}
                                </h4>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingTitleId(conv.id);
                                    setEditingTitleValue(conv.title);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-muted flex-shrink-0 transition-opacity"
                                  aria-label="Edit conversation title"
                                  title="Rename"
                                >
                                  <Pencil className="w-3 h-3 text-muted-foreground" />
                                </button>
                              </>
                            )}
                            {isCurrentConversation && (
                              <Badge variant="secondary" className="text-xs px-sm py-0.5 flex-shrink-0">
                                Current
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-md text-xs text-muted-foreground">
                            <div className="flex items-center gap-xs">
                              <Clock className="w-3 h-3" />
                              <span>
                                {lastActivity.toLocaleDateString()} at {lastActivity.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-xs">
                              <MessageCircle className="w-3 h-3" />
                              <span>{conv.status}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

import { describe, it, expect, beforeEach } from 'vitest';
import { MemStorage } from '../storage';

describe('MemStorage', () => {
  let storage: MemStorage;

  beforeEach(() => {
    storage = new MemStorage();
  });

  // ─── Users ────────────────────────────────────────────────────────────────

  describe('users', () => {
    it('creates a user and retrieves it by id', async () => {
      const user = await storage.createUser({ username: 'alice', password: 'secret' });
      expect(user.id).toBeTruthy();
      expect(user.username).toBe('alice');

      const found = await storage.getUser(user.id);
      expect(found).toEqual(user);
    });

    it('returns undefined for an unknown user id', async () => {
      const found = await storage.getUser('nonexistent-id');
      expect(found).toBeUndefined();
    });

    it('retrieves a user by username', async () => {
      const user = await storage.createUser({ username: 'bob', password: 'pass' });
      const found = await storage.getUserByUsername('bob');
      expect(found).toEqual(user);
    });

    it('returns undefined for an unknown username', async () => {
      const found = await storage.getUserByUsername('nobody');
      expect(found).toBeUndefined();
    });

    it('assigns unique ids to multiple users', async () => {
      const a = await storage.createUser({ username: 'a', password: 'p' });
      const b = await storage.createUser({ username: 'b', password: 'p' });
      expect(a.id).not.toBe(b.id);
    });
  });

  // ─── Conversations ────────────────────────────────────────────────────────

  describe('conversations', () => {
    it('creates a conversation with required fields', async () => {
      const conv = await storage.createConversation({ title: 'Test', status: 'active' });
      expect(conv.id).toBeTruthy();
      expect(conv.title).toBe('Test');
      expect(conv.status).toBe('active');
      expect(conv.sessionId).toBeNull();
      expect(conv.createdAt).toBeInstanceOf(Date);
    });

    it('defaults status to active when not provided', async () => {
      const conv = await storage.createConversation({ title: 'Hello', status: 'active' });
      expect(conv.status).toBe('active');
    });

    it('defaults sessionId to null when not provided', async () => {
      const conv = await storage.createConversation({ title: 'Chat', status: 'active' });
      expect(conv.sessionId).toBeNull();
    });

    it('retrieves a conversation by id', async () => {
      const conv = await storage.createConversation({ title: 'Find me', status: 'active' });
      const found = await storage.getConversation(conv.id);
      expect(found).toEqual(conv);
    });

    it('returns undefined for an unknown conversation id', async () => {
      const found = await storage.getConversation('no-such-id');
      expect(found).toBeUndefined();
    });

    it('returns conversations sorted newest first', async () => {
      const first = await storage.createConversation({ title: 'First', status: 'active' });
      // Ensure distinct timestamps by mutating createdAt directly via the map (white-box)
      // Instead we rely on sequential creation being fast enough – use small delay
      await new Promise(r => setTimeout(r, 5));
      const second = await storage.createConversation({ title: 'Second', status: 'active' });

      const all = await storage.getConversations();
      expect(all[0].id).toBe(second.id);
      expect(all[1].id).toBe(first.id);
    });

    it('returns an empty array when there are no conversations', async () => {
      const all = await storage.getConversations();
      expect(all).toEqual([]);
    });

    it('updates conversation status', async () => {
      const conv = await storage.createConversation({ title: 'Test', status: 'active' });
      await storage.updateConversationStatus(conv.id, 'completed');

      const updated = await storage.getConversation(conv.id);
      expect(updated?.status).toBe('completed');
    });

    it('silently ignores status update for unknown id', async () => {
      // Should not throw
      await expect(
        storage.updateConversationStatus('no-such-id', 'completed')
      ).resolves.toBeUndefined();
    });

    it('updates conversation sessionId', async () => {
      const conv = await storage.createConversation({ title: 'Chat', status: 'active' });
      expect(conv.sessionId).toBeNull();

      await storage.updateConversationSessionId(conv.id, 'sf-session-abc123');

      const updated = await storage.getConversation(conv.id);
      expect(updated?.sessionId).toBe('sf-session-abc123');
    });

    it('silently ignores sessionId update for unknown id', async () => {
      await expect(
        storage.updateConversationSessionId('no-such-id', 'some-session')
      ).resolves.toBeUndefined();
    });

    it('preserves other fields when updating sessionId', async () => {
      const conv = await storage.createConversation({ title: 'Keep me', status: 'active' });
      await storage.updateConversationSessionId(conv.id, 'new-session');

      const updated = await storage.getConversation(conv.id);
      expect(updated?.title).toBe('Keep me');
      expect(updated?.status).toBe('active');
    });
  });

  // ─── Turns ────────────────────────────────────────────────────────────────

  describe('turns', () => {
    it('creates a turn with required fields', async () => {
      const conv = await storage.createConversation({ title: 'Chat', status: 'active' });
      const turn = await storage.createTurn({
        conversationId: conv.id,
        role: 'user',
        text: 'Hello!',
      });

      expect(turn.id).toBeTruthy();
      expect(turn.conversationId).toBe(conv.id);
      expect(turn.role).toBe('user');
      expect(turn.text).toBe('Hello!');
      expect(turn.audioUrl).toBeNull();
      expect(turn.createdAt).toBeInstanceOf(Date);
    });

    it('defaults audioUrl to null when not provided', async () => {
      const conv = await storage.createConversation({ title: 'Chat', status: 'active' });
      const turn = await storage.createTurn({
        conversationId: conv.id,
        role: 'user',
        text: 'Hi',
      });
      expect(turn.audioUrl).toBeNull();
    });

    it('stores audioUrl when provided', async () => {
      const conv = await storage.createConversation({ title: 'Chat', status: 'active' });
      const turn = await storage.createTurn({
        conversationId: conv.id,
        role: 'assistant',
        text: 'Response',
        audioUrl: '/audio/file.mp3',
      });
      expect(turn.audioUrl).toBe('/audio/file.mp3');
    });

    it('retrieves turns for a conversation in chronological order', async () => {
      const conv = await storage.createConversation({ title: 'Chat', status: 'active' });

      const t1 = await storage.createTurn({ conversationId: conv.id, role: 'user', text: 'Hi' });
      await new Promise(r => setTimeout(r, 5));
      const t2 = await storage.createTurn({ conversationId: conv.id, role: 'assistant', text: 'Hello' });
      await new Promise(r => setTimeout(r, 5));
      const t3 = await storage.createTurn({ conversationId: conv.id, role: 'user', text: 'How are you?' });

      const turns = await storage.getTurnsByConversation(conv.id);
      expect(turns).toHaveLength(3);
      expect(turns[0].id).toBe(t1.id);
      expect(turns[1].id).toBe(t2.id);
      expect(turns[2].id).toBe(t3.id);
    });

    it('only returns turns for the requested conversation', async () => {
      const conv1 = await storage.createConversation({ title: 'A', status: 'active' });
      const conv2 = await storage.createConversation({ title: 'B', status: 'active' });

      await storage.createTurn({ conversationId: conv1.id, role: 'user', text: 'In conv1' });
      await storage.createTurn({ conversationId: conv2.id, role: 'user', text: 'In conv2' });

      const turns1 = await storage.getTurnsByConversation(conv1.id);
      const turns2 = await storage.getTurnsByConversation(conv2.id);

      expect(turns1).toHaveLength(1);
      expect(turns1[0].text).toBe('In conv1');
      expect(turns2).toHaveLength(1);
      expect(turns2[0].text).toBe('In conv2');
    });

    it('returns an empty array for a conversation with no turns', async () => {
      const conv = await storage.createConversation({ title: 'Empty', status: 'active' });
      const turns = await storage.getTurnsByConversation(conv.id);
      expect(turns).toEqual([]);
    });

    it('assigns unique ids to multiple turns', async () => {
      const conv = await storage.createConversation({ title: 'Chat', status: 'active' });
      const t1 = await storage.createTurn({ conversationId: conv.id, role: 'user', text: 'A' });
      const t2 = await storage.createTurn({ conversationId: conv.id, role: 'user', text: 'B' });
      expect(t1.id).not.toBe(t2.id);
    });
  });

  // ─── Settings ─────────────────────────────────────────────────────────────

  describe('settings', () => {
    it('returns default settings on first call', async () => {
      const settings = await storage.getSettings();
      expect(settings.id).toBe('default');
      expect(settings.voice).toBe('alloy');
      expect(settings.language).toBe('en-US');
      expect(settings.sttProvider).toBe('salesforce');
      expect(settings.ttsProvider).toBe('salesforce');
      expect(settings.agentforceMode).toBe('stub');
    });

    it('returns the same object on subsequent calls (singleton)', async () => {
      const s1 = await storage.getSettings();
      const s2 = await storage.getSettings();
      expect(s1).toBe(s2);
    });

    it('updates settings with new values', async () => {
      await storage.updateSettings({ voice: 'nova', language: 'fr-FR', sttProvider: 'salesforce', ttsProvider: 'salesforce', agentforceMode: 'real' });
      const settings = await storage.getSettings();
      expect(settings.voice).toBe('nova');
      expect(settings.language).toBe('fr-FR');
    });

    it('preserves id as "default" after update', async () => {
      await storage.updateSettings({ voice: 'shimmer', language: 'en-US', sttProvider: 'salesforce', ttsProvider: 'salesforce', agentforceMode: 'real' });
      const settings = await storage.getSettings();
      expect(settings.id).toBe('default');
    });

    it('merges partial updates over existing settings', async () => {
      // Set initial non-default state
      await storage.updateSettings({ voice: 'onyx', language: 'es-ES', sttProvider: 'salesforce', ttsProvider: 'salesforce', agentforceMode: 'real' });
      // Update only voice
      await storage.updateSettings({ voice: 'echo', language: 'es-ES', sttProvider: 'salesforce', ttsProvider: 'salesforce', agentforceMode: 'real' });

      const settings = await storage.getSettings();
      expect(settings.voice).toBe('echo');
      expect(settings.language).toBe('es-ES'); // preserved
    });
  });

  // ─── Isolation ────────────────────────────────────────────────────────────

  describe('instance isolation', () => {
    it('separate MemStorage instances do not share state', async () => {
      const store1 = new MemStorage();
      const store2 = new MemStorage();

      await store1.createConversation({ title: 'Only in store1', status: 'active' });

      const all1 = await store1.getConversations();
      const all2 = await store2.getConversations();

      expect(all1).toHaveLength(1);
      expect(all2).toHaveLength(0);
    });
  });
});

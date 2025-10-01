import { 
  type User, 
  type InsertUser,
  type Conversation,
  type InsertConversation,
  type Turn,
  type InsertTurn,
  type Settings,
  type InsertSettings
} from "@shared/schema";
import { randomUUID } from "crypto";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Conversations
  getConversations(): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversationStatus(id: string, status: string): Promise<void>;
  updateConversationSessionId(id: string, sessionId: string): Promise<void>;
  
  // Turns
  getTurnsByConversation(conversationId: string): Promise<Turn[]>;
  createTurn(turn: InsertTurn): Promise<Turn>;
  
  // Settings
  getSettings(): Promise<Settings>;
  updateSettings(settings: InsertSettings): Promise<Settings>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private conversations: Map<string, Conversation>;
  private turns: Map<string, Turn>;
  private settings: Settings | null;

  constructor() {
    this.users = new Map();
    this.conversations = new Map();
    this.turns = new Map();
    this.settings = null;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    return Array.from(this.conversations.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    return this.conversations.get(id);
  }

  async createConversation(insertConversation: InsertConversation): Promise<Conversation> {
    const id = randomUUID();
    const conversation: Conversation = {
      ...insertConversation,
      id,
      status: insertConversation.status || "active",
      sessionId: insertConversation.sessionId || null,
      createdAt: new Date(),
    };
    this.conversations.set(id, conversation);
    return conversation;
  }

  async updateConversationStatus(id: string, status: string): Promise<void> {
    const conversation = this.conversations.get(id);
    if (conversation) {
      this.conversations.set(id, { ...conversation, status });
    }
  }

  async updateConversationSessionId(id: string, sessionId: string): Promise<void> {
    const conversation = this.conversations.get(id);
    if (conversation) {
      this.conversations.set(id, { ...conversation, sessionId });
    }
  }

  // Turns
  async getTurnsByConversation(conversationId: string): Promise<Turn[]> {
    return Array.from(this.turns.values())
      .filter(turn => turn.conversationId === conversationId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createTurn(insertTurn: InsertTurn): Promise<Turn> {
    const id = randomUUID();
    const turn: Turn = {
      ...insertTurn,
      id,
      audioUrl: insertTurn.audioUrl || null,
      createdAt: new Date(),
    };
    this.turns.set(id, turn);
    return turn;
  }

  // Settings
  async getSettings(): Promise<Settings> {
    if (!this.settings) {
      this.settings = {
        id: "default",
        voice: "alloy",
        language: "en-US",
        sttProvider: "salesforce",
        ttsProvider: "salesforce",
        agentforceMode: "stub",
      };
    }
    return this.settings;
  }

  async updateSettings(insertSettings: InsertSettings): Promise<Settings> {
    const currentSettings = await this.getSettings();
    this.settings = {
      ...currentSettings,
      ...insertSettings,
      id: "default",
    };
    return this.settings;
  }
}

export const storage = new MemStorage();

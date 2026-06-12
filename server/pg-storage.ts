import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { eq, desc, asc } from "drizzle-orm";
import {
  users,
  conversations,
  turns,
  settings as settingsTable,
  type User,
  type InsertUser,
  type Conversation,
  type InsertConversation,
  type Turn,
  type InsertTurn,
  type Settings,
  type InsertSettings,
} from "@shared/schema";
import type { IStorage } from "./storage";

const DEFAULT_SETTINGS_ID = "default";

export class PostgresStorage implements IStorage {
  private db: NodePgDatabase;

  constructor(databaseUrl: string) {
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      // Heroku Postgres uses self-signed certificates, so certificate
      // verification must be relaxed in production.
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : undefined,
    });
    this.db = drizzle(pool);
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return rows[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const rows = await this.db.insert(users).values(insertUser).returning();
    return rows[0];
  }

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    return this.db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.createdAt));
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return rows[0];
  }

  async createConversation(
    insertConversation: InsertConversation
  ): Promise<Conversation> {
    const rows = await this.db
      .insert(conversations)
      .values(insertConversation)
      .returning();
    return rows[0];
  }

  async updateConversationStatus(id: string, status: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ status })
      .where(eq(conversations.id, id));
  }

  async updateConversationSessionId(
    id: string,
    sessionId: string
  ): Promise<void> {
    await this.db
      .update(conversations)
      .set({ sessionId })
      .where(eq(conversations.id, id));
  }

  async updateConversationTitle(id: string, title: string): Promise<void> {
    await this.db
      .update(conversations)
      .set({ title })
      .where(eq(conversations.id, id));
  }

  // Turns
  async getTurnsByConversation(conversationId: string): Promise<Turn[]> {
    return this.db
      .select()
      .from(turns)
      .where(eq(turns.conversationId, conversationId))
      .orderBy(asc(turns.createdAt));
  }

  async createTurn(insertTurn: InsertTurn): Promise<Turn> {
    const rows = await this.db.insert(turns).values(insertTurn).returning();
    return rows[0];
  }

  // Settings
  async getSettings(): Promise<Settings> {
    const rows = await this.db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.id, DEFAULT_SETTINGS_ID));
    if (rows[0]) return rows[0];

    // First call ever — seed the default row. onConflictDoNothing guards
    // against a concurrent request seeding it first.
    const inserted = await this.db
      .insert(settingsTable)
      .values({ id: DEFAULT_SETTINGS_ID })
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return inserted[0];

    const reread = await this.db
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.id, DEFAULT_SETTINGS_ID));
    return reread[0];
  }

  async updateSettings(insertSettings: InsertSettings): Promise<Settings> {
    // Ensure the row exists before updating it
    await this.getSettings();
    const rows = await this.db
      .update(settingsTable)
      .set(insertSettings)
      .where(eq(settingsTable.id, DEFAULT_SETTINGS_ID))
      .returning();
    return rows[0];
  }
}

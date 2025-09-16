import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  status: varchar("status").notNull().default("active"), // active, completed, error
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const turns = pgTable("turns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id),
  role: varchar("role").notNull(), // user, assistant
  text: text("text").notNull(),
  audioUrl: text("audio_url"), // optional path to audio file
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  id: varchar("id").primaryKey().default("default"),
  voice: varchar("voice").notNull().default("alloy"), // OpenAI TTS voices
  language: varchar("language").notNull().default("en-US"),
  sttProvider: varchar("stt_provider").notNull().default("openai"), // openai, browser
  ttsProvider: varchar("tts_provider").notNull().default("openai"), // openai, browser
  agentforceMode: varchar("agentforce_mode").notNull().default("stub"), // stub, real
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
});

export const insertTurnSchema = createInsertSchema(turns).omit({
  id: true,
  createdAt: true,
});

export const insertSettingsSchema = createInsertSchema(settings).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Turn = typeof turns.$inferSelect;
export type InsertTurn = z.infer<typeof insertTurnSchema>;
export type Settings = typeof settings.$inferSelect;
export type InsertSettings = z.infer<typeof insertSettingsSchema>;

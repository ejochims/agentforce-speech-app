import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// Ensure DATABASE_URL has SSL parameter for Heroku PostgreSQL
const databaseUrl = process.env.DATABASE_URL + (
  process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL.includes('sslmode')
    ? '?sslmode=require'
    : ''
);

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});

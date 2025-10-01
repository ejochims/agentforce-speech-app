import pg from 'pg';
import fs from 'fs';

const { Client } = pg;

async function initDatabase() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const sql = fs.readFileSync('init-db.sql', 'utf8');
    await client.query(sql);
    
    console.log('✅ Database tables created successfully!');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

initDatabase();


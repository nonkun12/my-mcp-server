import pg from "pg";

const { Pool } = pg;

// Keep pool construction synchronous so the HTTP listener can start even when
// PostgreSQL is temporarily unavailable. Schema initialization is explicit.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (error) => {
  console.error("PG POOL ERROR:", error?.name ?? "Error");
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )
  `);
  await pool.query("ALTER TABLE memories ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'");
  await pool.query("ALTER TABLE memories ADD COLUMN IF NOT EXISTS importance TEXT DEFAULT 'normal'");
  await pool.query("ALTER TABLE memories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()");
  await pool.query("ALTER TABLE memories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      remind_at TIMESTAMPTZ NOT NULL,
      message TEXT NOT NULL,
      sent BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE reminders ADD COLUMN IF NOT EXISTS repeat TEXT NOT NULL DEFAULT 'none'");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE notes ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '一般'");

  console.log("PostgreSQL schema initialization complete");
}

export default pool;

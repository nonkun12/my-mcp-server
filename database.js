import pg from "pg";

const { Pool } = pg;

// Render Postgres / Supabase Postgres接続
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 接続エラー監視
pool.on("error", (err) => {
  console.error("PG POOL ERROR:", err);
});


async function initDb() {

  // =========================
  // AI Memory
  // =========================
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )
  `);


  // =========================
  // Reminder
  // =========================
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


  // 既存remindersへ追加
  await pool.query(`
    ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS repeat TEXT NOT NULL DEFAULT 'none'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS category TEXT DEFAULT '一般'
  `);

  console.error("✅ PostgreSQL接続・テーブル初期化 完了");
}


// 起動時DB初期化
await initDb();


export default pool;
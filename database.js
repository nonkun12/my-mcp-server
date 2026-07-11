import pg from "pg";

const { Pool } = pg;

// Render Postgresの Internal Database URL を使う想定。
// Renderの内部ネットワーク接続でもSSLハンドシェイクを求められることがあるため、
// rejectUnauthorized: false で自己署名証明書を許容する
// (Render管理下のDBなので中間者攻撃のリスクは実質無視できる)。
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// プール全体で起きた予期しないエラー(接続断など)をログに残す。
// これがないと、アイドル中のクライアントで起きたエラーが
// uncaughtExceptionとしてプロセスごと落ちる原因になる。
pool.on("error", (err) => {
  console.error("PG POOL ERROR:", err);
});

async function initDb() {
  // user_idごとに記憶を分離するため、(user_id, key)の複合主キーにする。
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memories (
      user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )
  `);

  // リマインダー機能用。remind_at は TIMESTAMPTZ で保存し、
  // sent=false のうち remind_at が現在時刻を過ぎたものをスケジューラーが定期的に拾って送信する。
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

  // 繰り返しリマインダー対応。repeat='daily' の場合、送信成功のたびに
  // remind_at を翌日の同時刻へ更新し続ける(sentはfalseのまま)。
  // 既存テーブルに対しても安全に追加できるよう IF NOT EXISTS を使う。
  await pool.query(`
    ALTER TABLE reminders
    ADD COLUMN IF NOT EXISTS repeat TEXT NOT NULL DEFAULT 'none'
  `);

  console.error("✅ Postgres接続・テーブル初期化 完了");
}

// トップレベルawait: 起動時に初期化が失敗したら、
// 中途半端な状態で起動を続けさせず、ここで即座に落とす。
await initDb();

export default pool;
import Database from "better-sqlite3";


const db = new Database("./memory.db");


console.error("✅ SQLite接続成功");


// user_idごとに記憶を分離するため、(user_id, key)の複合主キーに変更。
// 以前は key だけがUNIQUEだったため、複数クライアント/ユーザーが同じkey名を
// 使うと記憶が混ざってしまう問題があった。
//
// 既存の memories テーブルが旧スキーマ(user_idカラムなし)の場合は
// 作り直す(テスト運用中のため、既存データは一旦破棄する前提)。
const existing = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memories'")
  .get();

if (existing) {
  const columns = db.prepare("PRAGMA table_info(memories)").all();
  const hasUserId = columns.some((col) => col.name === "user_id");

  if (!hasUserId) {
    console.error("⚠️ 旧スキーマのmemoriesテーブルを検出、作り直します");
    db.exec("DROP TABLE memories");
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS memories (
    user_id TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (user_id, key)
)
`);

// リマインダー機能用。remind_at は ISO 8601 文字列(例: 2026-07-12T15:00:00+09:00)で保存し、
// sent=0 のうち remind_at が現在時刻を過ぎたものをスケジューラーが定期的に拾って送信する。
db.exec(`
CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    remind_at TEXT NOT NULL,
    message TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
`);


export default db;
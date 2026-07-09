import sqlite3 from "sqlite3";

const db = new sqlite3.Database("./memory.db", (err) => {
  if (err) {
    console.error("SQLite接続エラー:", err.message);
  } else {
    console.error("✅ SQLite接続成功");
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE,
      value TEXT
    )
  `);
});

export default db;
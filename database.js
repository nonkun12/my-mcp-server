import Database from "better-sqlite3";


const db = new Database("./memory.db");


console.error("✅ SQLite接続成功");


db.exec(`
CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT
)
`);


export default db;

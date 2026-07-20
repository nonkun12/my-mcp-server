import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

try {
  const result = await pool.query(
    "DELETE FROM reminders WHERE id = $1 RETURNING id",
    [21]
  );

  if (result.rowCount === 0) {
    console.log("id=21 は見つかりませんでした。");
  } else {
    console.log("削除成功:", result.rows[0]);
  }
} catch (err) {
  console.error(err);
} finally {
  await pool.end();
}

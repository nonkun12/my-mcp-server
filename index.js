import cron from "node-cron";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "./tools/index.js";
import db from "./database.js"; // db = pg.Pool (Postgres接続プール)

const app = express();

app.use(express.json());

// =================================
// 認証
// =================================
// LINE Bot以外のクライアントも増えてくる前提で、
// /mcp エンドポイントだけ固定APIキーで保護する。
// Renderの環境変数 MCP_API_KEY に設定した値と、
// リクエストヘッダー "x-api-key" を照合する。
const MCP_API_KEY = process.env.MCP_API_KEY;

function requireApiKey(req, res, next) {
  if (!MCP_API_KEY) {
    // 環境変数が未設定の場合は起動時のミスなので、
    // 誰でも通してしまうより明示的にエラーにする
    console.error("MCP_API_KEY is not set");
    return res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Server misconfigured: MCP_API_KEY not set",
      },
      id: null,
    });
  }

  const provided = req.header("x-api-key");

  if (provided !== MCP_API_KEY) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized: invalid or missing x-api-key",
      },
      id: null,
    });
  }

  next();
}

// =================================
// Health Check(認証不要・Render監視用)
// =================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "memory-mcp-server",
  });
});

// =================================
// MCP Server 作成
// =================================

function createMcpServer() {
  const server = new McpServer({
    name: "memory-mcp-server",

    version: "1.0.0",
  });

  registerAllTools(server);

  return server;
}

// =================================
// MCP Endpoint
// =================================

app.post("/mcp", requireApiKey, async (req, res) => {
  console.log("===== MCP REQUEST =====");
  console.log(JSON.stringify(req.body, null, 2));

  const server = createMcpServer();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  // レスポンス終了時にserver/transportを必ず破棄する。
  // これがないと、リクエストのたびにインスタンスが残り続け、
  // Free プラン(512MBメモリ)ではメモリ不足でプロセスごと
  // 落ちる原因になっていた。
  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);

    console.log("===== BEFORE HANDLE REQUEST =====");

    await transport.handleRequest(
      req,
      res,
      req.body,
    );

    console.log("===== AFTER HANDLE REQUEST =====");
    console.log("HEADERS SENT:", res.headersSent);
    console.log("RES FINISHED:", res.finished);
  } catch (error) {
    console.error("MCP REQUEST ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

// ステートレスモードではGET/DELETEは使わないため、
// 明示的に405を返す(クライアントが誤って接続を待ち続けるのを防ぐ)
app.get("/mcp", requireApiKey, (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. This server is stateless; use POST.",
    },
    id: null,
  });
});

app.delete("/mcp", requireApiKey, (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. This server is stateless; use POST.",
    },
    id: null,
  });
});

// =================================
// リマインダー・スケジューラー
// =================================
// 1分ごとに、送信予定時刻を過ぎていてまだ送っていないリマインダーを探し、
// LINE Bot側の内部エンドポイントを叩いて実際の送信(push)を依頼する。
// MCPサーバー自身はLINEのトークンを持たない(役割分担を守るため)。
const LINE_BOT_PUSH_URL = process.env.LINE_BOT_PUSH_URL;
const INTERNAL_PUSH_KEY = process.env.INTERNAL_PUSH_KEY;

async function checkAndSendReminders() {
  if (!LINE_BOT_PUSH_URL || !INTERNAL_PUSH_KEY) {
    // 未設定ならスケジューラー自体を無効化(起動時に一度だけ警告)
    return;
  }

  let due;

  try {
    const result = await db.query(`
      SELECT id, user_id, message, repeat
      FROM reminders
      WHERE sent = false AND remind_at <= NOW()
    `);
    due = result.rows;
  } catch (error) {
    console.error("リマインダー確認クエリエラー:", error);
    return;
  }

  for (const reminder of due) {
    try {
      const res = await fetch(LINE_BOT_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_PUSH_KEY,
        },
        body: JSON.stringify({
          user_id: reminder.user_id,
          message: reminder.message,
        }),
      });

      if (res.ok) {
        if (reminder.repeat === "daily") {
          // 単発リマインダーとは異なり、sentはfalseのままにして、
          // remind_atだけ翌日の同時刻へ進める。これにより次回のループで
          // 再び拾われ、毎日繰り返し送信される。
          await db.query(
            "UPDATE reminders SET remind_at = remind_at + interval '1 day' WHERE id = $1",
            [reminder.id],
          );

          console.log(
            `リマインダー送信成功(繰り返し・次回へ更新): id=${reminder.id}`,
          );
        } else {
          await db.query("UPDATE reminders SET sent = true WHERE id = $1", [
            reminder.id,
          ]);

          console.log(`リマインダー送信成功: id=${reminder.id}`);
        }
      } else {
        const body = await res.text();

        console.error(
          `リマインダー送信失敗: id=${reminder.id}, status=${res.status}, body=${body}`,
        );
      }
    } catch (error) {
      console.error(`リマインダー送信エラー: id=${reminder.id}`, error);
    }
  }
}

if (LINE_BOT_PUSH_URL && INTERNAL_PUSH_KEY) {
  setInterval(checkAndSendReminders, 60 * 1000);
  console.log("リマインダー・スケジューラーを起動しました(60秒間隔)");
} else {
  console.warn(
    "LINE_BOT_PUSH_URL または INTERNAL_PUSH_KEY が未設定のため、リマインダー送信は無効です",
  );
}



// =================================
// AI開発報告送信
// =================================
// line-bot側の /internal/ai-report を呼び出す
// Groq処理とLINE送信はline-bot側で担当
// =================================

const LINE_BOT_AI_REPORT_URL = process.env.LINE_BOT_AI_REPORT_URL;
const REPORT_USER_ID = process.env.REPORT_USER_ID;

async function sendDailyAIReport() {

  if (!LINE_BOT_AI_REPORT_URL || !INTERNAL_PUSH_KEY || !REPORT_USER_ID) {
    console.warn("AI report設定不足");
    return;
  }

  try {

    const res = await fetch(
      LINE_BOT_AI_REPORT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-key": INTERNAL_PUSH_KEY
        },
        body: JSON.stringify({
          user_id: REPORT_USER_ID,
          prompt:
            "昨日のAI開発状況を確認して、GitHub変更やメモ内容をもとに簡潔な開発報告を作成してください。"
        })
      }
    );

    console.log(
      "AI REPORT RESULT:",
      await res.text()
    );

  } catch(error) {
    console.error("AI REPORT ERROR:", error);
  }
}


// =================================
// 予期しないエラーのログ(原因究明用)
// =================================
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

// =================================
// Server Start
// =================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Memory MCP Server running on port ${PORT}`);

  cron.schedule(
    "0 7 * * *",
    () => {
      console.log("AI REPORT SCHEDULE START");
      sendDailyAIReport();
    },
    {
      timezone: "Asia/Tokyo"
    }
  );

  console.log("AI report scheduler started");
});

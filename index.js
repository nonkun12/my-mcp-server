import cron from "node-cron";
import express from "express";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "./tools/index.js";
import db from "./database.js";

const app = express();
app.use(express.json());

const MCP_API_KEY = process.env.MCP_API_KEY;

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireApiKey(req, res, next) {
  if (!MCP_API_KEY) {
    console.error("MCP_API_KEY is not set");
    return res.status(500).json({ jsonrpc: "2.0", error: { code: -32000, message: "Server misconfigured: MCP_API_KEY not set" }, id: null });
  }
  const provided = req.header("x-api-key");
  if (!safeCompare(provided, MCP_API_KEY)) {
    return res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: invalid or missing x-api-key" }, id: null });
  }
  next();
}

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "memory-mcp-server" });
});

function createMcpServer() {
  const server = new McpServer({ name: "memory-mcp-server", version: "1.0.0" });
  registerAllTools(server);
  return server;
}

app.post("/mcp", requireApiKey, async (req, res) => {
  console.log("===== MCP REQUEST =====");
  console.log(JSON.stringify(req.body, null, 2));
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on("close", () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    console.log("===== BEFORE HANDLE REQUEST =====");
    await transport.handleRequest(req, res, req.body);
    console.log("===== AFTER HANDLE REQUEST =====");
    console.log("HEADERS SENT:", res.headersSent);
    console.log("RES FINISHED:", res.finished);
  } catch (error) {
    console.error("MCP REQUEST ERROR:", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
});

app.get("/mcp", requireApiKey, (req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." }, id: null });
});
app.delete("/mcp", requireApiKey, (req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." }, id: null });
});

const LINE_BOT_PUSH_URL = process.env.LINE_BOT_PUSH_URL;
const INTERNAL_PUSH_KEY = process.env.INTERNAL_PUSH_KEY;

async function checkAndSendReminders() {
  if (!LINE_BOT_PUSH_URL || !INTERNAL_PUSH_KEY) return;
  let due;
  try {
    const result = await db.query(`SELECT id, user_id, message, repeat FROM reminders WHERE sent = false AND remind_at <= NOW()`);
    due = result.rows;
  } catch (error) {
    console.error("リマインダー確認クエリエラー:", error);
    return;
  }
  for (const reminder of due) {
    console.log(`[TEST] LINE送信停止中 reminder id=${reminder.id}`);
    continue;
  }
}
if (LINE_BOT_PUSH_URL && INTERNAL_PUSH_KEY) {
  setInterval(checkAndSendReminders, 60 * 1000);
  console.log("リマインダー・スケジューラーを起動しました(60秒間隔)");
} else {
  console.warn("LINE_BOT_PUSH_URL または INTERNAL_PUSH_KEY が未設定のため、リマインダー送信は無効です");
}

const LINE_BOT_AI_REPORT_URL = process.env.LINE_BOT_AI_REPORT_URL;
const REPORT_USER_ID = process.env.REPORT_USER_ID;
async function sendDailyAIReport() {
  if (!LINE_BOT_AI_REPORT_URL || !INTERNAL_PUSH_KEY || !REPORT_USER_ID) {
    console.warn("AI report設定不足");
    return;
  }
  try {
    const res = await fetch(LINE_BOT_AI_REPORT_URL, { method: "POST", headers: { "Content-Type": "application/json", "x-internal-key": INTERNAL_PUSH_KEY }, body: JSON.stringify({ user_id: REPORT_USER_ID, prompt: "昨日のAI開発状況を確認して、GitHub変更やメモ内容をもとに簡潔な開発報告を作成してください。" }) });
    console.log("AI REPORT RESULT:", await res.text());
  } catch(error) { console.error("AI REPORT ERROR:", error); }
}

process.on("uncaughtException", (err) => { console.error("UNCAUGHT EXCEPTION:", err); });
process.on("unhandledRejection", (reason) => { console.error("UNHANDLED REJECTION:", reason); });
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`Memory MCP Server running on port ${PORT}`); console.log("AI report scheduler disabled"); });

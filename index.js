import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "./tools/index.js";


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
        message: "Server misconfigured: MCP_API_KEY not set"
      },
      id: null
    });
  }

  const provided = req.header("x-api-key");

  if (provided !== MCP_API_KEY) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: {
        code: -32001,
        message: "Unauthorized: invalid or missing x-api-key"
      },
      id: null
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
    service: "memory-mcp-server"
  });

});




// =================================
// MCP Server 作成
// =================================

function createMcpServer() {


  const server = new McpServer({

    name: "memory-mcp-server",

    version: "1.0.0"

  });

  registerAllTools(server);




  return server;

}



// =================================
// MCP Endpoint
// =================================

app.post("/mcp", requireApiKey, async (req, res) => {

  const server = createMcpServer();

  const transport =
    new StreamableHTTPServerTransport({

      sessionIdGenerator: undefined

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

    await transport.handleRequest(

      req,

      res,

      req.body

    );

  } catch (error) {

    console.error("MCP REQUEST ERROR:", error);

    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error"
        },
        id: null
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
      message: "Method not allowed. This server is stateless; use POST."
    },
    id: null
  });
});

app.delete("/mcp", requireApiKey, (req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. This server is stateless; use POST."
    },
    id: null
  });
});




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

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Memory MCP Server running on port ${PORT}`
  );

});
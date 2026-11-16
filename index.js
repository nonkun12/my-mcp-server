import express from "express";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerAllTools } from "./tools/index.js";
import db, { initDb } from "./database.js";
import { runWithDatabaseRetry } from "./database-retry.js";
import {
  createLivenessHandler,
  createReadinessHandler,
  createDatabaseReadyMiddleware,
} from "./health.js";

const app = express();
app.use(express.json({ limit: "256kb" }));

const MCP_API_KEY = process.env.MCP_API_KEY;
let databaseInitialized = false;
let shuttingDown = false;

function safeCompare(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireApiKey(req, res, next) {
  if (!MCP_API_KEY) {
    console.error("MCP_API_KEY is not configured");
    return res.status(503).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Server authentication is not configured" },
      id: null,
    });
  }
  if (!safeCompare(req.header("x-api-key"), MCP_API_KEY)) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
  }
  return next();
}

app.get("/health", createLivenessHandler());
app.get("/ready", createReadinessHandler(db, () => databaseInitialized));
const requireDatabaseReady = createDatabaseReadyMiddleware(() => databaseInitialized);

function createMcpServer() {
  const server = new McpServer({ name: "memory-mcp-server", version: "1.0.0" });
  registerAllTools(server);
  return server;
}

app.post("/mcp", requireApiKey, requireDatabaseReady, async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("MCP request failed:", error?.name ?? "Error");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", requireApiKey, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST." },
    id: null,
  });
});
app.delete("/mcp", requireApiKey, (_req, res) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. Use POST." },
    id: null,
  });
});

// Express body-parser errors are returned without reflecting request contents.
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = error?.status === 413 ? 413 : 400;
  res.status(status).json({
    jsonrpc: "2.0",
    error: {
      code: status === 413 ? -32003 : -32700,
      message: status === 413 ? "Request body too large" : "Invalid request body",
    },
    id: null,
  });
});

const PORT = Number(process.env.PORT) || 3000;
const httpServer = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Memory MCP Server listening on port ${PORT}`);
  void initializeDatabaseUntilReady();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function initializeDatabaseUntilReady() {
  while (!shuttingDown && !databaseInitialized) {
    try {
      await runWithDatabaseRetry(initDb, {
        maxAttempts: 3,
        baseDelayMs: 500,
        maxDelayMs: 2000,
      });
      databaseInitialized = true;
      console.log("Database initialization completed; MCP is ready");
    } catch (error) {
      console.error("Database initialization failed; retrying in 30s:", error?.name ?? "Error");
      await wait(30_000);
    }
  }
}

let shutdownPromise;
async function shutdown(exitCode = 0) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    const forceClose = setTimeout(() => {
      httpServer.closeAllConnections?.();
      process.exitCode = 1;
    }, 25_000);
    forceClose.unref();

    await new Promise((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeIdleConnections?.();
    });
    clearTimeout(forceClose);
    try {
      await db.end();
    } catch (error) {
      console.error("Database pool shutdown failed:", error?.name ?? "Error");
      exitCode = 1;
    }
    process.exitCode = exitCode;
  })();
  return shutdownPromise;
}

process.once("SIGTERM", () => {
  console.log("SIGTERM received; shutting down");
  void shutdown(0);
});
process.once("SIGINT", () => {
  console.log("SIGINT received; shutting down");
  void shutdown(0);
});
process.once("uncaughtException", (error) => {
  console.error("Uncaught exception; terminating safely:", error?.name ?? "Error");
  void shutdown(1);
});
process.once("unhandledRejection", (reason) => {
  console.error("Unhandled rejection; terminating safely:", reason?.name ?? "Error");
  void shutdown(1);
});

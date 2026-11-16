const DATABASE_QUERY_TIMEOUT_MS = 3000;
const READINESS_TIMEOUT_MS = 3500;

export function createLivenessHandler() {
  return function livenessHandler(_req, res) {
    return res.status(200).json({
      ok: true,
      service: "memory-mcp-server",
      status: "alive",
    });
  };
}

export function createReadinessHandler(
  db,
  isDatabaseInitialized,
  logger = console,
  timeoutMs = READINESS_TIMEOUT_MS,
) {
  return async function readinessHandler(_req, res) {
    if (!isDatabaseInitialized()) {
      return res.status(503).json({
        ok: false,
        service: "memory-mcp-server",
        status: "not_ready",
        checks: { database: "initializing" },
      });
    }

    let timeout;
    try {
      await Promise.race([
        db.query({ text: "SELECT 1", query_timeout: DATABASE_QUERY_TIMEOUT_MS }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("readiness timeout")), timeoutMs);
        }),
      ]);
      return res.status(200).json({
        ok: true,
        service: "memory-mcp-server",
        status: "ready",
        checks: { database: "ok" },
      });
    } catch (error) {
      logger.error("Readiness check failed:", error?.name ?? "Error");
      return res.status(503).json({
        ok: false,
        service: "memory-mcp-server",
        status: "not_ready",
        checks: { database: "error" },
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createDatabaseReadyMiddleware(isDatabaseInitialized) {
  return function databaseReadyMiddleware(_req, res, next) {
    if (!isDatabaseInitialized()) {
      return res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32002, message: "Server is not ready" },
        id: null,
      });
    }
    return next();
  };
}

const HEALTH_CHECK_TIMEOUT_MS = 3500;
const DATABASE_QUERY_TIMEOUT_MS = 3000;

export function createHealthHandler(
  db,
  logger = console,
  timeoutMs = HEALTH_CHECK_TIMEOUT_MS,
) {
  return async function healthHandler(_req, res) {
    let timeout;

    try {
      await Promise.race([
        db.query({
          text: "SELECT 1",
          query_timeout: DATABASE_QUERY_TIMEOUT_MS,
        }),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Health check timed out")),
            timeoutMs,
          );
        }),
      ]);

      return res.status(200).json({
        ok: true,
        service: "memory-mcp-server",
        checks: {
          database: "ok",
        },
      });
    } catch (error) {
      logger.error("Health check failed: PostgreSQL unavailable", error);

      return res.status(503).json({
        ok: false,
        service: "memory-mcp-server",
        checks: {
          database: "error",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export function createHealthHandler(db, logger = console) {
  return async function healthHandler(_req, res) {
    try {
      await db.query({
        text: "SELECT 1",
        query_timeout: 3000,
      });

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
    }
  };
}

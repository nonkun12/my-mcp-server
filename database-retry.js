const RETRYABLE_CODES = new Set([
  "08000", "08003", "08006", "08001", "08004", "08007", "08P01",
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH",
  "ENETUNREACH", "EPIPE", "57P01", "57P02", "57P03",
]);

function getErrorCode(error) {
  return error?.code ?? error?.cause?.code ?? null;
}

export function isRetryableDatabaseError(error) {
  return RETRYABLE_CODES.has(getErrorCode(error));
}

export async function runWithDatabaseRetry(
  operation,
  {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 2000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger = console,
    shouldRetry = isRetryableDatabaseError,
  } = {},
) {
  if (typeof operation !== "function") {
    throw new TypeError("operation must be a function");
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError("maxAttempts must be a positive integer");
  }

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error)) throw error;

      const delayMs = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      logger.warn?.(
        `PostgreSQL initialization retry ${attempt}/${maxAttempts - 1} in ${delayMs}ms (code=${getErrorCode(error) ?? "unknown"})`,
      );
      await sleep(delayMs);
    }
  }
}

const TRANSIENT_CODES = new Set([
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "57P01", "57P02", "57P03",
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH",
  "ENETUNREACH", "EPIPE",
]);

export function isTransientDatabaseError(error) {
  const code = error?.code ?? error?.cause?.code;
  return typeof code === "string" &&
    (TRANSIENT_CODES.has(code) || code.startsWith("08"));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runWithDatabaseRetry(
  operation,
  {
    maxAttempts = 3,
    baseDelayMs = 500,
    maxDelayMs = 2000,
    sleepFn = sleep,
  } = {},
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === maxAttempts) {
        throw error;
      }
      const delay = Math.min(baseDelayMs * (2 ** (attempt - 1)), maxDelayMs);
      await sleepFn(delay);
    }
  }
  throw lastError;
}

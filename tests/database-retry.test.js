import test from "node:test";
import assert from "node:assert/strict";
import { isRetryableDatabaseError, runWithDatabaseRetry } from "../database-retry.js";

test("retries transient connection errors and then succeeds", async () => {
  let calls = 0;
  const delays = [];
  const result = await runWithDatabaseRetry(async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error("connection reset");
      error.code = "ECONNRESET";
      throw error;
    }
    return "ready";
  }, { sleep: async (ms) => delays.push(ms), logger: { warn() {} } });

  assert.equal(result, "ready");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("does not retry non-transient SQL errors", async () => {
  let calls = 0;
  const error = new Error("syntax error");
  error.code = "42601";
  await assert.rejects(runWithDatabaseRetry(async () => {
    calls += 1;
    throw error;
  }, { sleep: async () => {}, logger: { warn() {} } }), (actual) => actual === error);
  assert.equal(calls, 1);
});

test("stops after maximum attempts", async () => {
  let calls = 0;
  const delays = [];
  const error = new Error("database unavailable");
  error.code = "57P03";
  await assert.rejects(runWithDatabaseRetry(async () => {
    calls += 1;
    throw error;
  }, {
    maxAttempts: 3,
    sleep: async (ms) => delays.push(ms),
    logger: { warn() {} },
  }), (actual) => actual === error);

  assert.equal(calls, 3);
  assert.deepEqual(delays, [500, 1000]);
});

test("recognizes wrapped network errors and rejects unknown errors", () => {
  assert.equal(isRetryableDatabaseError({ cause: { code: "ETIMEDOUT" } }), true);
  assert.equal(isRetryableDatabaseError({ code: "42601" }), false);
  assert.equal(isRetryableDatabaseError(new Error("unknown")), false);
});

test("validates retry configuration", async () => {
  await assert.rejects(
    runWithDatabaseRetry(async () => "unused", { maxAttempts: 0 }),
    /maxAttempts must be a positive integer/,
  );
});

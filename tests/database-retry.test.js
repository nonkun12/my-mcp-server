import test from "node:test";
import assert from "node:assert/strict";
import { isTransientDatabaseError, runWithDatabaseRetry } from "../database-retry.js";

test("transient PostgreSQL connection errors are retryable", () => {
  assert.equal(isTransientDatabaseError({ code: "08006" }), true);
  assert.equal(isTransientDatabaseError({ cause: { code: "ECONNRESET" } }), true);
  assert.equal(isTransientDatabaseError({ code: "23505" }), false);
});

test("database initialization retries transient failures within the bound", async () => {
  let attempts = 0;
  const delays = [];
  const result = await runWithDatabaseRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw Object.assign(new Error("temporary"), { code: "08006" });
    return "ready";
  }, {
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 200,
    sleepFn: async (ms) => delays.push(ms),
  });
  assert.equal(result, "ready");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});

test("non-transient errors fail immediately", async () => {
  let attempts = 0;
  await assert.rejects(
    runWithDatabaseRetry(async () => {
      attempts += 1;
      throw Object.assign(new Error("schema error"), { code: "42601" });
    }, { sleepFn: async () => {} }),
    /schema error/,
  );
  assert.equal(attempts, 1);
});

test("retry stops after the configured maximum", async () => {
  let attempts = 0;
  await assert.rejects(
    runWithDatabaseRetry(async () => {
      attempts += 1;
      throw Object.assign(new Error("offline"), { code: "08006" });
    }, { maxAttempts: 3, sleepFn: async () => {} }),
    /offline/,
  );
  assert.equal(attempts, 3);
});

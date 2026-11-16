import test from "node:test";
import assert from "node:assert/strict";
import {
  createLivenessHandler,
  createReadinessHandler,
  createDatabaseReadyMiddleware,
} from "../health.js";

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("liveness remains 200 independently of database state", () => {
  const response = createResponse();
  createLivenessHandler()({}, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, "alive");
});

test("readiness is 503 until schema initialization completes", async () => {
  const response = createResponse();
  const handler = createReadinessHandler(
    { async query() { throw new Error("must not query"); } },
    () => false,
    { error() {} },
  );
  await handler({}, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.checks.database, "initializing");
});

test("readiness returns 200 when database is initialized and responds", async () => {
  const calls = [];
  const response = createResponse();
  const handler = createReadinessHandler(
    { async query(config) { calls.push(config); return { rows: [{ value: 1 }] }; } },
    () => true,
    { error() {} },
  );
  await handler({}, response);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{ text: "SELECT 1", query_timeout: 3000 }]);
});

test("readiness returns 503 when database query fails", async () => {
  const response = createResponse();
  const handler = createReadinessHandler(
    { async query() { throw new Error("private database details"); } },
    () => true,
    { error() {} },
  );
  await handler({}, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.body.checks.database, "error");
  assert.equal(JSON.stringify(response.body).includes("private"), false);
});

test("MCP readiness middleware blocks requests before database initialization", () => {
  const response = createResponse();
  let nextCalled = false;
  createDatabaseReadyMiddleware(() => false)({}, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 503);
  assert.equal(nextCalled, false);
});

test("MCP readiness middleware allows requests after database initialization", () => {
  let nextCalled = false;
  createDatabaseReadyMiddleware(() => true)({}, createResponse(), () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

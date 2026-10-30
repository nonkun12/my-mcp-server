import test from "node:test";
import assert from "node:assert/strict";
import { createHealthHandler } from "../health.js";

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("health handler returns 200 when PostgreSQL responds", async () => {
  const calls = [];
  const db = {
    async query(config) {
      calls.push(config);
      return { rows: [{ "?column?": 1 }] };
    },
  };
  const response = createResponse();

  await createHealthHandler(db, { error() {} })({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    service: "memory-mcp-server",
    checks: { database: "ok" },
  });
  assert.deepEqual(calls, [{ text: "SELECT 1", query_timeout: 3000 }]);
});

test("health handler returns 503 when PostgreSQL query fails", async () => {
  const expectedError = new Error("database unavailable");
  const logged = [];
  const db = {
    async query() {
      throw expectedError;
    },
  };
  const response = createResponse();

  await createHealthHandler(db, {
    error(...args) {
      logged.push(args);
    },
  })({}, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    ok: false,
    service: "memory-mcp-server",
    checks: { database: "error" },
  });
  assert.equal(logged.length, 1);
  assert.equal(logged[0][1], expectedError);
});

test("health handler returns 503 when database check stalls", async () => {
  const logged = [];
  const db = {
    query() {
      return new Promise(() => {});
    },
  };
  const response = createResponse();

  await createHealthHandler(
    db,
    { error(...args) { logged.push(args); } },
    5,
  )({}, response);

  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, {
    ok: false,
    service: "memory-mcp-server",
    checks: { database: "error" },
  });
  assert.equal(logged.length, 1);
  assert.match(logged[0][1].message, /timed out/);
});

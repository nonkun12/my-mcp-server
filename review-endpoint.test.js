import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { attachReviewEndpoint } from "./review-endpoint.js";

const TEST_KEY = "test-only-pr-review-key-at-least-32-characters";
let server;
let baseUrl;

test.before(async () => {
  process.env.PR_REVIEW_API_KEY = TEST_KEY;
  const app = express();
  app.use(express.json());
  attachReviewEndpoint(app);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}/review-mcp`;
});

test.after(async () => {
  if (server) {
    server.close();
    await once(server, "close");
  }
  delete process.env.PR_REVIEW_API_KEY;
});

test("rejects missing API key", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.message, "Unauthorized");
});

test("rejects incorrect API key", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "wrong-key" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  assert.equal(response.status, 401);
  const body = await response.json();
  assert.equal(body.error.message, "Unauthorized");
});

test("fails closed if the dedicated API key is not configured", async () => {
  delete process.env.PR_REVIEW_API_KEY;
  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": TEST_KEY },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error.message, "PR review authentication is not configured");
  } finally {
    process.env.PR_REVIEW_API_KEY = TEST_KEY;
  }
});

test("valid API key reaches the MCP protocol handler", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-api-key": TEST_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "review-endpoint-test", version: "1.0.0" },
      },
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, 1);
  assert.equal(body.result.serverInfo.name, "line-bot-read-only-pr-review");
  assert.equal(body.result.capabilities.tools !== undefined, true);
});

test("does not expose arbitrary write tools", async () => {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "x-api-key": TEST_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.result.tools.map((tool) => tool.name), ["get_pr_review_bundle"]);
});

test("blocks a stale expected head SHA before fetching diff or CI", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    assert.match(String(url), /\/repos\/nonkun12\/line-bot\/pulls\/809$/);
    return new Response(JSON.stringify({
      number: 809,
      state: "open",
      merged: false,
      head: { sha: "b".repeat(40) },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": TEST_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "get_pr_review_bundle",
          arguments: { pr_number: 809, expected_head_sha: "a".repeat(40) },
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const payload = JSON.parse(body.result.content[0].text);
    assert.equal(payload.status, "BLOCKED");
    assert.equal(payload.reason, "head_sha_mismatch");
    assert.equal(calls.length, 1, "must not fetch diff or CI after SHA mismatch");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

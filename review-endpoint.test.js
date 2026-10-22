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

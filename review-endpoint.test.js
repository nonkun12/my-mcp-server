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

test("returns a complete bundle only for the matching SHA with green CI", async () => {
  const originalFetch = globalThis.fetch;
  const sha = "e".repeat(40);
  let prReads = 0;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/repos/nonkun12/line-bot/pulls/809")) {
      prReads += 1;
      return new Response(JSON.stringify({
        number: 809, title: "review test", html_url: "https://github.com/nonkun12/line-bot/pull/809",
        state: "open", merged: false, draft: true,
        head: { sha }, base: { sha: "f".repeat(40) },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.endsWith("/repos/nonkun12/line-bot/pulls/809/files?per_page=100&page=1")) {
      return new Response(JSON.stringify([{
        filename: "example.js", status: "modified", additions: 1, deletions: 1,
        patch: "@@ -1 +1 @@\\n-old\\n+new",
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.endsWith(`/repos/nonkun12/line-bot/commits/${sha}/check-runs?per_page=100`)) {
      return new Response(JSON.stringify({
        total_count: 1,
        check_runs: [{ name: "check", status: "completed", conclusion: "success", details_url: "https://github.com/actions" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.endsWith(`/repos/nonkun12/line-bot/commits/${sha}/status`)) {
      return new Response(JSON.stringify({
        total_count: 1,
        statuses: [{ context: "legacy-check", state: "success", target_url: "https://github.com/status" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected mocked URL: ${target}`);
  };

  try {
    const response = await originalFetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": TEST_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "get_pr_review_bundle",
          arguments: { pr_number: 809, expected_head_sha: sha },
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const payload = JSON.parse(body.result.content[0].text);
    assert.equal(payload.status, "READY_FOR_REVIEW");
    assert.equal(payload.ci.gate, "GREEN");
    assert.equal(payload.pull_request.head_sha, sha);
    assert.equal(payload.changed_files[0].filename, "example.js");
    assert.equal(payload.safety.merge_or_deploy_performed, false);
    assert.equal(prReads, 2, "must recheck PR head SHA after gathering evidence");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("blocks when combined status checks are truncated", async () => {
  const originalFetch = globalThis.fetch;
  const sha = "c".repeat(40);
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.endsWith("/repos/nonkun12/line-bot/pulls/809")) {
      return new Response(JSON.stringify({
        number: 809, title: "test", html_url: "https://github.com/nonkun12/line-bot/pull/809",
        state: "open", merged: false, draft: true,
        head: { sha }, base: { sha: "d".repeat(40) },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.endsWith("/repos/nonkun12/line-bot/pulls/809/files?per_page=100&page=1")) {
      return new Response(JSON.stringify([{
        filename: "example.js", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@"
      }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.endsWith(`/repos/nonkun12/line-bot/commits/${sha}/check-runs?per_page=100`)) {
      return new Response(JSON.stringify({
        total_count: 1,
        check_runs: [{ name: "check", status: "completed", conclusion: "success", details_url: "https://github.com/" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (target.endsWith(`/repos/nonkun12/line-bot/commits/${sha}/status`)) {
      return new Response(JSON.stringify({
        total_count: 2,
        statuses: [{ context: "one", state: "success", target_url: "https://github.com/" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected mocked URL: ${target}`);
  };

  try {
    const response = await originalFetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "x-api-key": TEST_KEY,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "get_pr_review_bundle",
          arguments: { pr_number: 809, expected_head_sha: sha },
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    const payload = JSON.parse(body.result.content[0].text);
    assert.equal(payload.status, "BLOCKED");
    assert.equal(payload.reason, "ci_evidence_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
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
    const response = await originalFetch(baseUrl, {
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

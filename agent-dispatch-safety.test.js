import assert from "node:assert/strict";
import test from "node:test";
import { AgentDispatchQueue, MAX_QUEUE_SIZE } from "./agent-dispatch-queue.js";
import { safeText } from "./tools/agent-dispatch.js";

const job = (id) => ({
  id,
  role: "implementer",
  instruction: `run ${id}`,
  resources: [id],
  dependsOn: [],
});

test("caps the in-memory dispatch queue", () => {
  const queue = new AgentDispatchQueue();
  for (let index = 0; index < MAX_QUEUE_SIZE; index += 1) {
    queue.enqueue(job(`job-${index}`));
  }
  assert.equal(queue.list().length, MAX_QUEUE_SIZE);
  assert.throws(() => queue.enqueue(job("overflow")), /queue limit exceeded/);
});

test("normalizes text and rejects invisible or bidi controls", () => {
  assert.equal(safeText(16).parse("ＡＢＣ"), "ABC");
  assert.throws(() => safeText(16).parse("ok\u200Bvalue"), /invisible/);
  assert.throws(() => safeText(16).parse("ok\u202Evalue"), /bidi/);
});

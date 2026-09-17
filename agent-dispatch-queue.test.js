import assert from "node:assert/strict";
import test from "node:test";
import { AgentDispatchQueue, validateGraph } from "./agent-dispatch-queue.js";

const job = (id, role = "implementer", resources = [id], dependsOn = []) => ({
  id,
  role,
  instruction: `run ${id}`,
  resources,
  dependsOn,
});

test("rejects duplicate ids, missing dependencies, and cycles", () => {
  const queue = new AgentDispatchQueue();
  queue.enqueue(job("a"));
  assert.throws(() => queue.enqueue(job("a")), /duplicate job id/);
  assert.throws(() => queue.enqueue(job("b", "tester", ["b"], ["missing"])), /missing dependency/);
  assert.throws(() => validateGraph([
    { ...job("x"), dependsOn: ["y"] },
    { ...job("y"), dependsOn: ["x"] },
  ]), /dependency cycle/);
});

test("reserves only after dependencies succeed and prevents resource races", () => {
  const queue = new AgentDispatchQueue();
  queue.enqueue(job("impl", "implementer", ["shared.js"]));
  queue.enqueue(job("test", "tester", ["shared.js"], ["impl"]));
  assert.equal(queue.tryReserve("test"), null);
  assert.ok(queue.tryReserve("impl"));
  assert.equal(queue.tryReserve("test"), null);
  queue.complete("impl", "succeeded");
  assert.ok(queue.tryReserve("test"));
  assert.equal(queue.tryReserve("test"), null);
});

test("failed dependencies cancel downstream work", () => {
  const queue = new AgentDispatchQueue();
  queue.enqueue(job("impl"));
  queue.enqueue(job("test", "tester", ["test"], ["impl"]));
  assert.ok(queue.tryReserve("impl"));
  queue.complete("impl", "failed");
  assert.equal(queue.get("impl").state, "queued");
  assert.equal(queue.get("test").state, "queued");
  assert.ok(queue.tryReserve("impl"));
  queue.complete("impl", "failed");
  assert.equal(queue.get("impl").state, "queued");
  assert.ok(queue.tryReserve("impl"));
  queue.complete("impl", "failed");
  assert.equal(queue.get("impl").state, "failed");
  assert.equal(queue.get("test").state, "cancelled");
});

test("successful jobs reach terminal state and invalid completion is rejected", () => {
  const queue = new AgentDispatchQueue();
  queue.enqueue(job("a"));
  assert.ok(queue.tryReserve("a"));
  assert.throws(() => queue.complete("a", "cancelled"), /invalid outcome/);
  queue.complete("a", "succeeded");
  assert.equal(queue.get("a").state, "succeeded");
  assert.equal(queue.cancel("a"), null);
});

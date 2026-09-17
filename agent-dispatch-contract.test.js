import assert from "node:assert/strict";
import test from "node:test";
import { canRun, createAgentJob, isActive, isTerminal, nextAttempt, MAX_ATTEMPTS, ROLES } from "./agent-dispatch-contract.js";

test("exposes the six bounded agent roles", () => {
  assert.deepEqual(ROLES, ["manager", "implementer", "tester", "reviewer", "repairer", "integrator"]);
  assert.equal(MAX_ATTEMPTS, 3);
});

test("creates immutable bounded jobs", () => {
  const job = createAgentJob({
    id: "impl-1",
    role: "implementer",
    instruction: "Implement the isolated change",
    resources: ["src/a.js"],
    dependsOn: [],
  });
  assert.equal(job.attempt, 0);
  assert.ok(Object.isFrozen(job));
  assert.throws(() => createAgentJob({ id: "", role: "tester", instruction: "x" }));
  assert.throws(() => createAgentJob({ id: "x", role: "unknown", instruction: "x" }));
  assert.throws(() => createAgentJob({ id: "x", role: "tester", instruction: "x", attempt: 3 }));
  assert.throws(() => createAgentJob({ id: "x", role: "tester", instruction: "x", dependsOn: [1] }));
});

test("enforces bounded retry progression", () => {
  const job = createAgentJob({ id: "impl-1", role: "implementer", instruction: "Implement", resources: ["src/a.js"] });
  const retry1 = nextAttempt(job);
  const retry2 = nextAttempt(retry1);
  assert.equal(retry1.attempt, 1);
  assert.equal(retry2.attempt, 2);
  assert.equal(nextAttempt(retry2), null);
  assert.equal(canRun(retry2, []), true);
});

test("only runs jobs whose dependencies are complete and resources are free", () => {
  const job = createAgentJob({ id: "test-1", role: "tester", instruction: "test", resources: ["src/a.js"], dependsOn: ["impl-1"] });
  assert.equal(canRun(job, []), false);
  assert.equal(canRun(job, ["impl-1"]), true);
  assert.equal(canRun(job, ["impl-1"], [{ resources: ["src/a.js"] }]), false);
  assert.equal(canRun(job, ["impl-1"], [{ resources: ["src/b.js"] }]), true);
});

test("recognizes bounded lifecycle states", () => {
  assert.equal(isActive("queued"), true);
  assert.equal(isActive("running"), true);
  assert.equal(isTerminal("succeeded"), true);
  assert.equal(isTerminal("failed"), true);
  assert.equal(isTerminal("cancelled"), true);
  assert.equal(isTerminal("running"), false);
});

import assert from "node:assert/strict";
import test from "node:test";
import { canRun, createAgentJob, isActive, isTerminal, ROLES } from "./agent-dispatch-contract.js";

test("exposes the six bounded agent roles", () => {
  assert.deepEqual(ROLES, ["manager", "implementer", "tester", "reviewer", "repairer", "integrator"]);
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

import test from "node:test";
import assert from "node:assert/strict";
import { logReminderBatchSummary } from "../reminder-batch-log.js";

test("logs one count-only summary for a non-empty batch", () => {
  const messages = [];
  logReminderBatchSummary(456, { info: (message) => messages.push(message) });

  assert.equal(messages.length, 1);
  assert.match(messages[0], /456件/);
  assert.match(messages[0], /個別ログ省略/);
  assert.doesNotMatch(messages[0], /reminder id=/);
});

test("does not log when there are no due reminders", () => {
  const messages = [];
  logReminderBatchSummary(0, { info: (message) => messages.push(message) });
  assert.deepEqual(messages, []);
});

test("rejects invalid counts", () => {
  assert.throws(() => logReminderBatchSummary(-1, { info() {} }), /non-negative integer/);
  assert.throws(() => logReminderBatchSummary(1.5, { info() {} }), /non-negative integer/);
});

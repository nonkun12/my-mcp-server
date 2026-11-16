import test from "node:test";
import assert from "node:assert/strict";
import { startReminderScheduler } from "../reminder-scheduler.js";

function fakeTimers() {
  const timers = [];
  return {
    timers,
    schedule(callback, delay) {
      const timer = { callback, delay, cancelled: false };
      timers.push(timer);
      return timer;
    },
    cancel(timer) {
      timer.cancelled = true;
    },
  };
}

test("scheduler stays disabled unless explicitly enabled", () => {
  const timers = fakeTimers();
  let calls = 0;
  const logs = [];

  const stop = startReminderScheduler({
    check: async () => { calls += 1; },
    schedule: timers.schedule,
    cancel: timers.cancel,
    logger: { info: (message) => logs.push(message) },
  });

  assert.equal(timers.timers.length, 0);
  assert.equal(calls, 0);
  assert.equal(logs.length, 1);
  stop();
});

test("scheduler waits for each check to finish before scheduling the next run", async () => {
  const timers = fakeTimers();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => { release = resolve; });

  const stop = startReminderScheduler({
    enabled: true,
    check: async () => {
      calls += 1;
      if (calls === 1) await pending;
    },
    intervalMs: 1234,
    schedule: timers.schedule,
    cancel: timers.cancel,
    logger: { error() {} },
  });

  assert.equal(timers.timers.length, 1);
  assert.equal(timers.timers[0].delay, 1234);

  const firstRun = timers.timers[0].callback();
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(timers.timers.length, 1);

  release();
  await firstRun;
  assert.equal(timers.timers.length, 2);
  stop();
  assert.equal(timers.timers[1].cancelled, true);
});

test("scheduler logs a failed check and continues without overlapping", async () => {
  const timers = fakeTimers();
  const errors = [];
  const failure = new Error("temporary DB outage");

  startReminderScheduler({
    enabled: true,
    check: async () => { throw failure; },
    schedule: timers.schedule,
    cancel: timers.cancel,
    logger: { error: (...args) => errors.push(args) },
  });

  await timers.timers[0].callback();
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1], failure);
  assert.equal(timers.timers.length, 2);
});

export function startReminderScheduler({
  enabled = false,
  check,
  intervalMs = 60_000,
  logger = console,
  schedule = setTimeout,
  cancel = clearTimeout,
} = {}) {
  if (typeof check !== "function") {
    throw new TypeError("check must be a function");
  }

  if (!enabled) {
    logger.info?.("リマインダー・スケジューラーは明示的な有効化がないため停止中です");
    return () => {};
  }

  let stopped = false;
  let timer;

  const run = async () => {
    if (stopped) return;

    try {
      await check();
    } catch (error) {
      logger.error?.("リマインダー処理で予期しないエラー:", error);
    } finally {
      if (!stopped) {
        timer = schedule(run, intervalMs);
        timer?.unref?.();
      }
    }
  };

  timer = schedule(run, intervalMs);
  timer?.unref?.();

  return () => {
    stopped = true;
    if (timer !== undefined) cancel(timer);
  };
}

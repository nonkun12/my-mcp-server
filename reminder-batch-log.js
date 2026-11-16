export function logReminderBatchSummary(
  count,
  logger = console,
) {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("count must be a non-negative integer");
  }
  if (count === 0) return;

  logger.info?.(
    `[TEST] LINE送信停止中: 期限超過リマインダー ${count}件（個別ログ省略）`,
  );
}

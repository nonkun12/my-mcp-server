import { registerMemoryTools } from "./memory.js";
import { registerReminderTools } from "./reminder.js";

// 新しいツールを追加するときはここに1行足す。
// 例: import { registerCalendarTools } from "./calendar.js";
const TOOL_REGISTRARS = [
  registerMemoryTools,
  registerReminderTools
  // registerCalendarTools,
  // registerSearchTools,
];

export function registerAllTools(server) {
  for (const register of TOOL_REGISTRARS) {
    register(server);
  }
}
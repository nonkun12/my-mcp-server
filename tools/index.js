import { registerMemoryTools } from "./memory.js";
import { registerReminderTools } from "./reminder.js";
import { registerNoteTools } from "./notes.js";

// MCPツール登録一覧
// 新しいツールを追加するときはここへ追加する
const TOOL_REGISTRARS = [
  registerMemoryTools,
  registerReminderTools,
  registerNoteTools
];


export function registerAllTools(server) {
  for (const register of TOOL_REGISTRARS) {
    register(server);
  }
}
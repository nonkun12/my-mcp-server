import { registerMemoryTools } from "./memory.js";
import { registerReminderTools } from "./reminder.js";
import { registerSaveNoteTool } from "./save-note.js";
import { registerListNotesTool } from "./list-notes.js";
import { registerDeleteNoteTool } from "./delete-note.js";
import { registerDeleteAllNotesTool } from "./delete-all-notes.js";

// MCPツール登録一覧
// 新しいツールを追加するときはここへ追加する
const TOOL_REGISTRARS = [
  registerMemoryTools,
  registerReminderTools,
  registerSaveNoteTool,
  registerSearchNotesTool,
  registerListNotesTool,
  registerDeleteNoteTool,
  registerDeleteAllNotesTool
];


export function registerAllTools(server) {
  for (const register of TOOL_REGISTRARS) {
    register(server);
  }
}
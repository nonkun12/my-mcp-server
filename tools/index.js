import { registerMemoryTools } from "./memory.js";
import { registerReminderTools } from "./reminder.js";
import { registerSaveNoteTool } from "./save-note.js";

const TOOL_REGISTRARS = [
  registerMemoryTools,
  registerReminderTools,
  registerSaveNoteTool
];

export function registerAllTools(server) {
  for (const register of TOOL_REGISTRARS) {
    register(server);
  }
}

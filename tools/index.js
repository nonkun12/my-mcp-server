import { registerMemoryTools } from "./memory.js";
import { registerReminderTools } from "./reminder.js";
import { registerSaveNoteTool } from "./save-note.js";
import { registerSearchNotesTool } from "./search-notes.js";
import { registerListNotesTool } from "./list-notes.js";
import { registerDeleteNoteTool } from "./delete-note.js";
import { registerDeleteAllNotesTool } from "./delete-all-notes.js";


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

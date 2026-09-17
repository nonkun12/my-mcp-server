import { z } from "zod";
import { PersistentAgentDispatchQueue } from "../agent-dispatch-store.js";
import {
  MAX_ID,
  MAX_INSTRUCTION,
  MAX_ITEMS,
  UNSAFE_CHARS,
  safeText,
  resourcesSchema,
  dependsOnSchema,
} from "../agent-dispatch-validation.js";

const dispatchQueue = new PersistentAgentDispatchQueue();

export function registerAgentDispatchTools(server) {
  server.registerTool(
    "agent_dispatch_enqueue",
    {
      title: "Enqueue Agent Job",
      description: "分散AIのジョブをPostgreSQL永続Dispatch Queueへ安全に登録します。実エージェントは起動しません。",
      inputSchema: {
        id: safeText(MAX_ID),
        role: z.enum(["manager", "implementer", "tester", "reviewer", "repairer", "integrator"]),
        instruction: safeText(MAX_INSTRUCTION),
        resources: resourcesSchema.optional(),
        dependsOn: dependsOnSchema.optional(),
      },
    },
    async ({ id, role, instruction, resources = [], dependsOn = [] }) => {
      try {
        const job = await dispatchQueue.enqueue({ id, role, instruction, resources, dependsOn });
        return { content: [{ type: "text", text: JSON.stringify(job) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `dispatch enqueue error: ${error.message}` }] };
      }
    }
  );

  server.registerTool(
    "agent_dispatch_get",
    {
      title: "Get Agent Job",
      description: "分散AIジョブの現在状態をPostgreSQLから取得します。",
      inputSchema: { id: safeText(MAX_ID) },
    },
    async ({ id }) => ({
      content: [{ type: "text", text: JSON.stringify(await dispatchQueue.get(id)) }],
    })
  );

  server.registerTool(
    "agent_dispatch_list",
    {
      title: "List Agent Jobs",
      description: "分散AI Dispatch Queueのジョブ状態をPostgreSQLから一覧取得します。",
      inputSchema: { state: safeText(32).optional() },
    },
    async ({ state }) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(await dispatchQueue.list(state ?? null)) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `dispatch list error: ${error.message}` }] };
      }
    }
  );
}

export { dispatchQueue, safeText, UNSAFE_CHARS };

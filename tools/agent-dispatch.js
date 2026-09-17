import { z } from "zod";
import { AgentDispatchQueue } from "../agent-dispatch-queue.js";

const MAX_ID = 128;
const MAX_INSTRUCTION = 4000;
const MAX_ITEMS = 32;

const dispatchQueue = new AgentDispatchQueue();

const safeText = (max) => z.string().trim().min(1).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "control characters are not allowed");
const resourcesSchema = z.array(safeText(256)).max(MAX_ITEMS);
const dependsOnSchema = z.array(safeText(MAX_ID)).max(MAX_ITEMS);

export function registerAgentDispatchTools(server) {
  server.registerTool(
    "agent_dispatch_enqueue",
    {
      title: "Enqueue Agent Job",
      description: "分散AIのジョブを安全なローカルDispatch Queueへ登録します。実エージェントは起動しません。",
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
        const job = dispatchQueue.enqueue({ id, role, instruction, resources, dependsOn });
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
      description: "分散AIジョブの現在状態を取得します。",
      inputSchema: { id: safeText(MAX_ID) },
    },
    async ({ id }) => ({
      content: [{ type: "text", text: JSON.stringify(dispatchQueue.get(id)) }],
    })
  );

  server.registerTool(
    "agent_dispatch_list",
    {
      title: "List Agent Jobs",
      description: "分散AI Dispatch Queueのジョブ状態を一覧取得します。",
      inputSchema: { state: safeText(32).optional() },
    },
    async ({ state }) => {
      try {
        return { content: [{ type: "text", text: JSON.stringify(dispatchQueue.list(state ?? null)) }] };
      } catch (error) {
        return { content: [{ type: "text", text: `dispatch list error: ${error.message}` }] };
      }
    }
  );
}

export { dispatchQueue };

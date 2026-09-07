import { z } from "zod";
import db from "../database.js";

export function registerAdminListNotesTool(server) {
  server.registerTool(
    "admin_list_notes",
    {
      title: "Admin List Notes",
      description: "メモのuser_id確認用の一時管理ツール",
      inputSchema: {
        secret: z.string().describe("管理用シークレット")
      }
    },
    async ({ secret }) => {
      if (secret !== process.env.MCP_API_KEY) {
        return { content: [{ type: "text", text: "認証エラー" }] };
      }

      try {
        const result = await db.query(`
          SELECT id, user_id, title, body, category, created_at
          FROM notes
          ORDER BY id ASC
        `);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "取得エラー: " + error.message
            }
          ]
        };
      }
    }
  );
}

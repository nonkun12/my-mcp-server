import { z } from "zod";
import db from "../database.js";

export function registerListNotesTool(server) {
  server.registerTool(
    "list_notes",
    {
      title: "List Notes",
      description: "ユーザーのメモ一覧を取得します",
      inputSchema: {
        user_id: z.string().describe("LINEユーザーID")
      }
    },
    async ({ user_id }) => {
      try {
        const result = await db.query(
          `
          SELECT id, title, body, category, created_at
          FROM notes
          WHERE user_id = $1
          ORDER BY created_at DESC
          `,
          [user_id]
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        };

      } catch (error) {
        console.error("LIST NOTES FAILED:", error instanceof Error ? error.name : "UnknownError");

        return {
          content: [
            {
              type: "text",
              text: "メモ一覧の取得に失敗しました。"
            }
          ]
        };
      }
    }
  );
}

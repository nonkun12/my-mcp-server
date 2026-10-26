import { z } from "zod";
import db from "../database.js";

export function registerDeleteAllNotesTool(server) {
  server.registerTool(
    "delete_all_notes",
    {
      title: "Delete All Notes",
      description: "ユーザーのすべてのメモを削除します",
      inputSchema: {
        user_id: z.string().min(1).max(200).describe("LINEユーザーID")
      }
    },
    async ({ user_id }) => {
      try {
        const result = await db.query(
          `
          DELETE FROM notes
          WHERE user_id = $1
          `,
          [user_id]
        );

        return {
          content: [
            {
              type: "text",
              text: `すべてのメモ（計 ${result.rowCount} 件）を削除しました。`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "メモの削除に失敗しました。"
            }
          ]
        };
      }
    }
  );
}

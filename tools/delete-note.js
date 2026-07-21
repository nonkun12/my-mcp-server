import { z } from "zod";
import db from "../database.js";

export function registerDeleteNoteTool(server) {
  server.registerTool(
    "delete_note",
    {
      title: "Delete Note",
      description: "指定したIDのメモを削除します",
      inputSchema: {
        user_id: z.string().describe("LINEユーザーID"),
        id: z.coerce.number().describe("削除するメモのID")
      }
    },
    async ({ user_id, id }) => {
      try {
        const result = await db.query(
          `
          DELETE FROM notes
          WHERE id = $1 AND user_id = $2
          `,
          [id, user_id]
        );

        if (result.rowCount === 0) {
          return {
            content: [
              {
                type: "text",
                text: `ID:${id} のメモが見つからないか、削除できませんでした。`
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `メモ(ID:${id})を削除しました。`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "削除エラー: " + error.message
            }
          ]
        };
      }
    }
  );
}

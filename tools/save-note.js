import { z } from "zod";
import db from "../database.js";

export function registerSaveNoteTool(server) {
  server.registerTool(
    "save_note",
    {
      title: "Save Note",
      description: "ユーザーのメモを保存します",
      inputSchema: {
        user_id: z.string().describe("LINEユーザーID"),
        title: z.string().describe("メモタイトル"),
        body: z.string().describe("メモ内容"),
        category: z.string().optional().describe("メモカテゴリ")
      }
    },
    async ({ user_id, title, body, category = "一般" }) => {

      console.log("===== SAVE_NOTE TOOL CALLED =====");
      console.log({
        user_id,
        title,
        body,
        category
      });

      try {
        console.log("SAVE NOTE:", {
          user_id,
          title,
          body,
          category
        });

        const result = await db.query(
          `
          INSERT INTO notes (user_id, title, body, category)
          VALUES ($1, $2, $3, $4)
          RETURNING *
          `,
          [user_id, title, body, category]
        );

        console.log("SAVE RESULT:", result.rows);

        return {
          content: [
            {
              type: "text",
              text: "メモを保存しました。"
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "保存エラー: " + error.message
            }
          ]
        };
      }
    }
  );
}

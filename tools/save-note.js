import { z } from "zod";
import db from "../database.js";

export function registerSaveNoteTool(server) {
  server.registerTool(
    "save_note",
    {
      title: "Save Note",
      description: "ユーザーのメモを保存します",
      inputSchema: {
        user_id: z.string().min(1).max(200).describe("LINEユーザーID"),
        title: z.string().min(1).max(200).describe("メモタイトル"),
        body: z.string().min(1).max(10000).describe("メモ内容"),
        category: z.string().max(100).optional().describe("メモカテゴリ")
      }
    },
    async ({ user_id, title, body, category = "一般" }) => {

      try {
        const duplicate = await db.query(
          `
          SELECT id FROM notes
          WHERE user_id = $1
          AND body = $2
          LIMIT 1
          `,
          [user_id, body]
        );

        if (duplicate.rows.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: "同じ内容のメモが既にあります。"
              }
            ]
          };
        }

        const result = await db.query(
          `
          INSERT INTO notes (user_id, title, body, category)
          VALUES ($1, $2, $3, $4)
          RETURNING *
          `,
          [user_id, title, body, category]
        );

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
              text: "メモの保存に失敗しました。"
            }
          ]
        };
      }
    }
  );
}

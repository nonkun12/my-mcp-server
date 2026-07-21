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

    async ({ user_id }) {

      console.log("===== LIST NOTES TOOL CALLED =====");
      console.log({ user_id });

      try {

        const result = await db.query(
          `
          SELECT id, title, body, category, created_at
          FROM notes
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 10
          `,
          [user_id]
        );


        console.log("LIST RESULT:", result.rows);

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "メモはありません。"
              }
            ]
          };
        }


        const text = result.rows.map((note, index) => {
          return `${index + 1}. ${note.title}\n${note.body}\n${note.created_at}`;
        }).join("\n\n");


        return {
          content: [
            {
              type: "text",
              text
            }
          ]
        };


      } catch(error) {

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

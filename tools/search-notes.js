import { z } from "zod";
import db from "../database.js";

export function registerSearchNotesTool(server) {
  server.registerTool(
    "search_notes",
    {
      title: "Search Notes",
      description: "メモをキーワードで検索します",
      inputSchema: {
        user_id: z.string().describe("LINEユーザーID"),
        keyword: z.string().describe("検索キーワード")
      }
    },
    async ({ user_id, keyword }) => {
      try {
        const result = await db.query(
          `
          SELECT id, title, body, category, created_at
          FROM notes
          WHERE user_id = $1
          AND (
            title ILIKE $2
            OR body ILIKE $2
            OR category ILIKE $2
          )
          ORDER BY id DESC
          `,
          [user_id, `%${keyword}%`]
        );

        if (result.rows.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "該当するメモはありません。"
              }
            ]
          };
        }

        const text = result.rows.map(
          n =>
`ID:${n.id}
タイトル:${n.title}
内容:${n.body}
カテゴリ:${n.category}`
        ).join("\n\n");

        return {
          content: [
            {
              type: "text",
              text
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "検索エラー: " + error.message
            }
          ]
        };
      }
    }
  );
}

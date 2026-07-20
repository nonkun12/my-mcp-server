import { z } from "zod";
import pool from "../database.js";

export function registerNoteTools(server) {

  // =========================
  // メモ保存
  // =========================
  server.tool(
    "save_note",
    "ユーザーのメモを保存する",
    {
      user_id: z.string().describe("LINEユーザーID"),
      title: z.string().describe("メモタイトル"),
      body: z.string().describe("メモ内容")
    },
    async ({ user_id, title, body }) => {

      await pool.query(
        `
        INSERT INTO notes
        (user_id, title, body)
        VALUES ($1, $2, $3)
        `,
        [
          user_id,
          title,
          body
        ]
      );

      return {
        content: [
          {
            type: "text",
            text: "メモを保存しました。"
          }
        ]
      };
    }
  );


  // =========================
  // メモ一覧
  // =========================
  server.tool(
    "list_notes",
    "保存したメモ一覧を取得する",
    {
      user_id: z.string().describe("LINEユーザーID")
    },
    async ({ user_id }) => {

      const result = await pool.query(
        `
        SELECT id, title, body, created_at
        FROM notes
        WHERE user_id=$1
        ORDER BY id DESC
        LIMIT 20
        `,
        [user_id]
      );


      if (result.rows.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "保存されたメモはありません。"
            }
          ]
        };
      }


      const text = result.rows.map(
        n =>
`ID:${n.id}
タイトル:${n.title}
内容:${n.body}
日時:${n.created_at}`
      ).join("\n\n");


      return {
        content:[
          {
            type:"text",
            text
          }
        ]
      };
    }
  );


  // =========================
  // メモ検索
  // =========================
  server.tool(
    "search_notes",
    "メモを検索する",
    {
      user_id: z.string().describe("LINEユーザーID"),
      keyword: z.string().describe("検索文字")
    },
    async ({ user_id, keyword }) => {

      const result = await pool.query(
        `
        SELECT id,title,body,created_at
        FROM notes
        WHERE user_id=$1
        AND (
          title ILIKE $2
          OR body ILIKE $2
        )
        ORDER BY id DESC
        `,
        [
          user_id,
          `%${keyword}%`
        ]
      );


      if(result.rows.length === 0){
        return {
          content:[
            {
              type:"text",
              text:"該当するメモはありません。"
            }
          ]
        };
      }


      const text=result.rows.map(
        n =>
`ID:${n.id}
タイトル:${n.title}
内容:${n.body}`
      ).join("\n\n");


      return {
        content:[
          {
            type:"text",
            text
          }
        ]
      };

    }
  );



  // =========================
  // メモ削除
  // =========================
  server.tool(
    "delete_note",
    "指定したIDのメモを削除する",
    {
      user_id: z.string().describe("LINEユーザーID"),
      id: z.string().describe("削除するメモID")
    },
    async ({ user_id, id }) => {

      console.log("DELETE CHECK:", id, user_id);

      const check = await pool.query(
        `
        SELECT id, user_id, title
        FROM notes
        WHERE id=$1
        `,
        [id]
      );

      console.log("DELETE TARGET:", check.rows);

      const result = await pool.query(
        `
        DELETE FROM notes
        WHERE id=$1
        AND user_id=$2
        `,
        [
          id,
          user_id
        ]
      );

      return {
        content:[
          {
            type:"text",
            text:`${result.rowCount}件削除しました`
          }
        ]
      };
    }
  );



  // =========================
  // 全メモ削除
  // =========================
  server.tool(
    "delete_all_notes",
    "ユーザーのメモを全部削除する",
    {
      user_id: z.string().describe("LINEユーザーID")
    },
    async ({ user_id }) => {

      const result = await pool.query(
        `
        DELETE FROM notes
        WHERE user_id=$1
        `,
        [user_id]
      );

      return {
        content:[
          {
            type:"text",
            text:`${result.rowCount}件削除しました`
          }
        ]
      };
    }
  );

}


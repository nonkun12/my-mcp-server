import { z } from "zod";
import pool from "../database.js";

// =================================
// memory系ツールの登録
// =================================
// save_memory / get_memory はどちらも user_id を必須パラメータとして受け取る。
// これにより、呼び出し元のクライアント(LINE Bot、将来のDiscord Botなど)が
// 独自の命名規則(keyにuser_idを前置する等)に頼らなくても、
// MCPサーバー側で確実にユーザーごとの記憶を分離できる。
export function registerMemoryTools(server) {

  server.registerTool(
    "save_memory",
    {
      title: "Save Memory",
      description: "特定ユーザーの情報をkey/valueの形でPostgresへ保存します",
      inputSchema: {
        user_id: z.string().describe("記憶の持ち主を識別するID(呼び出し元クライアントが指定)"),
        key: z.string(),
        value: z.string()
      }
    },

    async ({ user_id, key, value }) => {
      try {
        await pool.query(
          `
          INSERT INTO memories(user_id, key, value)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, key)
          DO UPDATE SET value = EXCLUDED.value
          `,
          [user_id, key, value]
        );

        return {
          content: [
            {
              type: "text",
              text: `保存しました ${key}=${value}`
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


  server.registerTool(
    "get_memory",
    {
      title: "Get Memory",
      description: "特定ユーザーの記憶をPostgresから取得します",
      inputSchema: {
        user_id: z.string().describe("記憶の持ち主を識別するID(呼び出し元クライアントが指定)"),
        key: z.string()
      }
    },

    async ({ user_id, key }) => {
      try {
        const result = await pool.query(
          `SELECT value FROM memories WHERE user_id = $1 AND key = $2`,
          [user_id, key]
        );

        if (result.rows.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: result.rows[0].value
              }
            ]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: "記憶がありません"
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



  server.registerTool(
    "delete_memory",
    {
      title: "Delete Memory",
      description: "特定ユーザーの記憶を削除します",
      inputSchema: {
        user_id: z.string(),
        key: z.string()
      }
    },

    async ({ user_id, key }) => {
      try {
        const result = await pool.query(
          `
          DELETE FROM memories
          WHERE user_id = $1 AND key = $2
          `,
          [user_id, key]
        );

        return {
          content: [
            {
              type: "text",
              text: `${result.rowCount}件削除しました`
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


  server.registerTool(
    "get_all_memory",
    {
      title: "Get All Memory",
      description: "ユーザーの全記憶を取得します",
      inputSchema: {
        user_id: z.string()
      }
    },

    async ({ user_id }) => {
      try {
        console.log("GET_ALL_MEMORY START:", user_id);

        const result = await pool.query(
          `
          SELECT key, value
          FROM memories
          WHERE user_id = $1
          ORDER BY key
          `,
          [user_id]
        );

        console.log("GET_ALL_MEMORY RESULT:", result.rows);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows)
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
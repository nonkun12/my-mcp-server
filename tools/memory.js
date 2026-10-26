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
        user_id: z.string().min(1).max(200).min(1).max(200).describe("記憶の持ち主を識別するID(呼び出し元クライアントが指定)"),
        key: z.string().min(1).max(200),
        value: z.string().max(10000),
        category: z.string().max(100).optional().default("general"),
        importance: z.string().max(32).optional().default("normal")
      }
    },

    async ({ user_id, key, value, category, importance }) => {
      try {
        await pool.query(
          `
          INSERT INTO memories(
            user_id,
            key,
            value,
            category,
            importance,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, NOW())
          ON CONFLICT (user_id, key)
          DO UPDATE SET
            value = EXCLUDED.value,
            category = EXCLUDED.category,
            importance = EXCLUDED.importance,
            updated_at = NOW()
          `,
          [user_id, key, value, category, importance]
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
              text: "記憶の保存に失敗しました。"
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
        user_id: z.string().min(1).max(200).min(1).max(200).describe("記憶の持ち主を識別するID(呼び出し元クライアントが指定)"),
        key: z.string()
      }
    },

    async ({ user_id, key }) => {
      try {
        const result = await pool.query(
          `
          SELECT
            key,
            value,
            category,
            importance,
            created_at,
            updated_at
          FROM memories
          WHERE user_id = $1 AND key = $2
          `,
          [user_id, key]
        );

        if (result.rows.length > 0) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result.rows[0])
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
              text: "記憶の取得に失敗しました。"
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
        user_id: z.string().min(1).max(200).min(1).max(200),
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
              text: "記憶の削除に失敗しました。"
            }
          ]
        };
      }
    }
  );


  server.registerTool(
    "delete_all_memory",
    {
      title: "Delete All Memory",
      description: "特定ユーザーの記憶を全て削除します",
      inputSchema: {
        user_id: z.string().min(1).max(200)
      }
    },

    async ({ user_id }) => {
      try {
        const result = await pool.query(
          `
          DELETE FROM memories
          WHERE user_id = $1
          `,
          [user_id]
        );

        return {
          content: [
            {
              type: "text",
              text: `${result.rowCount}件の記憶を削除しました`
            }
          ]
        };

      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: "記憶の処理に失敗しました。"
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
        user_id: z.string().min(1).max(200)
      }
    },

    async ({ user_id }) => {
      try {

        const result = await pool.query(
          `
          SELECT
            key,
            value,
            category,
            importance,
            created_at,
            updated_at
          FROM memories
          WHERE user_id = $1
          ORDER BY key
          `,
          [user_id]
        );


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
              text: "記憶の処理に失敗しました。"
            }
          ]
        };
      }
    }
  );

}
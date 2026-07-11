import { z } from "zod";
import db from "../database.js";

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

      description: "特定ユーザーの情報をkey/valueの形でSQLiteへ保存します",

      inputSchema: {

        user_id: z.string().describe("記憶の持ち主を識別するID(呼び出し元クライアントが指定)"),

        key: z.string(),

        value: z.string()

      }

    },


    async ({ user_id, key, value }) => {


      try {


        const stmt = db.prepare(`

          INSERT INTO memories(user_id, key, value)

          VALUES(?,?,?)

          ON CONFLICT(user_id, key)

          DO UPDATE SET value=excluded.value

        `);


        stmt.run(
          user_id,
          key,
          value
        );


        return {

          content: [

            {

              type: "text",

              text:
                `保存しました ${key}=${value}`

            }

          ]

        };


      } catch (error) {


        return {

          content: [

            {

              type: "text",

              text:
                "保存エラー: " + error.message

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

      description:
        "特定ユーザーの記憶をSQLiteから取得します",

      inputSchema: {

        user_id: z.string().describe("記憶の持ち主を識別するID(呼び出し元クライアントが指定)"),

        key: z.string()

      }

    },


    async ({ user_id, key }) => {


      try {


        const row = db.prepare(`

          SELECT value

          FROM memories

          WHERE user_id=? AND key=?

        `).get(user_id, key);



        if (row) {


          return {

            content: [

              {

                type: "text",

                text: row.value

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

              text:
                "取得エラー: " + error.message

            }

          ]

        };


      }


    }

  );

}
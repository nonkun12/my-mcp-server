import { z } from "zod";
import db from "../database.js";

// =================================
// memory系ツールの登録
// =================================
// save_memory / get_memory をまとめてここで管理する。
// 今後 calendar.js, search.js のような形でツールを増やす際は、
// このファイルと同じ形(registerXxxTools(server) を export する)で追加し、
// tools/index.js に1行足すだけで済むようにする。
export function registerMemoryTools(server) {

  server.registerTool(

    "save_memory",

    {
      title: "Save Memory",

      description: "情報をSQLiteへ保存します",

      inputSchema: {

        key: z.string(),

        value: z.string()

      }

    },


    async ({ key, value }) => {


      try {


        const stmt = db.prepare(`

          INSERT INTO memories(key,value)

          VALUES(?,?)

          ON CONFLICT(key)

          DO UPDATE SET value=excluded.value

        `);


        stmt.run(
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
        "SQLiteから記憶を取得します",

      inputSchema: {

        key: z.string()

      }

    },


    async ({ key }) => {


      try {


        const row = db.prepare(`

          SELECT value

          FROM memories

          WHERE key=?

        `).get(key);



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
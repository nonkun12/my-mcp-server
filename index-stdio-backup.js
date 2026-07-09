import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import db from "./database.js";


const server = new McpServer({
  name: "memory-mcp-server",
  version: "1.0.0",
});


// =============================
// 記憶を保存するTool
// =============================

server.registerTool(
  "save_memory",
  {
    title: "Save Memory",
    description: "情報をSQLiteへ保存します",
    inputSchema: {
      key: z.string(),
      value: z.string(),
    },
  },

  async ({ key, value }) => {

    return new Promise((resolve) => {

      db.run(
        `
        INSERT INTO memories(key,value)
        VALUES(?,?)
        ON CONFLICT(key)
        DO UPDATE SET value=excluded.value
        `,
        [key, value],

        (err) => {

          if (err) {

            resolve({
              content:[
                {
                  type:"text",
                  text:"保存エラー: " + err.message
                }
              ]
            });

          } else {

            resolve({
              content:[
                {
                  type:"text",
                  text:`保存しました: ${key} = ${value}`
                }
              ]
            });

          }

        }
      );

    });

  }
);


// =============================
// 記憶を取得するTool
// =============================

server.registerTool(
  "get_memory",
  {
    title:"Get Memory",
    description:"SQLiteから記憶を取得します",
    inputSchema:{
      key:z.string()
    },
  },


  async ({key})=>{

    return new Promise((resolve)=>{


      db.get(
        `
        SELECT value
        FROM memories
        WHERE key=?
        `,
        [key],

        (err,row)=>{


          if(err){

            resolve({
              content:[
                {
                  type:"text",
                  text:"取得エラー:"+err.message
                }
              ]
            });


          }else if(row){


            resolve({
              content:[
                {
                  type:"text",
                  text:row.value
                }
              ]
            });


          }else{


            resolve({
              content:[
                {
                  type:"text",
                  text:"記憶がありません"
                }
              ]
            });


          }


        }

      );


    });

  }

);


// =============================
// 起動
// =============================

const transport = new StdioServerTransport();

await server.connect(transport);


console.error("✅ Memory MCP Server 起動");
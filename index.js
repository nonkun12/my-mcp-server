import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import db from "./database.js";


const app = express();

app.use(express.json());


// =================================
// Health Check
// =================================

app.get("/health", (req, res) => {

  res.json({
    ok: true,
    service: "memory-mcp-server"
  });

});



// =================================
// MCP Server 作成
// =================================

function createMcpServer() {


  const server = new McpServer({

    name: "memory-mcp-server",

    version: "1.0.0"

  });



  // =================================
  // save_memory
  // =================================

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





  // =================================
  // get_memory
  // =================================

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



  return server;

}



// =================================
// MCP Endpoint
// =================================

app.post("/mcp", async (req, res) => {


  const server = createMcpServer();


  const transport =
    new StreamableHTTPServerTransport({

      sessionIdGenerator: undefined

    });



  await server.connect(transport);



  await transport.handleRequest(

    req,

    res,

    req.body

  );


});




// =================================
// Server Start
// =================================

const PORT =
  process.env.PORT || 3000;


app.listen(PORT, () => {

  console.log(
    `Memory MCP Server running on port ${PORT}`
  );

});
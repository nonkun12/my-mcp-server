import express from "express";
import db from "./database.js";

const app = express();

app.use(express.json());


const PORT = process.env.PORT || 3000;


// =============================
// Health Check
// =============================

app.get("/health", (req,res)=>{

    res.json({

        ok:true,

        service:"memory-mcp-server"

    });

});


// =============================
// Save Memory API
// =============================

app.post("/memory/save",(req,res)=>{

    const {
        key,
        value
    } = req.body;


    db.run(

        `
        INSERT INTO memories(key,value)
        VALUES(?,?)
        ON CONFLICT(key)
        DO UPDATE SET value=excluded.value
        `,

        [
            key,
            value
        ],

        (err)=>{


            if(err){

                res.json({

                    ok:false,

                    error:err.message

                });

            }else{

                res.json({

                    ok:true,

                    message:"saved"

                });

            }

        }

    );


});


// =============================
// Get Memory API
// =============================

app.post("/memory",(req,res)=>{


    const {
        key
    } = req.body;


    db.get(

        `
        SELECT value
        FROM memories
        WHERE key=?
        `,

        [
            key
        ],

        (err,row)=>{


            if(err){

                res.json({

                    ok:false,

                    error:err.message

                });


            }else{


                res.json({

                    ok:true,

                    value:
                    row ? row.value : null

                });


            }


        }

    );


});



// =============================
// Start
// =============================

app.listen(

    PORT,

    ()=>{

        console.log(
            `MCP HTTP Server running ${PORT}`
        );

    }

);
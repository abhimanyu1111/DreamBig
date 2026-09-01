import express from "express";
import cors from "cors";
import {middleware} from "./middlewares/auth"

const app = express();

app.use(express.json());
app.use(cors());

app.post("/buy",middleware, (req, res) => {
    res.json({
        message: "you can buy here"
    })
})

app.post("/sell",middleware, (req, res) => {
    res.json({
      message: "you can sell here"
    })
})

app.post("/split",middleware, (req, res) => {});

app.post("/merge",middleware, (req, res) => {});

app.get("/balance",middleware, (req, res) => {});

app.get("/position",middleware, (req, res) => {});

app.post("/history",middleware, (req, res) => {});

app.listen(3000, () => {
    console.log("Backend running at port 3000");
});
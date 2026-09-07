import express, { response } from "express";
import cors from "cors";
import { middleware } from "./middlewares/auth";
import { prisma } from "../../packages/db";
import { CreateOrderSchema } from "./types";

const app = express();

app.use(express.json());
app.use(cors());

app.post("/buy", async (req, res) => {
  const { success, data } = CreateOrderSchema.safeParse(req.body); //verify from zod

  if (!success) {
    res.status(411).json({
      message: "Incorrect inputs",
    });
    return;
  }

  
  await prisma.$transaction(async (tx) => {
    const response = await tx.$queryRaw<{ yesOrderbook: string; noOrderbook: string }>`
        SELECT *
        FROM "Market"
        WHERE id = ${data.marketId}
        FOR UPDATE
    `;

    console.log(response);

    // await tx.market.update({
    //   where: {
    //     id: marketId,
    //   },
    //   data: {
    //     title: "new title",
    //   },
    // });
  });

  res.json({
    message: "Hi",
  });
});

app.post("/sell", middleware, (req, res) => {
  console.log("you sold the order");
  res.json({
    message: "you can sell here",
  });
});

app.post("/split", middleware, (req, res) => {
  console.log("you split your order");
  res.json({
    message: "You can split here",
  });
});

app.post("/merge", middleware, (req, res) => {
  console.log(req.body);
  res.json({
    message: "merge request received",
    data: req.body,
  });
});

app.get("/balance", middleware, (req, res) => {});

app.get("/position", middleware, (req, res) => {
  console.log("View your position here");
  res.json({
    message: "your position is here",
  });
});

app.post("/history", middleware, (req, res) => {});

app.listen(3000, () => {
  console.log("Backend running at port 3000");
});

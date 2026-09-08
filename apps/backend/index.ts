import express, { response } from "express";
import cors from "cors";
import { middleware } from "./middlewares/auth";
import { prisma } from "../../packages/db";
import { CreateOrderSchema, type Orderbook } from "./types";
import { da } from "zod/locales";
import { uuid } from "uuidv4";

const app = express();

app.use(express.json());
app.use(cors());

app.post("/buy", middleware, async (req, res) => {
  const { success, data } = CreateOrderSchema.safeParse(req.body); //verify from zod
  const userId: string = req.userId;

  if (!success) {
    res.status(411).json({
      message: "Incorrect inputs",
    });
    return;
  }

  const originalOrderId = uuid();

  await prisma.$transaction(async (tx) => {
    //to lock the row
    const response = await tx.$queryRaw<
      {
        yesOrderbook: string;
        noOrderbook: string;
        id: String;
        totalQty: number;
      }[]
    >`
        SELECT *
        FROM "Market"
        WHERE id = ${data.marketId}
        FOR UPDATE
    `;

    //to lock the another row based on user response to buy or sell whatever
    const userResponse = await tx.$queryRaw<
      { id: string; address: string; usdBalance: number }[]
    >`
        SELECT *
        FROM "Market"
        WHERE id = ${userId}
        FOR UPDATE
    `;

    const user = userResponse[0];
    if (!user) {
      return;
    }
    const market = response[0];
    if (!market) {
      return;
    }

    //if there is a market
    const yesOrderbook: Orderbook = JSON.parse(market.yesOrderbook);
    const noOrderbook: Orderbook = JSON.parse(market.noOrderbook);

    //matching logic

    //1. user want to buy "yes"
    if (data.side == "yes" && data.type == "buy") {
      const usd = data.qty * data.price;
      if (user.usdBalance < usd) {
        res.status(403).json({
          message:
            "Sorry! you don't have enough balance to buy please! add balance",
        });
        return;
      }

      //match the user if everything is fine
      let leftQty = data.qty;

      const prices = Object.keys(yesOrderbook).sort(
        (a: string, b: string) => Number(a) - Number(b),
      );

      await Promise.all(
        prices.map(async (price) => {
          if (Number(price) > data.price) {
            return;
          }
          const { orders } = yesOrderbook[price]!;

          await Promise.all(
            orders.map(async (order) => {
              const matchedQty = order.qty >= leftQty ? leftQty : order.qty;
              const reverseOrder = order.reverseOrder;

              if (!reverseOrder) {
                //user qty update who sold their position(shares)
                await prisma.position.update({
                  where: {
                    userId_marketId_type: {
                      userId: order.userId,
                      marketId: data.marketId,
                      type: "YES",
                    },
                  },
                  data: {
                    qty: {
                      decrement: matchedQty,
                    },
                  },
                });

                //updating the usd balance of the user who sold their shares so balance will increase
                await prisma.user.update({
                  where: {
                    id: order.userId,
                  },
                  data: {
                    usdBalance: {
                      increment: Number(price) * matchedQty,
                    },
                  },
                });
              } else {
                //user qty update who sold their position(shares) for "NO"
                await prisma.position.update({
                  where: {
                    userId_marketId_type: {
                      userId: order.userId,
                      marketId: data.marketId,
                      type: "NO",
                    },
                  },
                  data: {
                    qty: {
                      increment: matchedQty,
                    },
                  },
                });

                //updating the usd balance of the user who sold their positions so balance will increase
                await prisma.user.update({
                  where: {
                    id: order.userId,
                  },
                  data: {
                    usdBalance: {
                      increment: (100 - Number(price)) * matchedQty,
                    },
                  },
                });
              }

              //increasing qty who buy the position(shares)
              await prisma.position.update({
                where: {
                  userId_marketId_type: {
                    userId,
                    marketId: data.marketId,
                    type: "YES",
                  },
                },
                data: {
                  qty: {
                    increment: matchedQty,
                  },
                },
              });

              //updating the usd balance of the user who bought shares so balance will be decreased
              await prisma.user.update({
                where: {
                  id: order.userId,
                },
                data: {
                  usdBalance: {
                    decrement: Number(price) * matchedQty,
                  },
                },
              });

              leftQty -= matchedQty;
              order.filledQty += matchedQty;
              yesOrderbook[price]!.availableQty -= matchedQty;
            }),
          );
        }),
      );

      if (leftQty) {
        const oppositePrice = 100 - data.price;
        if (!noOrderbook[oppositePrice]) {
          noOrderbook[oppositePrice] = { availableQty: 0, orders: [] };
        }
        noOrderbook[oppositePrice]!.availableQty += leftQty;
        noOrderbook[oppositePrice]!.orders.push({
          qty: leftQty,
          userId,
          filledQty: 0,
          originalOrderId,
          reverseOrder: true,
        });
      }
    }

    //2. user want to sell "yes" this is equivalent to user want to buy "no"
    if (data.side == "yes" && data.type == "sell") {
      const buyPrice = 100 - data.price;

      const userPosition = await prisma.position.findFirst({
        where: {
          userId: userId,
          marketId: data.marketId,
          type: "YES",
        },
      });

      if (!userPosition) {
        return;
      }

      if (userPosition.qty < data.qty) {
        return;
      }

      let leftQty = data.qty;

      //sorted in lowest price to highest price
      const prices = Object.keys(noOrderbook).sort(
        (a: string, b: string) => Number(a) - Number(b),
      );

      await Promise.all(
        prices.map(async (price) => {
          if (Number(price) > data.price) {
            return;
          }
          const { orders } = noOrderbook[price]!;

          await Promise.all(
            orders.map(async (order) => {
              const matchedQty = order.qty >= leftQty ? leftQty : order.qty;
              const reverseOrder = order.reverseOrder;

              if (!reverseOrder) {
                //user qty update who sold their position(shares)
                await prisma.position.update({
                  where: {
                    userId_marketId_type: {
                      userId: order.userId,
                      marketId: data.marketId,
                      type: "NO",
                    },
                  },
                  data: {
                    qty: {
                      decrement: matchedQty,
                    },
                  },
                });

                //updating the usd balance of the user who sold their shares so balance will increase
                await prisma.user.update({
                  where: {
                    id: order.userId,
                  },
                  data: {
                    usdBalance: {
                      increment: Number(price) * matchedQty,
                    },
                  },
                });
              } else {
                //user qty update who sold their position(shares) for "YES"
                await prisma.position.update({
                  where: {
                    userId_marketId_type: {
                      userId: order.userId,
                      marketId: data.marketId,
                      type: "YES",
                    },
                  },
                  data: {
                    qty: {
                      increment: matchedQty,
                    },
                  },
                });

                //updating the usd balance of the user who sold their positions so balance will increase
                await prisma.user.update({
                  where: {
                    id: order.userId,
                  },
                  data: {
                    usdBalance: {
                      decrement: (100 - Number(price)) * matchedQty,
                    },
                  },
                });
              }

              //increasing qty who buy the position(shares)
              await prisma.position.update({
                where: {
                  userId_marketId_type: {
                    userId,
                    marketId: data.marketId,
                    type: "YES",
                  },
                },
                data: {
                  qty: {
                    decrement: matchedQty,
                  },
                },
              });

              //updating the usd balance of the user who bought shares so balance will be decreased
              await prisma.user.update({
                where: {
                  id: order.userId,
                },
                data: {
                  usdBalance: {
                    increment: Number(price) * matchedQty,
                  },
                },
              });

              leftQty -= matchedQty;
              order.filledQty += matchedQty;
              noOrderbook[price]!.availableQty -= matchedQty;
            }),
          );
        }),
      )

       if (leftQty) {
         if (!yesOrderbook[data.price]) {
           yesOrderbook[data.price] = { availableQty: 0, orders: [] };
         }
         yesOrderbook[data.price]!.availableQty += leftQty;
         yesOrderbook[data.price]!.orders.push({
           qty: leftQty,
           userId,
           filledQty: 0,
           originalOrderId,
           reverseOrder: true,
         })
       }
  }

  await tx.market.update({
      data: {
        yesOrderbook: JSON.stringify(yesOrderbook),
        noOrderbook: JSON.stringify(noOrderbook),
      },
      where: {
        id: data.marketId,
      },
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

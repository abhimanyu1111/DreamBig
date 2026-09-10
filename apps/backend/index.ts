import express, { type Request, type Response } from "express";
import cors from "cors";
import { middleware, adminMiddleware } from "./middlewares/auth";
import { prisma } from "../../packages/db";
import {
  CreateOrderSchema,
  SplitSchema,
  MergeSchema,
  ResolveMarketSchema,
  CreateMarketSchema,
  type Orderbook,
} from "./types";
import { randomUUID } from "crypto";

const app = express();

app.use(express.json());
app.use(cors());

// ==========================================
// HELPER FUNCTIONS FOR CLEAN CODE
// ==========================================

// Helper: Safely parse orderbook stored as JSON in database
function parseOrderbook(raw: any): Orderbook {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw as Orderbook;
}

// Helper: Clean up filled or empty price tiers from orderbook
function cleanOrderbook(orderbook: Orderbook) {
  for (const price in orderbook) {
    const tier = orderbook[price];
    if (!tier) continue;
    // Keep only orders that still have unfilled quantity
    tier.orders = tier.orders.filter((order) => order.qty > order.filledQty);
    tier.availableQty = tier.orders.reduce(
      (sum, order) => sum + (order.qty - order.filledQty),
      0
    );
    // Delete price level if no orders remain
    if (tier.orders.length === 0 || tier.availableQty <= 0) {
      delete orderbook[price];
    }
  }
}

// Helper: Safely increment or decrement a user's position
async function updatePosition(
  tx: any,
  userId: string,
  marketId: string,
  type: "YES" | "NO",
  changeQty: number
) {
  const existing = await tx.position.findUnique({
    where: {
      userId_marketId_type: {
        userId,
        marketId,
        type,
      },
    },
  });

  if (existing) {
    const newQty = existing.qty + changeQty;
    return await tx.position.update({
      where: { id: existing.id },
      data: { qty: Math.max(0, newQty) },
    });
  } else {
    return await tx.position.create({
      data: {
        userId,
        marketId,
        type,
        qty: Math.max(0, changeQty),
      },
    });
  }
}

// Helper: Record an entry in OrderHistory
async function recordOrderHistory(
  tx: any,
  userId: string,
  marketId: string,
  orderType: "BUY" | "SELL" | "SPLIT" | "MERGE",
  positionType: "YES" | "NO",
  qty: number,
  price: number
) {
  return await tx.orderHistory.create({
    data: {
      userId,
      marketId,
      orderType,
      positionType,
      qty,
      price,
    },
  });
}

// ==========================================
// 1. PUBLIC ROUTES (MARKETS)
// ==========================================

// Get all markets with implied YES / NO prices
app.get("/markets", async (req: Request, res: Response) => {
  try {
    const markets = await prisma.market.findMany({
      orderBy: { id: "asc" },
    });

    const formattedMarkets = markets.map((m) => {
      const yesOrderbook = parseOrderbook(m.yesOrderbook);
      const noOrderbook = parseOrderbook(m.noOrderbook);

      // Best ask prices (cheapest available)
      const yesPrices = Object.keys(yesOrderbook).map(Number).sort((a, b) => a - b);
      const noPrices = Object.keys(noOrderbook).map(Number).sort((a, b) => a - b);

      const bestYesPrice = yesPrices.length > 0 ? yesPrices[0] : 50;
      const bestNoPrice = noPrices.length > 0 ? noPrices[0] : 50;

      return {
        id: m.id,
        title: m.title,
        description: m.description,
        resolutionDescription: m.resolutionDescription,
        totalQty: m.totalQty,
        resolution: m.resolution,
        yesPrice: bestYesPrice,
        noPrice: bestNoPrice,
      };
    });

    res.json({ markets: formattedMarkets });
  } catch (error) {
    console.error("Error fetching markets:", error);
    res.status(500).json({ message: "Failed to fetch markets" });
  }
});

// Get single market by ID including full orderbooks
app.get("/markets/:id", async (req: Request, res: Response) => {
  try {
    const market = await prisma.market.findUnique({
      where: { id: req.params.id },
    });

    if (!market) {
      res.status(404).json({ message: "Market not found" });
      return;
    }

    res.json({
      ...market,
      yesOrderbook: parseOrderbook(market.yesOrderbook),
      noOrderbook: parseOrderbook(market.noOrderbook),
    });
  } catch (error) {
    console.error("Error fetching market:", error);
    res.status(500).json({ message: "Failed to fetch market details" });
  }
});

// Create a new market (Admin / Dev)
app.post("/market/create", adminMiddleware, async (req: Request, res: Response) => {
  const { success, data } = CreateMarketSchema.safeParse(req.body);
  if (!success) {
    res.status(400).json({ message: "Invalid market input fields" });
    return;
  }

  try {
    const newMarket = await prisma.market.create({
      data: {
        title: data.title,
        description: data.description,
        resolutionDescription: data.resolutionDescription,
        yesOrderbook: {},
        noOrderbook: {},
        totalQty: 0,
      },
    });

    res.json({ message: "Market created successfully", market: newMarket });
  } catch (error) {
    console.error("Error creating market:", error);
    res.status(500).json({ message: "Failed to create market" });
  }
});

// ==========================================
// 2. USER PROFILE & BALANCES
// ==========================

// Get user's USD balance
app.get("/balance", middleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.json({
      usdBalance: user.usdBalance,
      address: user.address,
      isAdmin: Boolean(req.isAdmin),
    });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
});

// Faucet: Add test USD balance (for development & demo testing)
app.post("/faucet", middleware, async (req: Request, res: Response) => {
  try {
    const amount = 50000; // $500.00 (in cents)
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        usdBalance: { increment: amount },
      },
    });

    res.json({
      message: "Faucet funds added successfully!",
      usdBalance: user.usdBalance,
    });
  } catch (error) {
    console.error("Error in faucet:", error);
    res.status(500).json({ message: "Failed to add funds" });
  }
});

// Get user's active positions across markets
app.get("/position", middleware, async (req: Request, res: Response) => {
  try {
    const positions = await prisma.position.findMany({
      where: {
        userId: req.userId,
        qty: { gt: 0 },
      },
      include: {
        market: {
          select: {
            id: true,
            title: true,
            resolution: true,
          },
        },
      },
    });

    res.json({ positions });
  } catch (error) {
    console.error("Error fetching positions:", error);
    res.status(500).json({ message: "Failed to fetch positions" });
  }
});

// Get user's trade history
app.get("/history", middleware, async (req: Request, res: Response) => {
  try {
    const history = await prisma.orderHistory.findMany({
      where: { userId: req.userId },
      orderBy: { id: "desc" },
      take: 50,
      include: {
        market: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });

    res.json({ history });
  } catch (error) {
    console.error("Error fetching history:", error);
    res.status(500).json({ message: "Failed to fetch history" });
  }
});

// ==========================================
// 3. CORE TRADING: BUY & SELL MATCHING ENGINE
// ==========================================

app.post("/buy", middleware, async (req: Request, res: Response) => {
  const { success, data } = CreateOrderSchema.safeParse(req.body);
  const userId = req.userId!;

  if (!success) {
    res.status(400).json({ message: "Incorrect order inputs", errors: data });
    return;
  }

  const originalOrderId = randomUUID();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Lock the market row
      const marketRows = await tx.$queryRaw<
        {
          id: string;
          yesOrderbook: any;
          noOrderbook: any;
          totalQty: number;
          resolution: string | null;
        }[]
      >`
        SELECT * FROM "Market" WHERE id = ${data.marketId} FOR UPDATE
      `;

      const market = marketRows[0];
      if (!market) {
        throw new Error("Market not found");
      }

      if (market.resolution) {
        throw new Error("Market is already resolved and closed for trading");
      }

      // 2. Lock the user row
      const userRows = await tx.$queryRaw<
        { id: string; address: string; usdBalance: number }[]
      >`
        SELECT * FROM "User" WHERE id = ${userId} FOR UPDATE
      `;

      const user = userRows[0];
      if (!user) {
        throw new Error("User not found");
      }

      const yesOrderbook = parseOrderbook(market.yesOrderbook);
      const noOrderbook = parseOrderbook(market.noOrderbook);

      let leftQty = data.qty;

      // ========================================
      // CASE 1: USER WANTS TO BUY "YES"
      // ========================================
      if (data.side === "yes" && data.type === "buy") {
        const maxTotalCost = data.qty * data.price;
        if (user.usdBalance < maxTotalCost) {
          throw new Error("Insufficient USD balance to place this buy order");
        }

        // Lock total buy budget upfront
        await tx.user.update({
          where: { id: userId },
          data: { usdBalance: { decrement: maxTotalCost } },
        });

        // Match against YES orderbook sorted by lowest asking price first
        const prices = Object.keys(yesOrderbook)
          .map(Number)
          .sort((a, b) => a - b);

        for (const price of prices) {
          if (price > data.price || leftQty <= 0) break;

          const tier = yesOrderbook[price];
          if (!tier) continue;

          for (const order of tier.orders) {
            const availableInOrder = order.qty - order.filledQty;
            if (availableInOrder <= 0 || leftQty <= 0) continue;

            const matchedQty = Math.min(availableInOrder, leftQty);

            if (!order.reverseOrder) {
              // Regular YES seller
              await updatePosition(tx, order.userId, data.marketId, "YES", -matchedQty);
              await tx.user.update({
                where: { id: order.userId },
                data: { usdBalance: { increment: price * matchedQty } },
              });
              await updatePosition(tx, userId, data.marketId, "YES", matchedQty);
            } else {
              // Counter-buyer who ordered NO at (100 - price)
              await updatePosition(tx, order.userId, data.marketId, "NO", matchedQty);
              await updatePosition(tx, userId, data.marketId, "YES", matchedQty);
              await tx.market.update({
                where: { id: data.marketId },
                data: { totalQty: { increment: matchedQty } },
              });
            }

            // Refund price improvement if matched below limit price
            const priceImprovement = (data.price - price) * matchedQty;
            if (priceImprovement > 0) {
              await tx.user.update({
                where: { id: userId },
                data: { usdBalance: { increment: priceImprovement } },
              });
            }

            // Record execution history
            await recordOrderHistory(tx, userId, data.marketId, "BUY", "YES", matchedQty, price);
            await recordOrderHistory(
              tx,
              order.userId,
              data.marketId,
              order.reverseOrder ? "BUY" : "SELL",
              order.reverseOrder ? "NO" : "YES",
              matchedQty,
              order.reverseOrder ? 100 - price : price
            );

            order.filledQty += matchedQty;
            tier.availableQty -= matchedQty;
            leftQty -= matchedQty;
          }
        }

        // If unfilled quantity remains, place resting counter-order in NO orderbook at (100 - price)
        if (leftQty > 0) {
          const oppositePrice = 100 - data.price;
          if (!noOrderbook[oppositePrice]) {
            noOrderbook[oppositePrice] = { availableQty: 0, orders: [] };
          }
          noOrderbook[oppositePrice]!.availableQty += leftQty;
          noOrderbook[oppositePrice]!.orders.push({
            qty: leftQty,
            filledQty: 0,
            userId,
            originalOrderId,
            reverseOrder: true,
          });
        }
      }

      // ========================================
      // CASE 2: USER WANTS TO BUY "NO"
      // ========================================
      else if (data.side === "no" && data.type === "buy") {
        const maxTotalCost = data.qty * data.price;
        if (user.usdBalance < maxTotalCost) {
          throw new Error("Insufficient USD balance to place this buy order");
        }

        // Lock total buy budget upfront
        await tx.user.update({
          where: { id: userId },
          data: { usdBalance: { decrement: maxTotalCost } },
        });

        // Match against NO orderbook sorted by lowest asking price first
        const prices = Object.keys(noOrderbook)
          .map(Number)
          .sort((a, b) => a - b);

        for (const price of prices) {
          if (price > data.price || leftQty <= 0) break;

          const tier = noOrderbook[price];
          if (!tier) continue;

          for (const order of tier.orders) {
            const availableInOrder = order.qty - order.filledQty;
            if (availableInOrder <= 0 || leftQty <= 0) continue;

            const matchedQty = Math.min(availableInOrder, leftQty);

            if (!order.reverseOrder) {
              // Regular NO seller
              await updatePosition(tx, order.userId, data.marketId, "NO", -matchedQty);
              await tx.user.update({
                where: { id: order.userId },
                data: { usdBalance: { increment: price * matchedQty } },
              });
              await updatePosition(tx, userId, data.marketId, "NO", matchedQty);
            } else {
              // Counter-buyer who ordered YES at (100 - price)
              await updatePosition(tx, order.userId, data.marketId, "YES", matchedQty);
              await updatePosition(tx, userId, data.marketId, "NO", matchedQty);
              await tx.market.update({
                where: { id: data.marketId },
                data: { totalQty: { increment: matchedQty } },
              });
            }

            // Refund price improvement
            const priceImprovement = (data.price - price) * matchedQty;
            if (priceImprovement > 0) {
              await tx.user.update({
                where: { id: userId },
                data: { usdBalance: { increment: priceImprovement } },
              });
            }

            // Record execution history
            await recordOrderHistory(tx, userId, data.marketId, "BUY", "NO", matchedQty, price);
            await recordOrderHistory(
              tx,
              order.userId,
              data.marketId,
              order.reverseOrder ? "BUY" : "SELL",
              order.reverseOrder ? "YES" : "NO",
              matchedQty,
              order.reverseOrder ? 100 - price : price
            );

            order.filledQty += matchedQty;
            tier.availableQty -= matchedQty;
            leftQty -= matchedQty;
          }
        }

        // If unfilled quantity remains, place resting counter-order in YES orderbook at (100 - price)
        if (leftQty > 0) {
          const oppositePrice = 100 - data.price;
          if (!yesOrderbook[oppositePrice]) {
            yesOrderbook[oppositePrice] = { availableQty: 0, orders: [] };
          }
          yesOrderbook[oppositePrice]!.availableQty += leftQty;
          yesOrderbook[oppositePrice]!.orders.push({
            qty: leftQty,
            filledQty: 0,
            userId,
            originalOrderId,
            reverseOrder: true,
          });
        }
      }

      // ========================================
      // CASE 3: USER WANTS TO SELL "YES"
      // ========================================
      else if (data.side === "yes" && data.type === "sell") {
        const userPosition = await tx.position.findUnique({
          where: {
            userId_marketId_type: {
              userId,
              marketId: data.marketId,
              type: "YES",
            },
          },
        });

        if (!userPosition || userPosition.qty < data.qty) {
          throw new Error("Insufficient YES shares to sell");
        }

        // Lock YES shares upfront
        await updatePosition(tx, userId, data.marketId, "YES", -data.qty);

        // A YES seller matches against YES buyers waiting in noOrderbook as reverseOrder: true
        // where (100 - priceKey) >= data.price
        const noPrices = Object.keys(noOrderbook)
          .map(Number)
          .sort((a, b) => a - b); // Lower noPrice means higher yesPrice (100 - noPrice)

        for (const price of noPrices) {
          const buyerYesPrice = 100 - price;
          if (buyerYesPrice < data.price || leftQty <= 0) continue;

          const tier = noOrderbook[price];
          if (!tier) continue;

          for (const order of tier.orders) {
            if (!order.reverseOrder) continue; // Only match buyers

            const availableInOrder = order.qty - order.filledQty;
            if (availableInOrder <= 0 || leftQty <= 0) continue;

            const matchedQty = Math.min(availableInOrder, leftQty);

            // Buyer receives the YES shares
            await updatePosition(tx, order.userId, data.marketId, "YES", matchedQty);

            // Seller receives USD at buyer's price
            await tx.user.update({
              where: { id: userId },
              data: { usdBalance: { increment: buyerYesPrice * matchedQty } },
            });

            await recordOrderHistory(tx, userId, data.marketId, "SELL", "YES", matchedQty, buyerYesPrice);

            order.filledQty += matchedQty;
            tier.availableQty -= matchedQty;
            leftQty -= matchedQty;
          }
        }

        // If unfilled quantity remains, place resting sell order in YES orderbook
        if (leftQty > 0) {
          if (!yesOrderbook[data.price]) {
            yesOrderbook[data.price] = { availableQty: 0, orders: [] };
          }
          yesOrderbook[data.price]!.availableQty += leftQty;
          yesOrderbook[data.price]!.orders.push({
            qty: leftQty,
            filledQty: 0,
            userId,
            originalOrderId,
            reverseOrder: false,
          });
        }
      }

      // ========================================
      // CASE 4: USER WANTS TO SELL "NO"
      // ========================================
      else if (data.side === "no" && data.type === "sell") {
        const userPosition = await tx.position.findUnique({
          where: {
            userId_marketId_type: {
              userId,
              marketId: data.marketId,
              type: "NO",
            },
          },
        });

        if (!userPosition || userPosition.qty < data.qty) {
          throw new Error("Insufficient NO shares to sell");
        }

        // Lock NO shares upfront
        await updatePosition(tx, userId, data.marketId, "NO", -data.qty);

        // A NO seller matches against NO buyers waiting in yesOrderbook as reverseOrder: true
        const yesPrices = Object.keys(yesOrderbook)
          .map(Number)
          .sort((a, b) => a - b);

        for (const price of yesPrices) {
          const buyerNoPrice = 100 - price;
          if (buyerNoPrice < data.price || leftQty <= 0) continue;

          const tier = yesOrderbook[price];
          if (!tier) continue;

          for (const order of tier.orders) {
            if (!order.reverseOrder) continue;

            const availableInOrder = order.qty - order.filledQty;
            if (availableInOrder <= 0 || leftQty <= 0) continue;

            const matchedQty = Math.min(availableInOrder, leftQty);

            // Buyer receives NO shares
            await updatePosition(tx, order.userId, data.marketId, "NO", matchedQty);

            // Seller receives USD
            await tx.user.update({
              where: { id: userId },
              data: { usdBalance: { increment: buyerNoPrice * matchedQty } },
            });

            await recordOrderHistory(tx, userId, data.marketId, "SELL", "NO", matchedQty, buyerNoPrice);

            order.filledQty += matchedQty;
            tier.availableQty -= matchedQty;
            leftQty -= matchedQty;
          }
        }

        // If unfilled quantity remains, place resting sell order in NO orderbook
        if (leftQty > 0) {
          if (!noOrderbook[data.price]) {
            noOrderbook[data.price] = { availableQty: 0, orders: [] };
          }
          noOrderbook[data.price]!.availableQty += leftQty;
          noOrderbook[data.price]!.orders.push({
            qty: leftQty,
            filledQty: 0,
            userId,
            originalOrderId,
            reverseOrder: false,
          });
        }
      }

      // Clean empty price tiers and save updated orderbooks
      cleanOrderbook(yesOrderbook);
      cleanOrderbook(noOrderbook);

      await tx.market.update({
        where: { id: data.marketId },
        data: {
          yesOrderbook: yesOrderbook,
          noOrderbook: noOrderbook,
        },
      });

      return {
        filledQty: data.qty - leftQty,
        remainingQty: leftQty,
      };
    });

    res.json({
      message: "Order processed successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Order error:", error.message || error);
    res.status(400).json({ message: error.message || "Order execution failed" });
  }
});

// Also accept /sell as an alias route forwarding to the same matching logic
app.post("/sell", middleware, async (req: Request, res: Response) => {
  req.body.type = "sell";
  // Delegate to /buy handler logic
  const { success } = CreateOrderSchema.safeParse(req.body);
  if (!success) {
    res.status(400).json({ message: "Invalid sell order inputs" });
    return;
  }
  // Reuse endpoint handler directly
  (app._router.handle as any)({ ...req, url: "/buy", method: "POST" }, res);
});

// ==========================================
// 4. SPLIT & MERGE CONTRACT OPERATIONS (Mint 1 YES + 1 NO for $1.00 USD)
// ==========================================

// Split: Pay $1.00 (100 cents) per share to mint 1 YES + 1 NO share
app.post("/split", middleware, async (req: Request, res: Response) => {
  const { success, data } = SplitSchema.safeParse(req.body);
  const userId = req.userId!;

  if (!success) {
    res.status(400).json({ message: "Invalid inputs for split" });
    return;
  }

  const cost = data.qty * 100; // 100 cents per share pair

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user || user.usdBalance < cost) {
        throw new Error("Insufficient USD balance to split");
      }

      // Deduct USD balance
      await tx.user.update({
        where: { id: userId },
        data: { usdBalance: { decrement: cost } },
      });

      // Add YES and NO positions
      await updatePosition(tx, userId, data.marketId, "YES", data.qty);
      await updatePosition(tx, userId, data.marketId, "NO", data.qty);

      // Increase market totalQty
      await tx.market.update({
        where: { id: data.marketId },
        data: { totalQty: { increment: data.qty } },
      });

      // Record in history
      await recordOrderHistory(tx, userId, data.marketId, "SPLIT", "YES", data.qty, 50);
    });

    res.json({ message: `Successfully split ${data.qty} shares into YES and NO!` });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Split operation failed" });
  }
});

// Merge: Burn 1 YES + 1 NO share to redeem $1.00 (100 cents)
app.post("/merge", middleware, async (req: Request, res: Response) => {
  const { success, data } = MergeSchema.safeParse(req.body);
  const userId = req.userId!;

  if (!success) {
    res.status(400).json({ message: "Invalid inputs for merge" });
    return;
  }

  const redeemAmount = data.qty * 100; // 100 cents per share pair

  try {
    await prisma.$transaction(async (tx) => {
      const yesPos = await tx.position.findUnique({
        where: { userId_marketId_type: { userId, marketId: data.marketId, type: "YES" } },
      });
      const noPos = await tx.position.findUnique({
        where: { userId_marketId_type: { userId, marketId: data.marketId, type: "NO" } },
      });

      if (!yesPos || yesPos.qty < data.qty || !noPos || noPos.qty < data.qty) {
        throw new Error("You must own at least " + data.qty + " YES and " + data.qty + " NO shares to merge");
      }

      // Decrement YES and NO positions
      await updatePosition(tx, userId, data.marketId, "YES", -data.qty);
      await updatePosition(tx, userId, data.marketId, "NO", -data.qty);

      // Increment USD balance
      await tx.user.update({
        where: { id: userId },
        data: { usdBalance: { increment: redeemAmount } },
      });

      // Decrement market totalQty
      await tx.market.update({
        where: { id: data.marketId },
        data: { totalQty: { decrement: data.qty } },
      });

      // Record in history
      await recordOrderHistory(tx, userId, data.marketId, "MERGE", "YES", data.qty, 50);
    });

    res.json({ message: `Successfully merged ${data.qty} pairs into $${(redeemAmount / 100).toFixed(2)} USD!` });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Merge operation failed" });
  }
});

// ==========================================
// 5. MARKET RESOLUTION & PAYOUTS
// ==========================================

// Resolve a market and pay out winning positions (100 cents per winning share)
app.post("/market/resolve", adminMiddleware, async (req: Request, res: Response) => {
  const { success, data } = ResolveMarketSchema.safeParse(req.body);

  if (!success) {
    res.status(400).json({ message: "Invalid resolution input" });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      const market = await tx.market.findUnique({
        where: { id: data.marketId },
      });

      if (!market) {
        throw new Error("Market not found");
      }

      if (market.resolution) {
        throw new Error("Market is already resolved");
      }

      // Find all positions in this market
      const positions = await tx.position.findMany({
        where: { marketId: data.marketId, qty: { gt: 0 } },
      });

      for (const pos of positions) {
        if (pos.type === data.resolution) {
          // Winner gets 100 cents ($1.00) per share
          const payout = pos.qty * 100;
          await tx.user.update({
            where: { id: pos.userId },
            data: { usdBalance: { increment: payout } },
          });
        }

        // Reset position to 0 since market is resolved
        await tx.position.update({
          where: { id: pos.id },
          data: { qty: 0 },
        });
      }

      // Mark market as resolved and clear open orderbooks
      await tx.market.update({
        where: { id: data.marketId },
        data: {
          resolution: data.resolution,
          yesOrderbook: {},
          noOrderbook: {},
        },
      });
    });

    res.json({ message: `Market resolved to ${data.resolution}. Winning shares paid out at $1.00!` });
  } catch (error: any) {
    res.status(400).json({ message: error.message || "Failed to resolve market" });
  }
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running smoothly at port ${PORT}`);
});

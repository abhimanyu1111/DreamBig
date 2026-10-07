import express, { type Request, type Response } from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { randomUUID } from "crypto";
import { middleware, adminMiddleware } from "./middlewares/auth";
import { prisma } from "../../packages/db";
import {
  CreateOrderSchema,
  SplitSchema,
  MergeSchema,
  ResolveMarketSchema,
  CreateMarketSchema,
  CancelOrderSchema,
} from "./types";
import {
  TradeError,
  parseOrderbook,
  executeOrder,
  splitPairs,
  mergePairs,
  resolveMarketTx,
  cancelOrderTx,
  deleteMarketTx,
  collectOpenOrders,
} from "./engine";

const app = express();

app.use(express.json());
app.use(cors());

// Rate limiter for general public/user endpoints
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // max 120 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});
app.use(generalLimiter);

// Dedicated faucet rate limiter
const faucetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 claims per IP/window
  message: { message: "Faucet limit reached. Please wait before claiming again." },
});

// Helper for sending uniform error responses
function handleTradeError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof TradeError) {
    res.status(400).json({ message: error.message });
    return;
  }
  console.error("Internal error:", error);
  const msg = error instanceof Error ? error.message : fallbackMessage;
  res.status(400).json({ message: msg || fallbackMessage });
}

// ==========================================
// 1. PUBLIC ROUTES (MARKETS)
// ==========================================

// Get all markets with implied YES / NO prices (in paise)
app.get("/markets", async (req: Request, res: Response) => {
  try {
    const markets = await prisma.market.findMany({
      orderBy: { id: "asc" },
    });

    const formattedMarkets = markets.map((m) => {
      const yesOrderbook = parseOrderbook(m.yesOrderbook);
      const noOrderbook = parseOrderbook(m.noOrderbook);

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

// Create a new market (Admin only)
app.post("/market/create", adminMiddleware, async (req: Request, res: Response) => {
  const parseResult = CreateMarketSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      message: "Invalid market input fields",
      errors: parseResult.error.flatten(),
    });
    return;
  }

  const { data } = parseResult;
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
// ==========================================

// Get user balance (in paise)
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
      usdBalance: user.usdBalance, // kept key name for frontend compatibility
      address: user.address,
      isAdmin: Boolean(req.isAdmin),
    });
  } catch (error) {
    console.error("Error fetching balance:", error);
    res.status(500).json({ message: "Failed to fetch balance" });
  }
});

// Faucet: Add test funds (+₹500.00 = 50,000 paise) with 5-minute cooldown
app.post("/faucet", middleware, faucetLimiter, async (req: Request, res: Response) => {
  try {
    const amount = 50000; // 50,000 paise = ₹500.00
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes cooldown

    const user = await prisma.user.update({
      where: { id: req.userId },
      data: {
        usdBalance: { increment: amount },
      },
    });

    res.json({
      message: "Faucet funds (₹500.00) added successfully!",
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

// Get user's open resting limit orders across all markets
app.get("/orders/open", middleware, async (req: Request, res: Response) => {
  try {
    const markets = await prisma.market.findMany({
      where: { resolution: null },
      select: {
        id: true,
        title: true,
        yesOrderbook: true,
        noOrderbook: true,
      },
    });

    const openOrders = collectOpenOrders(markets, req.userId!);
    res.json({ orders: openOrders });
  } catch (error) {
    console.error("Error fetching open orders:", error);
    res.status(500).json({ message: "Failed to fetch open orders" });
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

// Execute order (Buy or Sell YES/NO shares)
app.post("/buy", middleware, async (req: Request, res: Response) => {
  const parseResult = CreateOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      message: "Incorrect order inputs",
      errors: parseResult.error.flatten(),
    });
    return;
  }

  const userId = req.userId!;
  const orderId = randomUUID();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        return await executeOrder(tx, userId, parseResult.data, orderId);
      },
      { timeout: 10000 }
    );

    res.json({
      message: "Order processed successfully",
      data: result,
    });
  } catch (error) {
    handleTradeError(res, error, "Order execution failed");
  }
});

// Direct alias for SELL (for programmatic API clients)
app.post("/sell", middleware, async (req: Request, res: Response) => {
  req.body.type = "sell";
  const parseResult = CreateOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      message: "Invalid sell order inputs",
      errors: parseResult.error.flatten(),
    });
    return;
  }

  const userId = req.userId!;
  const orderId = randomUUID();

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        return await executeOrder(tx, userId, parseResult.data, orderId);
      },
      { timeout: 10000 }
    );

    res.json({
      message: "Sell order processed successfully",
      data: result,
    });
  } catch (error) {
    handleTradeError(res, error, "Sell order execution failed");
  }
});

// Cancel an open resting limit order
app.post("/order/cancel", middleware, async (req: Request, res: Response) => {
  const parseResult = CancelOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      message: "Invalid cancel order inputs",
      errors: parseResult.error.flatten(),
    });
    return;
  }

  const { marketId, orderId } = parseResult.data;
  const userId = req.userId!;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        return await cancelOrderTx(tx, userId, marketId, orderId);
      },
      { timeout: 10000 }
    );

    res.json({
      message: `Order cancelled successfully (${result.cancelledQty} shares returned/refunded)`,
      data: result,
    });
  } catch (error) {
    handleTradeError(res, error, "Order cancellation failed");
  }
});

// ==========================================
// 4. SPLIT & MERGE CONTRACT OPERATIONS (1 YES + 1 NO = ₹1.00)
// ==========================================

// Split: Pay ₹1.00 (100 paise) per share to mint 1 YES + 1 NO share
app.post("/split", middleware, async (req: Request, res: Response) => {
  const parseResult = SplitSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      message: "Invalid inputs for split",
      errors: parseResult.error.flatten(),
    });
    return;
  }

  const { marketId, qty } = parseResult.data;
  const userId = req.userId!;

  try {
    await prisma.$transaction(
      async (tx) => {
        await splitPairs(tx, userId, marketId, qty);
      },
      { timeout: 10000 }
    );

    res.json({ message: `Successfully split ₹${qty}.00 into ${qty} YES and ${qty} NO shares!` });
  } catch (error) {
    handleTradeError(res, error, "Split operation failed");
  }
});

// Merge: Burn 1 YES + 1 NO share to redeem ₹1.00 (100 paise)
app.post("/merge", middleware, async (req: Request, res: Response) => {
  const parseResult = MergeSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      message: "Invalid inputs for merge",
      errors: parseResult.error.flatten(),
    });
    return;
  }

  const { marketId, qty } = parseResult.data;
  const userId = req.userId!;

  try {
    await prisma.$transaction(
      async (tx) => {
        await mergePairs(tx, userId, marketId, qty);
      },
      { timeout: 10000 }
    );

    res.json({ message: `Successfully merged ${qty} pairs into ₹${qty}.00 cash!` });
  } catch (error) {
    handleTradeError(res, error, "Merge operation failed");
  }
});

// ==========================================
// 5. MARKET RESOLUTION & PAYOUTS
// ==========================================

// Resolve a market and distribute winning payouts (₹1.00 / 100P per share)
app.post("/market/resolve", adminMiddleware, async (req: Request, res: Response) => {
  const parseResult = ResolveMarketSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      message: "Invalid resolution input",
      errors: parseResult.error.flatten(),
    });
    return;
  }

  const { marketId, resolution } = parseResult.data;

  try {
    await prisma.$transaction(
      async (tx) => {
        await resolveMarketTx(tx, marketId, resolution);
      },
      { timeout: 15000 }
    );

    res.json({
      message: `Market resolved to ${resolution}. Winning shares paid out at ₹1.00 (100P)!`,
    });
  } catch (error) {
    handleTradeError(res, error, "Failed to resolve market");
  }
});

// Delete Market (Admin only) - refunds all resting liquidity and outstanding share values
app.delete("/market/:id", adminMiddleware, async (req: Request, res: Response) => {
  const marketId = req.params.id;
  if (!marketId) {
    res.status(400).json({ message: "Market ID is required" });
    return;
  }

  try {
    await prisma.$transaction(
      async (tx) => {
        await deleteMarketTx(tx, marketId);
      },
      { timeout: 15000 }
    );

    res.json({ message: "Market deleted successfully with liquidity safely refunded" });
  } catch (error) {
    handleTradeError(res, error, "Failed to delete market");
  }
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running smoothly at port ${PORT}`);
});

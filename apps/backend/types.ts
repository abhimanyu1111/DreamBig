import z from "zod";

// Upper bound on shares per request: keeps qty * price (paise) far below the
// 32-bit Int range used for balances (max qty * 100 = 100,000,000 paise).
const MAX_QTY = 1_000_000;

// Schema for placing an order (Buy/Sell YES or NO)
export const CreateOrderSchema = z.object({
  marketId: z.string().min(1),
  side: z.enum(["yes", "no"]),
  type: z.enum(["buy", "sell"]),
  price: z.number().int().min(1).max(99), // Price in paise (1 to 99)
  qty: z.number().int().positive().max(MAX_QTY), // Number of shares (positive integer)
});

// Schema for splitting ₹1 per pair into YES + NO shares
export const SplitSchema = z.object({
  marketId: z.string().min(1),
  qty: z.number().int().positive().max(MAX_QTY),
});

// Schema for merging YES + NO shares back into ₹1 per pair
export const MergeSchema = z.object({
  marketId: z.string().min(1),
  qty: z.number().int().positive().max(MAX_QTY),
});

// Schema for resolving a market
export const ResolveMarketSchema = z.object({
  marketId: z.string().min(1),
  resolution: z.enum(["YES", "NO"]),
});

// Schema for cancelling a resting order
export const CancelOrderSchema = z.object({
  marketId: z.string().min(1),
  orderId: z.string().min(1),
});

// Schema for creating a new market
export const CreateMarketSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().max(2000),
  resolutionDescription: z.string().max(1000),
});

// Order structure inside the orderbook
export type OrderbookOrder = {
  userId: string;
  qty: number;
  filledQty: number;
  originalOrderId: string;
  reverseOrder: boolean;
};

// Orderbook mapping prices to available quantities and order lists
export type Orderbook = {
  [price: string]: {
    availableQty: number;
    orders: OrderbookOrder[];
  };
};

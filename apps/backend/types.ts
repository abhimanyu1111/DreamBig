import z from "zod";

// Schema for placing an order (Buy/Sell YES or NO)
export const CreateOrderSchema = z.object({
  marketId: z.string(),
  side: z.enum(["yes", "no"]),
  type: z.enum(["buy", "sell"]),
  price: z.number().int().min(1).max(99), // Price in cents (1 to 99)
  qty: z.number().int().positive(), // Number of shares (positive integer)
});

// Schema for splitting USD into YES + NO shares
export const SplitSchema = z.object({
  marketId: z.string(),
  qty: z.number().int().positive(),
});

// Schema for merging YES + NO shares back into USD
export const MergeSchema = z.object({
  marketId: z.string(),
  qty: z.number().int().positive(),
});

// Schema for resolving a market
export const ResolveMarketSchema = z.object({
  marketId: z.string(),
  resolution: z.enum(["YES", "NO"]),
});

// Schema for creating a new market
export const CreateMarketSchema = z.object({
  title: z.string().min(3),
  description: z.string(),
  resolutionDescription: z.string(),
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

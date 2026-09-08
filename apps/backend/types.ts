import z from "zod";

export const CreateOrderSchema = z.object({
    marketId: z.string(),
    side: z.enum(["yes", "no"]),
    type: z.enum(["buy", "sell"]),
    price: z.int(), //10 => 0.10$
    qty: z.int(), //10 => 10 qty
})

export type Orderbook = {[key: string]: {
    availableQty: number,
    orders: {userId: string, qty: number, filledQty: number, originalOrderId: string, reverseOrder: boolean}[]
}}
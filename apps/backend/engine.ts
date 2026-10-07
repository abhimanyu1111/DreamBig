// =====================================================================
// DreamBig ledger / matching engine
//
// All functions here take a Prisma-style transaction client (`tx`) and
// must be called inside `prisma.$transaction(...)`. They contain no
// HTTP or auth logic so they can be unit-tested with an in-memory fake.
//
// Units: money is integer PAISE (100 paise = ₹1). Share prices are
// integer paise in [1, 99]. A winning share pays PAYOUT (100P = ₹1).
//
// Lock order (always): Market row first, then User row. Using the same
// order everywhere avoids deadlocks between concurrent transactions.
// =====================================================================
import type { Orderbook, OrderbookOrder } from "./types";

// Minimal structural type of the Prisma transaction client we rely on.
export type Tx = any;

export const PAYOUT = 100; // paise paid for every winning share (₹1)
export const DELETE_REFUND_PER_SHARE = PAYOUT / 2; // mid-price refund when an unresolved market is deleted

// Business-rule failure -> HTTP 400 with a safe, user-facing message.
export class TradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TradeError";
  }
}

export type PositionSide = "YES" | "NO";

export interface OrderInput {
  marketId: string;
  side: "yes" | "no";
  type: "buy" | "sell";
  price: number; // paise, 1..99
  qty: number; // shares, positive integer
}

export interface OrderResult {
  filledQty: number;
  remainingQty: number;
  orderId: string;
}

// ---------------------------------------------------------------------
// Order book helpers
// ---------------------------------------------------------------------

// Safely parse an orderbook stored as JSON in the database.
export function parseOrderbook(raw: any): Orderbook {
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

// Remove filled orders and empty price tiers from an orderbook.
export function cleanOrderbook(orderbook: Orderbook) {
  for (const price in orderbook) {
    const tier = orderbook[price];
    if (!tier) continue;
    tier.orders = tier.orders.filter((order) => order.qty > order.filledQty);
    tier.availableQty = tier.orders.reduce(
      (sum, order) => sum + (order.qty - order.filledQty),
      0
    );
    if (tier.orders.length === 0 || tier.availableQty <= 0) {
      delete orderbook[price];
    }
  }
}

const sortedPrices = (book: Orderbook) =>
  Object.keys(book)
    .map(Number)
    .sort((a, b) => a - b);

function restOrder(
  book: Orderbook,
  price: number,
  order: OrderbookOrder
) {
  if (!book[price]) {
    book[price] = { availableQty: 0, orders: [] };
  }
  book[price]!.availableQty += order.qty - order.filledQty;
  book[price]!.orders.push(order);
}

// ---------------------------------------------------------------------
// Row locks and ledger primitives
// ---------------------------------------------------------------------

export async function lockMarket(tx: Tx, marketId: string) {
  const rows = await tx.$queryRaw`
    SELECT * FROM "Market" WHERE id = ${marketId} FOR UPDATE
  `;
  return rows[0] as
    | {
        id: string;
        yesOrderbook: any;
        noOrderbook: any;
        totalQty: number;
        resolution: PositionSide | null;
      }
    | undefined;
}

export async function lockUser(tx: Tx, userId: string) {
  const rows = await tx.$queryRaw`
    SELECT * FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  return rows[0] as
    | { id: string; address: string; usdBalance: number }
    | undefined;
}

async function credit(tx: Tx, userId: string, paise: number) {
  if (paise <= 0) return;
  await tx.user.update({
    where: { id: userId },
    data: { usdBalance: { increment: paise } },
  });
}

// Guarded debit: succeeds only if the balance covers the amount.
async function debit(tx: Tx, userId: string, paise: number, message: string) {
  if (paise <= 0) return;
  const res = await tx.user.updateMany({
    where: { id: userId, usdBalance: { gte: paise } },
    data: { usdBalance: { decrement: paise } },
  });
  if (res.count === 0) throw new TradeError(message);
}

// Atomic increment (creates the row if needed).
export async function addPosition(
  tx: Tx,
  userId: string,
  marketId: string,
  type: PositionSide,
  qty: number
) {
  if (qty <= 0) return;
  await tx.position.upsert({
    where: { userId_marketId_type: { userId, marketId, type } },
    update: { qty: { increment: qty } },
    create: { userId, marketId, type, qty },
  });
}

// Guarded decrement: never goes below zero (throws instead of clamping).
export async function removePosition(
  tx: Tx,
  userId: string,
  marketId: string,
  type: PositionSide,
  qty: number,
  message: string
) {
  if (qty <= 0) return;
  const res = await tx.position.updateMany({
    where: { userId, marketId, type, qty: { gte: qty } },
    data: { qty: { decrement: qty } },
  });
  if (res.count === 0) throw new TradeError(message);
}

async function record(
  tx: Tx,
  userId: string,
  marketId: string,
  orderType: "BUY" | "SELL" | "SPLIT" | "MERGE",
  positionType: PositionSide,
  qty: number,
  price: number
) {
  await tx.orderHistory.create({
    data: { userId, marketId, orderType, positionType, qty, price },
  });
}

async function loadOpenMarket(tx: Tx, marketId: string) {
  const market = await lockMarket(tx, marketId);
  if (!market) throw new TradeError("Market not found");
  if (market.resolution) {
    throw new TradeError("Market is already resolved and closed for trading");
  }
  return market;
}

// ---------------------------------------------------------------------
// Order placement (buy / sell YES or NO)
// ---------------------------------------------------------------------

// Resting-order bookkeeping convention:
//  - A resting SELL of side S sits in book[S] at its limit price with
//    reverseOrder=false. The shares were removed from the seller's
//    position when the order was placed ("locked").
//  - A resting BUY of side S at price P sits in book[opposite(S)] at key
//    (100 - P) with reverseOrder=true. Its cash (P per share) was
//    deducted when the order was placed ("locked").
export async function executeOrder(
  tx: Tx,
  userId: string,
  data: OrderInput,
  orderId: string
): Promise<OrderResult> {
  const market = await loadOpenMarket(tx, data.marketId);
  const user = await lockUser(tx, userId);
  if (!user) throw new TradeError("User not found");

  const books: Record<"yes" | "no", Orderbook> = {
    yes: parseOrderbook(market.yesOrderbook),
    no: parseOrderbook(market.noOrderbook),
  };

  const side = data.side;
  const other = side === "yes" ? "no" : "yes";
  const sideUp = side.toUpperCase() as PositionSide;
  const otherUp = other.toUpperCase() as PositionSide;

  let left = data.qty;

  if (data.type === "buy") {
    // ---------------- BUY `side` ----------------
    // Lock the whole budget up-front; price improvement is refunded below.
    await debit(
      tx,
      userId,
      data.qty * data.price,
      "Insufficient balance to place this buy order"
    );

    for (const price of sortedPrices(books[side])) {
      if (price > data.price || left <= 0) break;
      const tier = books[side][price];
      if (!tier) continue;

      for (const order of tier.orders) {
        if (order.userId === userId) continue; // no self-trading
        const available = order.qty - order.filledQty;
        if (available <= 0 || left <= 0) continue;
        const matched = Math.min(available, left);

        if (!order.reverseOrder) {
          // Regular seller of `side`: their shares were locked when the
          // sell was placed, so only the cash moves here.
          await credit(tx, order.userId, price * matched);
          await addPosition(tx, userId, data.marketId, sideUp, matched);
        } else {
          // Resting buyer of the OTHER side (already paid 100 - price).
          // Together with this buyer's `price` it funds a new YES+NO pair.
          await addPosition(tx, order.userId, data.marketId, otherUp, matched);
          await addPosition(tx, userId, data.marketId, sideUp, matched);
          await tx.market.update({
            where: { id: data.marketId },
            data: { totalQty: { increment: matched } },
          });
        }

        // Refund price improvement (matched below the limit price).
        await credit(tx, userId, (data.price - price) * matched);

        await record(tx, userId, data.marketId, "BUY", sideUp, matched, price);
        await record(
          tx,
          order.userId,
          data.marketId,
          order.reverseOrder ? "BUY" : "SELL",
          order.reverseOrder ? otherUp : sideUp,
          matched,
          order.reverseOrder ? 100 - price : price
        );

        order.filledQty += matched;
        tier.availableQty -= matched;
        left -= matched;
      }
    }

    // Unfilled remainder rests as a counter-order on the opposite book.
    if (left > 0) {
      restOrder(books[other], 100 - data.price, {
        qty: left,
        filledQty: 0,
        userId,
        originalOrderId: orderId,
        reverseOrder: true,
      });
    }
  } else {
    // ---------------- SELL `side` ----------------
    // Lock the shares up-front (guarded: never negative).
    await removePosition(
      tx,
      userId,
      data.marketId,
      sideUp,
      data.qty,
      `Insufficient ${sideUp} shares to sell`
    );

    // Buyers of `side` rest in the opposite book (key = 100 - their price).
    // Ascending keys == highest buyer price first.
    for (const price of sortedPrices(books[other])) {
      const buyerPrice = 100 - price;
      if (buyerPrice < data.price || left <= 0) continue;
      const tier = books[other][price];
      if (!tier) continue;

      for (const order of tier.orders) {
        if (!order.reverseOrder) continue; // only buyers
        if (order.userId === userId) continue; // no self-trading
        const available = order.qty - order.filledQty;
        if (available <= 0 || left <= 0) continue;
        const matched = Math.min(available, left);

        await addPosition(tx, order.userId, data.marketId, sideUp, matched);
        await credit(tx, userId, buyerPrice * matched);

        await record(tx, userId, data.marketId, "SELL", sideUp, matched, buyerPrice);
        await record(tx, order.userId, data.marketId, "BUY", sideUp, matched, buyerPrice);

        order.filledQty += matched;
        tier.availableQty -= matched;
        left -= matched;
      }
    }

    // Unfilled remainder rests as a regular sell on its own book.
    if (left > 0) {
      restOrder(books[side], data.price, {
        qty: left,
        filledQty: 0,
        userId,
        originalOrderId: orderId,
        reverseOrder: false,
      });
    }
  }

  cleanOrderbook(books.yes);
  cleanOrderbook(books.no);

  await tx.market.update({
    where: { id: data.marketId },
    data: { yesOrderbook: books.yes, noOrderbook: books.no },
  });

  return { filledQty: data.qty - left, remainingQty: left, orderId };
}

// ---------------------------------------------------------------------
// Split / Merge
// ---------------------------------------------------------------------

export async function splitPairs(
  tx: Tx,
  userId: string,
  marketId: string,
  qty: number
) {
  await loadOpenMarket(tx, marketId);
  const user = await lockUser(tx, userId);
  if (!user) throw new TradeError("User not found");

  await debit(tx, userId, qty * PAYOUT, "Insufficient balance to split");
  await addPosition(tx, userId, marketId, "YES", qty);
  await addPosition(tx, userId, marketId, "NO", qty);
  await tx.market.update({
    where: { id: marketId },
    data: { totalQty: { increment: qty } },
  });
  await record(tx, userId, marketId, "SPLIT", "YES", qty, 50);
}

export async function mergePairs(
  tx: Tx,
  userId: string,
  marketId: string,
  qty: number
) {
  await loadOpenMarket(tx, marketId);
  const user = await lockUser(tx, userId);
  if (!user) throw new TradeError("User not found");

  const msg = `You must own at least ${qty} YES and ${qty} NO shares to merge`;
  await removePosition(tx, userId, marketId, "YES", qty, msg);
  await removePosition(tx, userId, marketId, "NO", qty, msg);
  await credit(tx, userId, qty * PAYOUT);
  await tx.market.update({
    where: { id: marketId },
    data: { totalQty: { decrement: qty } },
  });
  await record(tx, userId, marketId, "MERGE", "YES", qty, 50);
}

// ---------------------------------------------------------------------
// Resting-order release (used by resolve, delete and cancel)
// ---------------------------------------------------------------------

// Give back whatever an unfilled resting order is holding:
//  - resting BUY (reverseOrder): refund locked cash = unfilled * (100 - key)
//  - resting SELL: return locked shares to the seller's position
async function releaseOrder(
  tx: Tx,
  marketId: string,
  bookSide: "yes" | "no",
  key: number,
  order: OrderbookOrder
) {
  const unfilled = order.qty - order.filledQty;
  if (unfilled <= 0) return 0;
  if (order.reverseOrder) {
    await credit(tx, order.userId, unfilled * (100 - key));
  } else {
    await addPosition(
      tx,
      order.userId,
      marketId,
      bookSide === "yes" ? "YES" : "NO",
      unfilled
    );
  }
  return unfilled;
}

async function releaseAllOrders(
  tx: Tx,
  marketId: string,
  yes: Orderbook,
  no: Orderbook
) {
  for (const [bookSide, book] of [
    ["yes", yes],
    ["no", no],
  ] as const) {
    for (const priceKey of Object.keys(book)) {
      const key = Number(priceKey);
      const tier = book[key];
      if (!tier) continue;
      for (const order of tier.orders) {
        await releaseOrder(tx, marketId, bookSide, key, order);
      }
    }
  }
}

// ---------------------------------------------------------------------
// Resolve market
// ---------------------------------------------------------------------

export async function resolveMarketTx(
  tx: Tx,
  marketId: string,
  resolution: PositionSide
) {
  const market = await lockMarket(tx, marketId);
  if (!market) throw new TradeError("Market not found");
  if (market.resolution) throw new TradeError("Market is already resolved");

  // 1. Refund resting orders (cash back to buyers, shares back to sellers).
  await releaseAllOrders(
    tx,
    marketId,
    parseOrderbook(market.yesOrderbook),
    parseOrderbook(market.noOrderbook)
  );

  // 2. Pay winners PAYOUT per share, then zero every position.
  const positions = await tx.position.findMany({
    where: { marketId, qty: { gt: 0 } },
  });
  for (const pos of positions) {
    if (pos.type === resolution) {
      await credit(tx, pos.userId, pos.qty * PAYOUT);
    }
    await tx.position.update({ where: { id: pos.id }, data: { qty: 0 } });
  }

  // 3. Close the market and clear the books.
  await tx.market.update({
    where: { id: marketId },
    data: { resolution, yesOrderbook: {}, noOrderbook: {} },
  });
}

// ---------------------------------------------------------------------
// Cancel a resting order
// ---------------------------------------------------------------------

export async function cancelOrderTx(
  tx: Tx,
  userId: string,
  marketId: string,
  orderId: string
) {
  const market = await loadOpenMarket(tx, marketId);
  const yes = parseOrderbook(market.yesOrderbook);
  const no = parseOrderbook(market.noOrderbook);

  let cancelledQty = 0;
  for (const [bookSide, book] of [
    ["yes", yes],
    ["no", no],
  ] as const) {
    for (const priceKey of Object.keys(book)) {
      const key = Number(priceKey);
      const tier = book[key];
      if (!tier) continue;
      for (const order of tier.orders) {
        if (order.originalOrderId !== orderId || order.userId !== userId) continue;
        const released = await releaseOrder(tx, marketId, bookSide, key, order);
        if (released > 0) {
          order.qty = order.filledQty; // becomes fully "filled" -> cleaned out
          cancelledQty += released;
        }
      }
    }
  }

  if (cancelledQty === 0) {
    throw new TradeError("Open order not found (it may already be filled or cancelled)");
  }

  cleanOrderbook(yes);
  cleanOrderbook(no);
  await tx.market.update({
    where: { id: marketId },
    data: { yesOrderbook: yes, noOrderbook: no },
  });
  return { cancelledQty };
}

// ---------------------------------------------------------------------
// Delete market (admin)
// ---------------------------------------------------------------------

// Everyone is made whole before the market disappears:
//  - resting buy cash is refunded, resting sell shares are returned
//  - for an UNRESOLVED market, every remaining share is refunded at the
//    mid price (DELETE_REFUND_PER_SHARE = 50P). Since YES supply == NO
//    supply == totalQty, this refunds exactly PAYOUT per outstanding pair.
export async function deleteMarketTx(tx: Tx, marketId: string) {
  const market = await lockMarket(tx, marketId);
  if (!market) throw new TradeError("Market not found");

  await releaseAllOrders(
    tx,
    marketId,
    parseOrderbook(market.yesOrderbook),
    parseOrderbook(market.noOrderbook)
  );

  if (!market.resolution) {
    const positions = await tx.position.findMany({
      where: { marketId, qty: { gt: 0 } },
    });
    for (const pos of positions) {
      await credit(tx, pos.userId, pos.qty * DELETE_REFUND_PER_SHARE);
    }
  }

  await tx.position.deleteMany({ where: { marketId } });
  await tx.orderHistory.deleteMany({ where: { marketId } });
  await tx.market.delete({ where: { id: marketId } });
}

// ---------------------------------------------------------------------
// Open orders view (read-only)
// ---------------------------------------------------------------------

export interface OpenOrderView {
  marketId: string;
  marketTitle: string;
  orderId: string;
  type: "buy" | "sell";
  side: "yes" | "no";
  price: number; // user's limit price in paise
  qty: number; // unfilled shares
}

export function collectOpenOrders(
  markets: { id: string; title: string; yesOrderbook: any; noOrderbook: any }[],
  userId: string
): OpenOrderView[] {
  const out: OpenOrderView[] = [];
  for (const m of markets) {
    for (const [bookSide, book] of [
      ["yes", parseOrderbook(m.yesOrderbook)],
      ["no", parseOrderbook(m.noOrderbook)],
    ] as const) {
      for (const priceKey of Object.keys(book)) {
        const key = Number(priceKey);
        for (const order of book[key]?.orders ?? []) {
          const unfilled = order.qty - order.filledQty;
          if (order.userId !== userId || unfilled <= 0) continue;
          const opposite = bookSide === "yes" ? "no" : "yes";
          out.push({
            marketId: m.id,
            marketTitle: m.title,
            orderId: order.originalOrderId,
            type: order.reverseOrder ? "buy" : "sell",
            side: order.reverseOrder ? opposite : bookSide,
            price: order.reverseOrder ? 100 - key : key,
            qty: unfilled,
          });
        }
      }
    }
  }
  return out;
}

import { describe, expect, test } from "bun:test";
import {
  TradeError,
  executeOrder,
  splitPairs,
  mergePairs,
  resolveMarketTx,
  cancelOrderTx,
  deleteMarketTx,
  collectOpenOrders,
  parseOrderbook,
  type OrderInput,
} from "./engine";

// ---------------------------------------------------------------------
// In-memory fake of the subset of the Prisma transaction client that the
// engine uses. `runTx` snapshots state and restores it if the callback
// throws, mimicking a database rollback.
// ---------------------------------------------------------------------
type PosType = "YES" | "NO";

class FakeDb {
  users = new Map<string, { id: string; address: string; usdBalance: number }>();
  markets = new Map<string, any>();
  positions: { id: string; userId: string; marketId: string; type: PosType; qty: number }[] = [];
  history: any[] = [];
  private seq = 0;

  addUser(id: string, usdBalance: number) {
    this.users.set(id, { id, address: id, usdBalance });
  }
  addMarket(id: string) {
    this.markets.set(id, {
      id,
      yesOrderbook: {},
      noOrderbook: {},
      totalQty: 0,
      resolution: null,
    });
  }
  cash(id: string) {
    return this.users.get(id)!.usdBalance;
  }
  pos(userId: string, marketId: string, type: PosType) {
    return (
      this.positions.find(
        (p) => p.userId === userId && p.marketId === marketId && p.type === type
      )?.qty ?? 0
    );
  }
  book(marketId: string, side: "yes" | "no") {
    return parseOrderbook(this.markets.get(marketId)[side === "yes" ? "yesOrderbook" : "noOrderbook"]);
  }

  private snapshot() {
    return structuredClone({
      users: [...this.users.entries()],
      markets: [...this.markets.entries()],
      positions: this.positions,
      history: this.history,
      seq: this.seq,
    });
  }
  private restore(s: ReturnType<FakeDb["snapshot"]>) {
    this.users = new Map(s.users);
    this.markets = new Map(s.markets);
    this.positions = s.positions;
    this.history = s.history;
    this.seq = s.seq;
  }

  async runTx<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const snap = this.snapshot();
    try {
      return await fn(this.tx());
    } catch (e) {
      this.restore(snap);
      throw e;
    }
  }

  private applyNumeric(current: number, v: any) {
    if (typeof v === "number") return v;
    if (v?.increment !== undefined) return current + v.increment;
    if (v?.decrement !== undefined) return current - v.decrement;
    throw new Error("unsupported numeric update");
  }

  private tx() {
    const db = this;
    return {
      $queryRaw: async (strings: TemplateStringsArray, ...vals: any[]) => {
        const text = strings.join("?");
        if (text.includes('"Market"')) {
          const m = db.markets.get(vals[0]);
          return m ? [structuredClone(m)] : [];
        }
        if (text.includes('"User"')) {
          const u = db.users.get(vals[0]);
          return u ? [{ ...u }] : [];
        }
        throw new Error("unexpected raw query: " + text);
      },
      user: {
        update: async ({ where, data }: any) => {
          const u = db.users.get(where.id)!;
          u.usdBalance = db.applyNumeric(u.usdBalance, data.usdBalance);
          return u;
        },
        updateMany: async ({ where, data }: any) => {
          const u = db.users.get(where.id);
          if (!u || (where.usdBalance?.gte !== undefined && u.usdBalance < where.usdBalance.gte)) {
            return { count: 0 };
          }
          u.usdBalance = db.applyNumeric(u.usdBalance, data.usdBalance);
          return { count: 1 };
        },
      },
      position: {
        upsert: async ({ where, update, create }: any) => {
          const k = where.userId_marketId_type;
          const p = db.positions.find(
            (x) => x.userId === k.userId && x.marketId === k.marketId && x.type === k.type
          );
          if (p) p.qty = db.applyNumeric(p.qty, update.qty);
          else db.positions.push({ id: `p${++db.seq}`, ...create });
        },
        updateMany: async ({ where, data }: any) => {
          const p = db.positions.find(
            (x) =>
              x.userId === where.userId &&
              x.marketId === where.marketId &&
              x.type === where.type &&
              x.qty >= where.qty.gte
          );
          if (!p) return { count: 0 };
          p.qty = db.applyNumeric(p.qty, data.qty);
          return { count: 1 };
        },
        findMany: async ({ where }: any) =>
          db.positions
            .filter((x) => x.marketId === where.marketId && (where.qty?.gt === undefined || x.qty > where.qty.gt))
            .map((x) => ({ ...x })),
        update: async ({ where, data }: any) => {
          const p = db.positions.find((x) => x.id === where.id)!;
          p.qty = db.applyNumeric(p.qty, data.qty);
        },
        deleteMany: async ({ where }: any) => {
          db.positions = db.positions.filter((x) => x.marketId !== where.marketId);
        },
      },
      market: {
        update: async ({ where, data }: any) => {
          const m = db.markets.get(where.id)!;
          if (data.yesOrderbook !== undefined) m.yesOrderbook = structuredClone(data.yesOrderbook);
          if (data.noOrderbook !== undefined) m.noOrderbook = structuredClone(data.noOrderbook);
          if (data.totalQty !== undefined) m.totalQty = db.applyNumeric(m.totalQty, data.totalQty);
          if (data.resolution !== undefined) m.resolution = data.resolution;
        },
        delete: async ({ where }: any) => {
          db.markets.delete(where.id);
        },
      },
      orderHistory: {
        create: async ({ data }: any) => {
          db.history.push({ ...data });
        },
        deleteMany: async ({ where }: any) => {
          db.history = db.history.filter((h) => h.marketId !== where.marketId);
        },
      },
    };
  }
}

const M = "m1";
let oid = 0;
const order = (db: FakeDb, userId: string, o: Omit<OrderInput, "marketId">, marketId = M) =>
  db.runTx((tx) => executeOrder(tx, userId, { marketId, ...o }, `o${++oid}`));
const split = (db: FakeDb, u: string, qty: number) => db.runTx((tx) => splitPairs(tx, u, M, qty));
const merge = (db: FakeDb, u: string, qty: number) => db.runTx((tx) => mergePairs(tx, u, M, qty));

function fresh(users: Record<string, number> = { A: 100000, B: 100000, C: 100000 }) {
  const db = new FakeDb();
  for (const [id, cash] of Object.entries(users)) db.addUser(id, cash);
  db.addMarket(M);
  return db;
}

describe("regression: seller shares are not deducted twice", () => {
  test("resting sell filled by a buyer leaves seller's remaining shares intact", async () => {
    const db = fresh();
    await split(db, "A", 10); // A: 10 YES, 10 NO
    await order(db, "A", { side: "yes", type: "sell", price: 60, qty: 5 });
    expect(db.pos("A", M, "YES")).toBe(5); // 5 locked in the order
    await order(db, "B", { side: "yes", type: "buy", price: 60, qty: 5 });
    expect(db.pos("A", M, "YES")).toBe(5); // BUG (old code): became 0
    expect(db.pos("B", M, "YES")).toBe(5);
    expect(db.cash("A")).toBe(100000 - 1000 + 300);
    expect(db.cash("B")).toBe(100000 - 300);
  });

  test("same for NO", async () => {
    const db = fresh();
    await split(db, "A", 10);
    await order(db, "A", { side: "no", type: "sell", price: 30, qty: 4 });
    await order(db, "B", { side: "no", type: "buy", price: 30, qty: 4 });
    expect(db.pos("A", M, "NO")).toBe(6);
    expect(db.pos("B", M, "NO")).toBe(4);
  });
});

describe("matching", () => {
  test("unfilled buy rests as counter-order on the opposite book", async () => {
    const db = fresh();
    const r = await order(db, "A", { side: "yes", type: "buy", price: 60, qty: 10 });
    expect(r.filledQty).toBe(0);
    expect(r.remainingQty).toBe(10);
    expect(db.cash("A")).toBe(100000 - 600);
    const no = db.book(M, "no");
    expect(no[40]?.availableQty).toBe(10);
    expect(no[40]?.orders[0]).toMatchObject({ userId: "A", reverseOrder: true });
  });

  test("complementary buys mint a new YES/NO pair", async () => {
    const db = fresh();
    await order(db, "A", { side: "yes", type: "buy", price: 60, qty: 10 });
    const r = await order(db, "B", { side: "no", type: "buy", price: 40, qty: 10 });
    expect(r.filledQty).toBe(10);
    expect(db.pos("A", M, "YES")).toBe(10);
    expect(db.pos("B", M, "NO")).toBe(10);
    expect(db.markets.get(M).totalQty).toBe(10);
    expect(Object.keys(db.book(M, "no"))).toHaveLength(0);
    expect(db.cash("A")).toBe(100000 - 600);
    expect(db.cash("B")).toBe(100000 - 400);
  });

  test("price improvement is refunded", async () => {
    const db = fresh();
    await split(db, "A", 10);
    await order(db, "A", { side: "yes", type: "sell", price: 50, qty: 10 });
    await order(db, "B", { side: "yes", type: "buy", price: 70, qty: 10 });
    expect(db.cash("B")).toBe(100000 - 500); // paid 50, not 70
  });

  test("partial fill rests the remainder", async () => {
    const db = fresh();
    await split(db, "A", 10);
    await order(db, "A", { side: "yes", type: "sell", price: 50, qty: 4 });
    const r = await order(db, "B", { side: "yes", type: "buy", price: 50, qty: 10 });
    expect(r.filledQty).toBe(4);
    expect(r.remainingQty).toBe(6);
    expect(db.book(M, "no")[50]?.availableQty).toBe(6);
  });

  test("sell matches the best (highest) resting buyer first and records both histories", async () => {
    const db = fresh();
    await split(db, "C", 10);
    await order(db, "A", { side: "yes", type: "buy", price: 40, qty: 5 }); // rests NO@60
    await order(db, "B", { side: "yes", type: "buy", price: 70, qty: 5 }); // rests NO@30
    const r = await order(db, "C", { side: "yes", type: "sell", price: 30, qty: 5 });
    expect(r.filledQty).toBe(5);
    expect(db.pos("B", M, "YES")).toBe(5); // B (70) served first
    expect(db.pos("A", M, "YES")).toBe(0);
    expect(db.cash("C")).toBe(100000 - 1000 + 350);
    expect(db.history.filter((h) => h.userId === "B" && h.orderType === "BUY")).toHaveLength(1);
    expect(db.history.filter((h) => h.userId === "C" && h.orderType === "SELL")).toHaveLength(1);
  });

  test("a user never trades against their own resting order", async () => {
    const db = fresh();
    await split(db, "A", 10);
    await order(db, "A", { side: "yes", type: "sell", price: 50, qty: 5 });
    const r = await order(db, "A", { side: "yes", type: "buy", price: 50, qty: 5 });
    expect(r.filledQty).toBe(0);
    expect(db.history.filter((h) => h.orderType === "BUY" || h.orderType === "SELL")).toHaveLength(0);
  });
});

describe("validation and rollback", () => {
  test("insufficient balance rejects and changes nothing", async () => {
    const db = fresh({ A: 100 });
    await expect(order(db, "A", { side: "yes", type: "buy", price: 60, qty: 10 })).rejects.toBeInstanceOf(TradeError);
    expect(db.cash("A")).toBe(100);
    expect(Object.keys(db.book(M, "no"))).toHaveLength(0);
  });

  test("selling shares you do not own is rejected", async () => {
    const db = fresh();
    await expect(order(db, "A", { side: "yes", type: "sell", price: 60, qty: 1 })).rejects.toThrow("Insufficient YES shares");
  });

  test("cannot sell more than you hold (position never goes negative)", async () => {
    const db = fresh();
    await split(db, "A", 3);
    await expect(order(db, "A", { side: "yes", type: "sell", price: 60, qty: 4 })).rejects.toBeInstanceOf(TradeError);
    expect(db.pos("A", M, "YES")).toBe(3);
  });

  test("merge needs both sides; partial failure rolls back", async () => {
    const db = fresh();
    await split(db, "A", 5);
    await order(db, "A", { side: "no", type: "sell", price: 50, qty: 5 }); // locks all NO
    await expect(merge(db, "A", 5)).rejects.toBeInstanceOf(TradeError);
    expect(db.pos("A", M, "YES")).toBe(5); // YES not lost by the failed merge
  });

  test("unknown market", async () => {
    const db = fresh();
    await expect(order(db, "A", { side: "yes", type: "buy", price: 50, qty: 1 }, "nope")).rejects.toThrow("Market not found");
  });
});

describe("split / merge / resolve", () => {
  test("split then merge round-trips cash", async () => {
    const db = fresh();
    await split(db, "A", 7);
    expect(db.cash("A")).toBe(100000 - 700);
    await merge(db, "A", 7);
    expect(db.cash("A")).toBe(100000);
    expect(db.markets.get(M).totalQty).toBe(0);
  });

  test("split is refused on a resolved market", async () => {
    const db = fresh();
    await db.runTx((tx) => resolveMarketTx(tx, M, "YES"));
    await expect(split(db, "A", 1)).rejects.toBeInstanceOf(TradeError);
  });

  test("resolve pays Re 1 (100P) per winning share and refunds resting orders", async () => {
    const db = fresh();
    await split(db, "A", 10); // A: 10 YES, 10 NO
    await order(db, "A", { side: "yes", type: "sell", price: 70, qty: 4 }); // 4 YES locked in book
    await order(db, "B", { side: "yes", type: "buy", price: 20, qty: 5 }); // B cash 100 locked
    const before = db.cash("A") + db.cash("B") + db.cash("C");
    await db.runTx((tx) => resolveMarketTx(tx, M, "YES"));
    // A: 6 YES in position + 4 returned = 10 winning shares -> 1000
    expect(db.cash("A")).toBe(100000 - 1000 + 1000);
    expect(db.cash("B")).toBe(100000); // fully refunded
    expect(db.cash("A") + db.cash("B") + db.cash("C")).toBe(before + 1000 + 100);
    expect(db.markets.get(M).resolution).toBe("YES");
    expect(db.positions.every((p) => p.qty === 0)).toBe(true);
    expect(Object.keys(db.book(M, "yes")).length + Object.keys(db.book(M, "no")).length).toBe(0);
    await expect(order(db, "A", { side: "yes", type: "buy", price: 50, qty: 1 })).rejects.toBeInstanceOf(TradeError);
    await expect(db.runTx((tx) => resolveMarketTx(tx, M, "NO"))).rejects.toThrow("already resolved");
  });

  test("resolve to NO pays the NO holders", async () => {
    const db = fresh();
    await split(db, "A", 3);
    await order(db, "A", { side: "yes", type: "sell", price: 50, qty: 3 });
    await order(db, "B", { side: "yes", type: "buy", price: 50, qty: 3 });
    await db.runTx((tx) => resolveMarketTx(tx, M, "NO"));
    expect(db.cash("A")).toBe(100000 - 300 + 150 + 300); // sold YES@50, NO pays 300
    expect(db.cash("B")).toBe(100000 - 150); // YES lost
  });
});

describe("cancel order", () => {
  test("cancelling a resting buy refunds the locked cash", async () => {
    const db = fresh();
    const r = await order(db, "A", { side: "yes", type: "buy", price: 60, qty: 10 });
    expect(db.cash("A")).toBe(99400);
    await db.runTx((tx) => cancelOrderTx(tx, "A", M, r.orderId));
    expect(db.cash("A")).toBe(100000);
    expect(Object.keys(db.book(M, "no"))).toHaveLength(0);
  });

  test("cancelling a resting sell returns the shares", async () => {
    const db = fresh();
    await split(db, "A", 5);
    const r = await order(db, "A", { side: "yes", type: "sell", price: 60, qty: 5 });
    expect(db.pos("A", M, "YES")).toBe(0);
    await db.runTx((tx) => cancelOrderTx(tx, "A", M, r.orderId));
    expect(db.pos("A", M, "YES")).toBe(5);
  });

  test("only the owner can cancel; filled orders cannot be cancelled", async () => {
    const db = fresh();
    const r = await order(db, "A", { side: "yes", type: "buy", price: 60, qty: 2 });
    await expect(db.runTx((tx) => cancelOrderTx(tx, "B", M, r.orderId))).rejects.toBeInstanceOf(TradeError);
    await order(db, "B", { side: "no", type: "buy", price: 40, qty: 2 });
    await expect(db.runTx((tx) => cancelOrderTx(tx, "A", M, r.orderId))).rejects.toBeInstanceOf(TradeError);
  });

  test("partially filled order cancels only the unfilled part", async () => {
    const db = fresh();
    const r = await order(db, "A", { side: "yes", type: "buy", price: 60, qty: 10 });
    await order(db, "B", { side: "no", type: "buy", price: 40, qty: 4 });
    await db.runTx((tx) => cancelOrderTx(tx, "A", M, r.orderId));
    expect(db.cash("A")).toBe(100000 - 600 + 6 * 60); // 6 unfilled shares * 60P locked each are refunded
    expect(db.pos("A", M, "YES")).toBe(4);
  });

  test("open orders view describes the user's own limit orders", async () => {
    const db = fresh();
    await split(db, "A", 5);
    await order(db, "A", { side: "yes", type: "buy", price: 60, qty: 2 });
    await order(db, "A", { side: "no", type: "sell", price: 45, qty: 3 });
    const open = collectOpenOrders([{ id: M, title: "T", ...db.markets.get(M) }], "A");
    expect(open).toHaveLength(2);
    expect(open).toContainEqual(expect.objectContaining({ type: "buy", side: "yes", price: 60, qty: 2 }));
    expect(open).toContainEqual(expect.objectContaining({ type: "sell", side: "no", price: 45, qty: 3 }));
    expect(collectOpenOrders([{ id: M, title: "T", ...db.markets.get(M) }], "B")).toHaveLength(0);
  });
});

describe("delete market", () => {
  test("everyone is made whole when an unresolved market is deleted", async () => {
    const db = fresh();
    await split(db, "A", 10);
    await order(db, "A", { side: "yes", type: "sell", price: 70, qty: 4 });
    await order(db, "B", { side: "yes", type: "buy", price: 20, qty: 5 });
    await order(db, "C", { side: "yes", type: "buy", price: 70, qty: 4 }); // buys A's YES @70
    const total = db.cash("A") + db.cash("B") + db.cash("C");
    await db.runTx((tx) => deleteMarketTx(tx, M));
    // All money that was ever put in comes back: total equals starting 300000
    expect(db.cash("A") + db.cash("B") + db.cash("C")).toBe(300000);
    expect(total).toBeLessThan(300000);
    expect(db.markets.has(M)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// Randomised invariant test
// ---------------------------------------------------------------------
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function checkInvariants(db: FakeDb, initialCash: number) {
  let cash = 0;
  for (const u of db.users.values()) {
    expect(u.usdBalance).toBeGreaterThanOrEqual(0);
    cash += u.usdBalance;
  }
  for (const p of db.positions) expect(p.qty).toBeGreaterThanOrEqual(0);

  const m = db.markets.get(M);
  let lockedCash = 0;
  let restingYes = 0;
  let restingNo = 0;
  for (const side of ["yes", "no"] as const) {
    const book = db.book(M, side);
    for (const key of Object.keys(book)) {
      const tier = book[key]!;
      let sum = 0;
      for (const o of tier.orders) {
        const unfilled = o.qty - o.filledQty;
        expect(unfilled).toBeGreaterThan(0);
        sum += unfilled;
        if (o.reverseOrder) lockedCash += unfilled * (100 - Number(key));
        else if (side === "yes") restingYes += unfilled;
        else restingNo += unfilled;
      }
      expect(tier.availableQty).toBe(sum);
    }
  }
  const yes = db.positions.filter((p) => p.type === "YES").reduce((s, p) => s + p.qty, 0) + restingYes;
  const no = db.positions.filter((p) => p.type === "NO").reduce((s, p) => s + p.qty, 0) + restingNo;
  // Supply of YES == supply of NO == number of minted pairs
  expect(yes).toBe(m.totalQty);
  expect(no).toBe(m.totalQty);
  // Money conservation: cash + cash locked in resting buys + Re 1 per pair
  expect(cash + lockedCash + 100 * m.totalQty).toBe(initialCash);
}

describe("fuzz: money and share conservation", () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`random sequence, seed ${seed}`, async () => {
      const users = ["A", "B", "C", "D"];
      const db = fresh(Object.fromEntries(users.map((u) => [u, 50000])));
      const initial = 4 * 50000;
      const rand = rng(seed);
      const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]!;
      const placed: { user: string; id: string }[] = [];

      for (let i = 0; i < 400; i++) {
        const u = pick(users);
        const roll = rand();
        try {
          if (roll < 0.15) await split(db, u, 1 + Math.floor(rand() * 10));
          else if (roll < 0.22) await merge(db, u, 1 + Math.floor(rand() * 5));
          else if (roll < 0.3 && placed.length) {
            const o = pick(placed);
            await db.runTx((tx) => cancelOrderTx(tx, o.user, M, o.id));
          } else {
            const r = await order(db, u, {
              side: pick(["yes", "no"] as const),
              type: pick(["buy", "sell"] as const),
              price: 1 + Math.floor(rand() * 99),
              qty: 1 + Math.floor(rand() * 10),
            });
            if (r.remainingQty > 0) placed.push({ user: u, id: r.orderId });
          }
        } catch (e) {
          if (!(e instanceof TradeError)) throw e;
        }
        checkInvariants(db, initial);
      }

      // Finally resolve: all value ends up as cash, nothing created or lost.
      await db.runTx((tx) => resolveMarketTx(tx, M, seed % 2 ? "YES" : "NO"));
      let cash = 0;
      for (const u of db.users.values()) cash += u.usdBalance;
      expect(cash).toBe(initial);
    });
  }
});

import axios from "axios";
import { supabase } from "./hooks/useSupabase";
import type { Market, UserPosition, OrderHistoryItem } from "./types";

const API_BASE = "http://localhost:3000";

// Helper: Get active authorization token from Supabase session
export async function getAuthHeader(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

// 1. Fetch all markets (Public)
export async function fetchMarkets(): Promise<Market[]> {
  const res = await axios.get<{ markets: Market[] }>(`${API_BASE}/markets`);
  return res.data.markets;
}

// 2. Fetch single market details (Public)
export async function fetchMarketDetails(marketId: string): Promise<Market> {
  const res = await axios.get<Market>(`${API_BASE}/markets/${marketId}`);
  return res.data;
}

// 3. Create a new market (Admin only)
export async function createMarket(title: string, description: string, resolutionDescription: string) {
  const token = await getAuthHeader();
  if (!token) throw new Error("Please connect your Solana wallet first.");

  const res = await axios.post(
    `${API_BASE}/market/create`,
    { title, description, resolutionDescription },
    { headers: { authorization: token } }
  );
  return res.data;
}

// 4. Fetch user USD balance (Requires login)
export async function fetchBalance(): Promise<{ usdBalance: number; address: string; isAdmin: boolean }> {
  const token = await getAuthHeader();
  if (!token) {
    return { usdBalance: 0, address: "", isAdmin: false };
  }
  const res = await axios.get(`${API_BASE}/balance`, {
    headers: { authorization: token },
  });
  return res.data;
}

// 5. Add $500 test funds (Faucet - Requires login)
export async function claimFaucet(): Promise<number> {
  const token = await getAuthHeader();
  if (!token) throw new Error("Please connect your Solana wallet first to claim faucet funds.");

  const res = await axios.post(
    `${API_BASE}/faucet`,
    {},
    { headers: { authorization: token } }
  );
  return res.data.usdBalance;
}

// 6. Fetch user positions (Requires login)
export async function fetchPositions(): Promise<UserPosition[]> {
  const token = await getAuthHeader();
  if (!token) return [];

  const res = await axios.get<{ positions: UserPosition[] }>(`${API_BASE}/position`, {
    headers: { authorization: token },
  });
  return res.data.positions;
}

// 7. Fetch user trade history (Requires login)
export async function fetchHistory(): Promise<OrderHistoryItem[]> {
  const token = await getAuthHeader();
  if (!token) return [];

  const res = await axios.get<{ history: OrderHistoryItem[] }>(`${API_BASE}/history`, {
    headers: { authorization: token },
  });
  return res.data.history;
}

// 8. Place order (Buy/Sell YES or NO - Requires login)
export async function placeOrder(params: {
  marketId: string;
  side: "yes" | "no";
  type: "buy" | "sell";
  price: number;
  qty: number;
}) {
  const token = await getAuthHeader();
  if (!token) throw new Error("Please connect your Solana wallet first to trade.");

  const res = await axios.post(`${API_BASE}/buy`, params, {
    headers: { authorization: token },
  });
  return res.data;
}

// 9. Split USD into YES + NO shares (Requires login)
export async function splitContract(marketId: string, qty: number) {
  const token = await getAuthHeader();
  if (!token) throw new Error("Please connect your Solana wallet first to split contracts.");

  const res = await axios.post(
    `${API_BASE}/split`,
    { marketId, qty },
    { headers: { authorization: token } }
  );
  return res.data;
}

// 10. Merge YES + NO shares into USD (Requires login)
export async function mergeContract(marketId: string, qty: number) {
  const token = await getAuthHeader();
  if (!token) throw new Error("Please connect your Solana wallet first to merge contracts.");

  const res = await axios.post(
    `${API_BASE}/merge`,
    { marketId, qty },
    { headers: { authorization: token } }
  );
  return res.data;
}

// 11. Settle / Resolve Market (Admin only)
export async function resolveMarket(marketId: string, resolution: "YES" | "NO") {
  const token = await getAuthHeader();
  if (!token) throw new Error("Please connect your Solana wallet first.");

  const res = await axios.post(
    `${API_BASE}/market/resolve`,
    { marketId, resolution },
    { headers: { authorization: token } }
  );
  return res.data;
}

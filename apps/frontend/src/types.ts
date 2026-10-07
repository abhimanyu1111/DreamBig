// Frontend data models

export interface Market {
  id: string;
  title: string;
  description: string;
  resolutionDescription: string;
  totalQty: number;
  resolution: "YES" | "NO" | null;
  yesPrice: number; // In paise (e.g. 60 = ₹0.60)
  noPrice: number;  // In paise (e.g. 40 = ₹0.40)
  yesOrderbook?: Orderbook;
  noOrderbook?: Orderbook;
}

export interface OrderbookOrder {
  userId: string;
  qty: number;
  filledQty: number;
  originalOrderId: string;
  reverseOrder: boolean;
}

export interface Orderbook {
  [price: string]: {
    availableQty: number;
    orders: OrderbookOrder[];
  };
}

export interface UserPosition {
  id: string;
  userId: string;
  marketId: string;
  type: "YES" | "NO";
  qty: number;
  market: {
    id: string;
    title: string;
    resolution: "YES" | "NO" | null;
  };
}

export interface OrderHistoryItem {
  id: string;
  userId: string;
  marketId: string;
  orderType: "BUY" | "SELL" | "SPLIT" | "MERGE";
  positionType: "YES" | "NO";
  qty: number;
  price: number;
  market?: {
    id: string;
    title: string;
  };
}

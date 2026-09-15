import React from "react";
import type { Orderbook } from "../types";

interface OrderbookViewProps {
  yesOrderbook?: Orderbook;
  noOrderbook?: Orderbook;
}

export const OrderbookView: React.FC<OrderbookViewProps> = ({
  yesOrderbook = {},
  noOrderbook = {},
}) => {
  const yesPrices = Object.keys(yesOrderbook)
    .map(Number)
    .sort((a, b) => a - b);

  const noPrices = Object.keys(noOrderbook)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="orderbook-container">
      <div className="orderbook-header">
        <h4>📊 Live Orderbook Depth</h4>
        <span className="orderbook-sub">Central Limit Order Book (CLOB)</span>
      </div>

      <div className="orderbook-columns">
        {/* YES ORDERBOOK */}
        <div className="orderbook-col">
          <div className="col-title yes-title">
            <span>YES Book (Asks)</span>
            <span>Qty</span>
          </div>

          <div className="orderbook-list">
            {yesPrices.length === 0 ? (
              <div className="empty-book">No open orders</div>
            ) : (
              yesPrices.map((price) => {
                const tier = yesOrderbook[price];
                if (!tier) return null;
                const hasCounter = tier.orders.some((o) => o.reverseOrder);

                return (
                  <div key={`yes-${price}`} className="order-row yes-row">
                    <span className="order-price">{price}¢</span>
                    <span className="order-qty">
                      {tier.availableQty}
                      {hasCounter && <span className="counter-tag">🔄</span>}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* NO ORDERBOOK */}
        <div className="orderbook-col">
          <div className="col-title no-title">
            <span>NO Book (Asks)</span>
            <span>Qty</span>
          </div>

          <div className="orderbook-list">
            {noPrices.length === 0 ? (
              <div className="empty-book">No open orders</div>
            ) : (
              noPrices.map((price) => {
                const tier = noOrderbook[price];
                if (!tier) return null;
                const hasCounter = tier.orders.some((o) => o.reverseOrder);

                return (
                  <div key={`no-${price}`} className="order-row no-row">
                    <span className="order-price">{price}¢</span>
                    <span className="order-qty">
                      {tier.availableQty}
                      {hasCounter && <span className="counter-tag">🔄</span>}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

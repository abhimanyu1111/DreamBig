import React from "react";
import type { OrderHistoryItem } from "../types";

interface OrderHistoryTableProps {
  history: OrderHistoryItem[];
}

export const OrderHistoryTable: React.FC<OrderHistoryTableProps> = ({ history }) => {
  return (
    <div className="table-card">
      <div className="table-header-row">
        <h3>📜 Order & Trade History</h3>
        <span className="table-sub">{history.length} record(s)</span>
      </div>

      {history.length === 0 ? (
        <div className="empty-table-state">
          <span>No trade history recorded yet.</span>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Outcome</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Total Value</th>
                <th>Market</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => {
                const total = ((item.price * item.qty) / 100).toFixed(2);
                return (
                  <tr key={item.id}>
                    <td>
                      <span className={`tag-type ${item.orderType.toLowerCase()}`}>
                        {item.orderType}
                      </span>
                    </td>
                    <td>
                      <span className={`tag-outcome ${item.positionType.toLowerCase()}`}>
                        {item.positionType}
                      </span>
                    </td>
                    <td className="qty-col">{item.qty} shares</td>
                    <td className="price-col">{item.price}¢</td>
                    <td className="total-col">${total}</td>
                    <td className="market-col-name">
                      {item.market ? item.market.title : item.marketId}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

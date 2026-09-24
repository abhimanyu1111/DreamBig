import React from "react";
import type { UserPosition } from "../types";

interface PositionsTableProps {
  positions: UserPosition[];
  isLoggedIn: boolean;
  onConnectWallet: () => void;
  onSelectMarket: (marketId: string) => void;
}

export const PositionsTable: React.FC<PositionsTableProps> = ({
  positions,
  isLoggedIn,
  onConnectWallet,
  onSelectMarket,
}) => {
  return (
    <div className="table-card">
      <div className="table-header-row">
        <h3>💼 Your Active Positions</h3>
        <span className="table-sub">
          {isLoggedIn ? `${positions.length} active holding(s)` : "Login required"}
        </span>
      </div>

      {!isLoggedIn ? (
        <div className="empty-table-state">
          <span>Connect your Solana wallet to view your portfolio and share holdings.</span>
          <br />
          <button className="btn-connect-solana" style={{ marginTop: "0.85rem" }} onClick={onConnectWallet}>
            🟣 Connect Solana Wallet
          </button>
        </div>
      ) : positions.length === 0 ? (
        <div className="empty-table-state">
          <span>You don't hold any positions yet. Buy shares or split contracts above!</span>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Market</th>
                <th>Outcome</th>
                <th>Shares</th>
                <th>Est. Max Payout</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const maxPayout = (pos.qty * 1.0).toFixed(2);
                return (
                  <tr key={pos.id}>
                    <td className="market-col-name">{pos.market.title}</td>
                    <td>
                      <span className={`tag-outcome ${pos.type.toLowerCase()}`}>
                        {pos.type}
                      </span>
                    </td>
                    <td className="qty-col">{pos.qty.toLocaleString()} shares</td>
                    <td className="payout-col">${maxPayout}</td>
                    <td>
                      <button
                        className="btn-table-action"
                        onClick={() => onSelectMarket(pos.market.id)}
                      >
                        Trade
                      </button>
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

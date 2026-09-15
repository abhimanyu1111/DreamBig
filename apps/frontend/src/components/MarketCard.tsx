import React from "react";
import type { Market } from "../types";

interface MarketCardProps {
  market: Market;
  isSelected: boolean;
  onSelect: (market: Market) => void;
}

export const MarketCard: React.FC<MarketCardProps> = ({
  market,
  isSelected,
  onSelect,
}) => {
  const isResolved = Boolean(market.resolution);

  return (
    <div
      className={`market-card ${isSelected ? "selected" : ""} ${isResolved ? "resolved" : ""}`}
      onClick={() => onSelect(market)}
    >
      <div className="market-card-header">
        <h3 className="market-title">{market.title}</h3>
        {isResolved && (
          <span className={`status-badge resolved-${market.resolution?.toLowerCase()}`}>
            Resolved: {market.resolution}
          </span>
        )}
      </div>

      <p className="market-desc">{market.description}</p>

      {/* Probability Bar */}
      <div className="prob-bar-container">
        <div
          className="prob-bar-yes"
          style={{ width: `${market.yesPrice}%` }}
        ></div>
        <div
          className="prob-bar-no"
          style={{ width: `${100 - market.yesPrice}%` }}
        ></div>
      </div>

      <div className="market-odds-row">
        <div className="odds-badge yes">
          <span className="odds-label">YES</span>
          <span className="odds-val">{market.yesPrice}¢</span>
        </div>

        <div className="market-volume">
          <span>{market.totalQty.toLocaleString()} shares</span>
        </div>

        <div className="odds-badge no">
          <span className="odds-label">NO</span>
          <span className="odds-val">{market.noPrice}¢</span>
        </div>
      </div>
    </div>
  );
};

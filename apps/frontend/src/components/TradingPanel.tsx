import React, { useState } from "react";
import type { Market } from "../types";
import { placeOrder, splitContract, mergeContract, resolveMarket } from "../api";

interface TradingPanelProps {
  market: Market;
  isAdmin: boolean;
  isLoggedIn: boolean;
  onConnectWallet: () => void;
  onTradeSuccess: () => void;
}

export const TradingPanel: React.FC<TradingPanelProps> = ({
  market,
  isAdmin,
  isLoggedIn,
  onConnectWallet,
  onTradeSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<"trade" | "mint" | "settle">("trade");

  // Trading State
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [type, setType] = useState<"buy" | "sell">("buy");
  const [price, setPrice] = useState<number>(side === "yes" ? market.yesPrice : market.noPrice);
  const [qty, setQty] = useState<number>(10);

  // Mint / Merge State
  const [contractQty, setContractQty] = useState<number>(10);

  // Resolution State (Admin only)
  const [resolutionChoice, setResolutionChoice] = useState<"YES" | "NO">("YES");

  // Loading and Alert State
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);

  // Cost and payout calculation
  const totalCost = ((price * qty) / 100).toFixed(2);
  const maxPayout = ((100 * qty) / 100).toFixed(2);
  const potentialProfit = (((100 - price) * qty) / 100).toFixed(2);

  // Handle Trade Execution
  const handleExecuteTrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoggedIn) {
      onConnectWallet();
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const res = await placeOrder({
        marketId: market.id,
        side,
        type,
        price,
        qty,
      });

      setFeedback({
        message: `Order processed! Filled: ${res.data.filledQty} shares, Remaining: ${res.data.remainingQty} shares.`,
        isError: false,
      });
      onTradeSuccess();
    } catch (err: any) {
      setFeedback({
        message: err.response?.data?.message || err.message || "Failed to execute order",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle Split
  const handleSplit = async () => {
    if (!isLoggedIn) {
      onConnectWallet();
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await splitContract(market.id, contractQty);
      setFeedback({ message: res.message, isError: false });
      onTradeSuccess();
    } catch (err: any) {
      setFeedback({
        message: err.response?.data?.message || err.message || "Split failed",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle Merge
  const handleMerge = async () => {
    if (!isLoggedIn) {
      onConnectWallet();
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await mergeContract(market.id, contractQty);
      setFeedback({ message: res.message, isError: false });
      onTradeSuccess();
    } catch (err: any) {
      setFeedback({
        message: err.response?.data?.message || err.message || "Merge failed",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle Market Resolution (Admin only)
  const handleResolve = async () => {
    if (!isLoggedIn) {
      onConnectWallet();
      return;
    }
    setLoading(true);
    setFeedback(null);
    try {
      const res = await resolveMarket(market.id, resolutionChoice);
      setFeedback({ message: res.message, isError: false });
      onTradeSuccess();
    } catch (err: any) {
      setFeedback({
        message: err.response?.data?.message || err.message || "Resolution failed",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const isResolved = Boolean(market.resolution);

  return (
    <div className="trading-panel">
      {/* Tab Navigation */}
      <div className="panel-tabs">
        <button
          className={`panel-tab ${activeTab === "trade" ? "active" : ""}`}
          onClick={() => setActiveTab("trade")}
        >
          📈 Trade
        </button>
        <button
          className={`panel-tab ${activeTab === "mint" ? "active" : ""}`}
          onClick={() => setActiveTab("mint")}
        >
          🪙 Split / Merge
        </button>

        {/* ADMIN ONLY TAB */}
        {isAdmin && isLoggedIn && (
          <button
            className={`panel-tab ${activeTab === "settle" ? "active" : ""}`}
            onClick={() => setActiveTab("settle")}
          >
            👑 Resolve Market
          </button>
        )}
      </div>

      {feedback && (
        <div className={`feedback-alert ${feedback.isError ? "error" : "success"}`}>
          {feedback.message}
        </div>
      )}

      {/* =========================================
          TAB 1: TRADING FORM
          ========================================= */}
      {activeTab === "trade" && (
        <div>
          {isResolved ? (
            <div className="resolved-banner">
              ⚠️ This market is already resolved to <strong>{market.resolution}</strong>. Trading is closed.
            </div>
          ) : !isLoggedIn ? (
            <div className="auth-required-banner">
              <span className="auth-lock-icon">🔒</span>
              <h4>Wallet Login Required</h4>
              <p>Please connect your Solana wallet to buy or sell shares on this prediction market.</p>
              <button type="button" className="btn-connect-solana" onClick={onConnectWallet}>
                🟣 Connect Solana Wallet
              </button>
            </div>
          ) : (
            <form onSubmit={handleExecuteTrade} className="trade-form">
              {/* Buy or Sell Switcher */}
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${type === "buy" ? "active" : ""}`}
                  onClick={() => setType("buy")}
                >
                  Buy
                </button>
                <button
                  type="button"
                  className={`segment-btn ${type === "sell" ? "active" : ""}`}
                  onClick={() => setType("sell")}
                >
                  Sell
                </button>
              </div>

              {/* YES or NO Choice */}
              <div className="outcome-selector">
                <button
                  type="button"
                  className={`outcome-btn yes ${side === "yes" ? "active" : ""}`}
                  onClick={() => {
                    setSide("yes");
                    setPrice(market.yesPrice);
                  }}
                >
                  <span className="outcome-name">YES</span>
                  <span className="outcome-price">{market.yesPrice}¢</span>
                </button>

                <button
                  type="button"
                  className={`outcome-btn no ${side === "no" ? "active" : ""}`}
                  onClick={() => {
                    setSide("no");
                    setPrice(market.noPrice);
                  }}
                >
                  <span className="outcome-name">NO</span>
                  <span className="outcome-price">{market.noPrice}¢</span>
                </button>
              </div>

              {/* Price Input */}
              <div className="form-group">
                <div className="form-label-row">
                  <label>Limit Price</label>
                  <span className="label-sub">{price}¢ (${(price / 100).toFixed(2)})</span>
                </div>
                <div className="slider-input-row">
                  <input
                    type="range"
                    min="1"
                    max="99"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="price-slider"
                  />
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="number-input-small"
                  />
                  <span className="unit-label">¢</span>
                </div>
              </div>

              {/* Quantity Input */}
              <div className="form-group">
                <div className="form-label-row">
                  <label>Shares Quantity</label>
                  <span className="label-sub">1 share = $1.00 if correct</span>
                </div>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                  className="number-input-full"
                />
              </div>

              {/* Summary Cards */}
              <div className="trade-summary">
                <div className="summary-row">
                  <span>{type === "buy" ? "Total Investment" : "Est. Proceeds"}</span>
                  <strong className="summary-val">${totalCost}</strong>
                </div>

                {type === "buy" && (
                  <>
                    <div className="summary-row">
                      <span>Potential Payout</span>
                      <strong className="summary-green">${maxPayout}</strong>
                    </div>
                    <div className="summary-row">
                      <span>Potential Profit</span>
                      <span className="profit-badge">+${potentialProfit}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className={`btn-trade-execute ${side === "yes" ? "yes-bg" : "no-bg"}`}
              >
                {loading
                  ? "Processing Order..."
                  : `${type.toUpperCase()} ${side.toUpperCase()} @ ${price}¢`}
              </button>
            </form>
          )}
        </div>
      )}

      {/* =========================================
          TAB 2: SPLIT & MERGE CONTRACTS
          ========================================= */}
      {activeTab === "mint" && (
        <div className="mint-container">
          <p className="mint-explainer">
            In prediction markets, <strong>1 YES + 1 NO = $1.00 USD</strong>.
            You can split cash into both shares, or merge pairs back to cash anytime.
          </p>

          {!isLoggedIn ? (
            <div className="auth-required-banner">
              <span className="auth-lock-icon">🔒</span>
              <h4>Wallet Login Required</h4>
              <p>Please connect your Solana wallet to split or merge contract pairs.</p>
              <button type="button" className="btn-connect-solana" onClick={onConnectWallet}>
                🟣 Connect Solana Wallet
              </button>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Contract Pairs (Shares)</label>
                <input
                  type="number"
                  min="1"
                  value={contractQty}
                  onChange={(e) => setContractQty(Math.max(1, Number(e.target.value)))}
                  className="number-input-full"
                />
              </div>

              <div className="mint-actions-row">
                <button
                  onClick={handleSplit}
                  disabled={loading || isResolved}
                  className="btn-split"
                >
                  📥 Split ${contractQty}.00 → {contractQty} YES + {contractQty} NO
                </button>

                <button
                  onClick={handleMerge}
                  disabled={loading}
                  className="btn-merge"
                >
                  📤 Merge {contractQty} YES & NO → ${contractQty}.00 Cash
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* =========================================
          TAB 3: MARKET RESOLUTION (ADMIN ONLY)
          ========================================= */}
      {activeTab === "settle" && isAdmin && isLoggedIn && (
        <div className="settle-container">
          <h4>👑 Market Resolution (Admin Panel)</h4>
          <p className="settle-desc">
            Resolving pays out <strong>$1.00 (100¢)</strong> for every winning share directly to holders' balances.
          </p>

          {isResolved ? (
            <div className="resolved-banner">
              ✅ This market has already been resolved to <strong>{market.resolution}</strong>.
            </div>
          ) : (
            <div>
              <div className="outcome-selector">
                <button
                  type="button"
                  className={`outcome-btn yes ${resolutionChoice === "YES" ? "active" : ""}`}
                  onClick={() => setResolutionChoice("YES")}
                >
                  Resolve to YES
                </button>
                <button
                  type="button"
                  className={`outcome-btn no ${resolutionChoice === "NO" ? "active" : ""}`}
                  onClick={() => setResolutionChoice("NO")}
                >
                  Resolve to NO
                </button>
              </div>

              <button
                onClick={handleResolve}
                disabled={loading}
                className="btn-resolve-confirm"
              >
                {loading ? "Resolving..." : `Confirm Settlement to ${resolutionChoice}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

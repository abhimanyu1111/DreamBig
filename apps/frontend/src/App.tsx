import { useEffect, useState, useCallback, useRef } from "react";
import { useUser } from "./hooks/useUser";
import type { Market, UserPosition, OrderHistoryItem } from "./types";
import {
  fetchMarkets,
  fetchMarketDetails,
  fetchBalance,
  fetchPositions,
  fetchHistory,
  claimFaucet,
  deleteMarket,
} from "./api";

import { Navbar } from "./components/Navbar";
import { MarketCard } from "./components/MarketCard";
import { TradingPanel } from "./components/TradingPanel";
import { OrderbookView } from "./components/OrderbookView";
import { PositionsTable } from "./components/PositionsTable";
import { OrderHistoryTable } from "./components/OrderHistoryTable";
import { CreateMarketModal } from "./components/CreateMarketModal";
import { LoginModal } from "./components/LoginModal";

import "./App.css";

function App() {
  const user = useUser();
  const isLoggedIn = Boolean(user);

  // App State
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const selectedMarketIdRef = useRef<string | null>(null);
  const [usdBalance, setUsdBalance] = useState<number>(0);
  const [walletAddress, setWalletAddress] = useState<string>("");
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [positions, setPositions] = useState<UserPosition[]>([]);
  const [history, setHistory] = useState<OrderHistoryItem[]>([]);

  // UI State
  const [bottomTab, setBottomTab] = useState<"positions" | "history">("positions");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dreambig_anon") === "true";
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);

  const handleToggleAnonymous = () => {
    setIsAnonymous((prev) => {
      const nextVal = !prev;
      try {
        localStorage.setItem("dreambig_anon", String(nextVal));
      } catch {}
      return nextVal;
    });
  };

  // Open Unified Login Modal (Supports Solana & Email)
  const handleConnectWallet = () => {
    setIsLoginModalOpen(true);
  };

  // Load all app data from backend with independent error boundaries
  const loadData = useCallback(async () => {
    // 1. Fetch public markets list
    try {
      const marketList = await fetchMarkets();
      setMarkets(marketList);

      // Default select first active market or keep selected
      if (marketList.length > 0) {
        const currentActiveId = selectedMarketIdRef.current;
        const toSelect = currentActiveId
          ? marketList.find((m) => m.id === currentActiveId) || marketList[0]
          : marketList.find((m) => !m.resolution) || marketList[0];

        if (toSelect) {
          selectedMarketIdRef.current = toSelect.id;
          const detailed = await fetchMarketDetails(toSelect.id);
          setSelectedMarket(detailed);
        }
      }
    } catch (err) {
      console.warn("Markets load notice:", err);
    }

    // 2. Fetch User Profile independently if logged in
    if (isLoggedIn) {
      // Immediate optimistic address from Supabase user claims
      const optimisticAddress = (user?.user_metadata as any)?.custom_claims?.address || "";
      if (optimisticAddress && !walletAddress) {
        setWalletAddress(optimisticAddress);
      }

      try {
        const balanceData = await fetchBalance();
        setUsdBalance(balanceData.usdBalance);
        if (balanceData.address) setWalletAddress(balanceData.address);
        setIsAdmin(Boolean(balanceData.isAdmin));

        const userPositions = await fetchPositions();
        setPositions(userPositions);

        const userHistory = await fetchHistory();
        setHistory(userHistory);
      } catch (authErr) {
        console.warn("User data load notice:", authErr);
      }
    } else {
      // Clear user state when logged out
      setUsdBalance(0);
      setWalletAddress("");
      setIsAdmin(false);
      setPositions([]);
      setHistory([]);
    }

    setLoading(false);
  }, [isLoggedIn, user]);

  useEffect(() => {
    loadData();
  }, [user, loadData]);

  // Handle selecting a market without triggering full app re-fetch loop
  const handleSelectMarket = async (market: Market) => {
    selectedMarketIdRef.current = market.id;
    try {
      const detailed = await fetchMarketDetails(market.id);
      setSelectedMarket(detailed);
    } catch (err) {
      setSelectedMarket(market);
    }
  };

  // Handle Faucet Claim
  const handleClaimFaucet = async () => {
    if (!isLoggedIn) {
      handleConnectWallet();
      return;
    }
    try {
      const newBalance = await claimFaucet();
      setUsdBalance(newBalance);
      alert("🎉 Added +₹500.00 test balance to your wallet!");
    } catch (err: any) {
      alert(err?.response?.data?.message || err.message || "Failed to claim faucet");
    }
  };

  // Handle Delete Market (Admin only)
  const handleDeleteMarket = async (marketId: string) => {
    const toDelete = markets.find((m) => m.id === marketId) || selectedMarket;
    const confirmMsg = `Are you sure you want to delete "${toDelete?.title || "this market"}"?\n\nThis will permanently delete the market and its records from the database.`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteMarket(marketId);
      alert("🗑️ Market deleted successfully!");
      if (selectedMarket?.id === marketId) {
        setSelectedMarket(null);
        selectedMarketIdRef.current = null;
      }
      await loadData();
    } catch (err: any) {
      alert(err?.response?.data?.message || err?.message || "Failed to delete market");
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <Navbar
        usdBalance={usdBalance}
        walletAddress={walletAddress || user?.email || ""}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        isAnonymous={isAnonymous}
        onToggleAnonymous={handleToggleAnonymous}
        onRefresh={loadData}
        onClaimFaucet={handleClaimFaucet}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        onOpenLoginModal={() => setIsLoginModalOpen(true)}
      />

      <main className="main-content">
        {loading ? (
          <div className="loading-state">
            <span className="spinner"></span>
            <p>Connecting to DreamBig Market Engine...</p>
          </div>
        ) : (
          <div className="dashboard-grid">
            {/* LEFT COLUMN: MARKETS OVERVIEW */}
            <section className="left-column">
              <div className="section-header">
                <h2>Explore Markets</h2>
                <span className="section-badge">{markets.length} Available</span>
              </div>

              <div className="markets-list">
                {markets.map((market) => (
                  <MarketCard
                    key={market.id}
                    market={market}
                    isSelected={selectedMarket?.id === market.id}
                    onSelect={handleSelectMarket}
                  />
                ))}
              </div>
            </section>

            {/* RIGHT COLUMN: ACTIVE MARKET TRADING & ORDERBOOK */}
            <section className="right-column">
              {selectedMarket ? (
                <>
                  <div className="selected-market-header">
                    <div className="market-header-top-row">
                      <span className={selectedMarket.resolution ? "tag-resolved" : "tag-live"}>
                        {selectedMarket.resolution ? `Resolved: ${selectedMarket.resolution}` : "Active Market"}
                      </span>
                      {isAdmin && isLoggedIn && (
                        <button
                          type="button"
                          className="btn-delete-market"
                          onClick={() => handleDeleteMarket(selectedMarket.id)}
                          title="Delete this market as admin"
                        >
                          🗑️ Delete Market
                        </button>
                      )}
                    </div>
                    <h2>{selectedMarket.title}</h2>
                    <p className="resolution-criteria">
                      <strong>Resolution Criteria:</strong> {selectedMarket.resolutionDescription}
                    </p>
                  </div>

                  <div className="trading-row">
                    {/* Execution Panel */}
                    <div className="trading-col">
                      <TradingPanel
                        market={selectedMarket}
                        isAdmin={isAdmin}
                        isLoggedIn={isLoggedIn}
                        onConnectWallet={handleConnectWallet}
                        onTradeSuccess={loadData}
                      />
                    </div>

                    {/* Central Limit Order Book */}
                    <div className="orderbook-col-wrap">
                      <OrderbookView
                        yesOrderbook={selectedMarket.yesOrderbook}
                        noOrderbook={selectedMarket.noOrderbook}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-market-selection">
                  <p>Select a market from the left to trade.</p>
                </div>
              )}
            </section>
          </div>
        )}

        {/* BOTTOM SECTION: USER POSITIONS & HISTORY */}
        <section className="user-portfolio-section">
          <div className="portfolio-tabs">
            <button
              className={`portfolio-tab ${bottomTab === "positions" ? "active" : ""}`}
              onClick={() => setBottomTab("positions")}
            >
              💼 Open Positions ({positions.length})
            </button>
            <button
              className={`portfolio-tab ${bottomTab === "history" ? "active" : ""}`}
              onClick={() => setBottomTab("history")}
            >
              📜 Trade History ({history.length})
            </button>
          </div>

          <div className="portfolio-content">
            {bottomTab === "positions" ? (
              <PositionsTable
                positions={positions}
                isLoggedIn={isLoggedIn}
                onConnectWallet={handleConnectWallet}
                onSelectMarket={(marketId) => {
                  const m = markets.find((item) => item.id === marketId);
                  if (m) handleSelectMarket(m);
                }}
              />
            ) : (
              <OrderHistoryTable
                history={history}
                isLoggedIn={isLoggedIn}
                onConnectWallet={handleConnectWallet}
              />
            )}
          </div>
        </section>
      </main>

      {/* Modal for creating a new prediction market */}
      <CreateMarketModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadData}
      />

      {/* Unified Login Modal (Solana Web3 + Email Auth + Anonymity) */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={loadData}
        isAnonymous={isAnonymous}
        onToggleAnonymous={(val) => {
          setIsAnonymous(val);
          try {
            localStorage.setItem("dreambig_anon", String(val));
          } catch {}
        }}
      />
    </div>
  );
}

export default App;

import { useEffect, useState, useCallback, useRef } from "react";
import { useUser } from "./hooks/useUser";
import { supabase } from "./hooks/useSupabase";
import type { Market, UserPosition, OrderHistoryItem } from "./types";
import {
  fetchMarkets,
  fetchMarketDetails,
  fetchBalance,
  fetchPositions,
  fetchHistory,
  claimFaucet,
} from "./api";

import { Navbar } from "./components/Navbar";
import { MarketCard } from "./components/MarketCard";
import { TradingPanel } from "./components/TradingPanel";
import { OrderbookView } from "./components/OrderbookView";
import { PositionsTable } from "./components/PositionsTable";
import { OrderHistoryTable } from "./components/OrderHistoryTable";
import { CreateMarketModal } from "./components/CreateMarketModal";

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
  const [loading, setLoading] = useState(true);

  // Trigger Solana Web3 Connect
  const handleConnectWallet = async () => {
    try {
      await supabase.auth.signInWithWeb3({
        chain: "solana",
        statement: "I confirm that I want to sign in to prediction market DreamBig",
      });
    } catch (err) {
      console.error("Solana login error:", err);
    }
  };

  // Load all app data from backend
  const loadData = useCallback(async () => {
    try {
      // 1. Fetch public markets list
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

      // 2. Fetch User Profile only if logged in
      if (isLoggedIn) {
        const balanceData = await fetchBalance();
        setUsdBalance(balanceData.usdBalance);
        setWalletAddress(balanceData.address);
        setIsAdmin(Boolean(balanceData.isAdmin));

        // 3. Fetch Positions & History
        const userPositions = await fetchPositions();
        setPositions(userPositions);

        const userHistory = await fetchHistory();
        setHistory(userHistory);
      } else {
        // Clear user state when logged out
        setUsdBalance(0);
        setWalletAddress("");
        setIsAdmin(false);
        setPositions([]);
        setHistory([]);
      }
    } catch (err) {
      console.warn("Data load notice:", err);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

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
      alert("🎉 Added +$500.00 USD test balance to your wallet!");
    } catch (err: any) {
      alert(err.message || "Failed to claim faucet");
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <Navbar
        usdBalance={usdBalance}
        walletAddress={walletAddress}
        isLoggedIn={isLoggedIn}
        isAdmin={isAdmin}
        onRefresh={loadData}
        onClaimFaucet={handleClaimFaucet}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
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
                    <span className="tag-live">Active Market</span>
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
    </div>
  );
}

export default App;

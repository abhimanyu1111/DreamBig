import React from "react";
import { supabase } from "../hooks/useSupabase";

interface NavbarProps {
  usdBalance: number;
  walletAddress: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
  onRefresh: () => void;
  onClaimFaucet: () => void;
  onOpenCreateModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  usdBalance,
  walletAddress,
  isLoggedIn,
  isAdmin,
  onRefresh,
  onClaimFaucet,
  onOpenCreateModal,
}) => {
  // Format balance in cents to standard currency ($XX.XX)
  const formattedBalance = (usdBalance / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  // Shorten Solana or wallet address for clean display
  const shortAddress =
    walletAddress.length > 16
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress;

  const handleSolanaLogin = async () => {
    try {
      await supabase.auth.signInWithWeb3({
        chain: "solana",
        statement: "I confirm that I want to sign in to prediction market DreamBig",
      });
    } catch (err) {
      console.error("Solana login error:", err);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        <div className="logo-container">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">DreamBig</span>
          <span className="badge-beta">Prediction Market</span>
        </div>
      </div>

      <div className="navbar-right">
        {/* Market Creator Button: RESTRICTED TO LOGGED-IN ADMIN ONLY */}
        {isLoggedIn && isAdmin && (
          <button className="btn-secondary btn-admin" onClick={onOpenCreateModal}>
            👑 + Create Market
          </button>
        )}

        {/* Faucet Button */}
        <button
          className="btn-faucet"
          onClick={onClaimFaucet}
          title="Claim $500 free test balance"
        >
          🎁 Claim +$500 Faucet
        </button>

        {/* USD Balance Card */}
        <div className="balance-pill" onClick={onRefresh} title="Click to refresh balance">
          <span className="balance-label">Cash:</span>
          <span className="balance-value">{formattedBalance}</span>
          <span className="refresh-icon">🔄</span>
        </div>

        {/* Wallet Connection */}
        {isLoggedIn ? (
          <div className="wallet-connected">
            <span className="wallet-dot"></span>
            <span className="wallet-address" title={walletAddress}>
              {shortAddress}
            </span>
            {isAdmin && <span className="admin-pill">Admin</span>}
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : (
          <button className="btn-connect-solana" onClick={handleSolanaLogin}>
            🟣 Connect Solana
          </button>
        )}
      </div>
    </header>
  );
};

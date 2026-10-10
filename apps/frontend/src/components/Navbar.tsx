import React from "react";
import { supabase } from "../hooks/useSupabase";
import { formatRupees } from "../currency";

interface NavbarProps {
  usdBalance: number;
  walletAddress: string;
  isLoggedIn: boolean;
  isAdmin: boolean;
  isAnonymous: boolean;
  onToggleAnonymous: () => void;
  onRefresh: () => void;
  onClaimFaucet: () => void;
  onOpenCreateModal: () => void;
  onOpenLoginModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  usdBalance,
  walletAddress,
  isLoggedIn,
  isAdmin,
  isAnonymous,
  onToggleAnonymous,
  onRefresh,
  onClaimFaucet,
  onOpenCreateModal,
  onOpenLoginModal,
}) => {
  // Format balance in paise to rupees (₹XX.XX)
  const formattedBalance = isLoggedIn ? formatRupees(usdBalance) : formatRupees(0);

  // Determine display name based on anonymity preference
  let displayAddress = walletAddress;
  if (isAnonymous) {
    const seed = walletAddress
      ? (walletAddress.includes("@") ? walletAddress.split("@")[0].slice(0, 4) : walletAddress.slice(0, 4))
      : "User";
    displayAddress = `🕶️ Anon_${seed}`;
  } else if (walletAddress.includes("@")) {
    const parts = walletAddress.split("@");
    displayAddress = parts[0].length > 4 ? `${parts[0].slice(0, 3)}...` : parts[0];
  } else if (walletAddress.length > 16) {
    displayAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
  }

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
            <span className="hide-on-mobile">👑 + Create Market</span>
            <span className="show-on-mobile">👑 + Market</span>
          </button>
        )}

        {/* Faucet Button: Only visible when logged in */}
        {isLoggedIn && (
          <button
            className="btn-faucet"
            onClick={onClaimFaucet}
            title="Claim ₹500 free test balance"
          >
            <span className="hide-on-mobile">🎁 Claim +₹500 Faucet</span>
            <span className="show-on-mobile">🎁 +₹500</span>
          </button>
        )}

        {/* USD Balance Card */}
        {isLoggedIn ? (
          <div className="balance-pill" onClick={onRefresh} title="Click to refresh balance">
            <span className="balance-label">Cash:</span>
            <span className="balance-value">{formattedBalance}</span>
            <span className="refresh-icon">🔄</span>
          </div>
        ) : null}

        {/* Identity & Wallet Connection */}
        {isLoggedIn ? (
          <div className="wallet-connected">
            <span className="wallet-dot"></span>
            <span className="wallet-address" title={walletAddress}>
              {displayAddress}
            </span>
            <button
              type="button"
              className={`btn-anon-badge ${isAnonymous ? "active" : ""}`}
              onClick={onToggleAnonymous}
              title={isAnonymous ? "Identity is hidden (Click to make public)" : "Identity is public (Click to make anonymous)"}
            >
              {isAnonymous ? "🕶️ Anon" : "👁️ Public"}
            </button>
            {isAdmin && <span className="admin-pill">Admin</span>}
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        ) : (
          <button className="btn-connect-solana" onClick={onOpenLoginModal}>
            🟣 Connect / Log In
          </button>
        )}
      </div>
    </header>
  );
};

import React from "react";
import { supabase } from "../hooks/useSupabase";
import { formatRupees } from "../currency";

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
  // Format balance in paise to rupees (₹XX.XX)
  const formattedBalance = isLoggedIn ? formatRupees(usdBalance) : formatRupees(0);

  // Shorten Solana or wallet address for clean display
  const shortAddress =
    walletAddress.length > 16
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress;

  const handleSolanaLogin = async () => {
    if (typeof window !== "undefined" && !(window as any).solana) {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const currentUrl = encodeURIComponent(window.location.href);
        const openPhantom = window.confirm(
          "Solana wallet extension not found in mobile browser.\n\nWould you like to open DreamBig in the Phantom Wallet app to log in?"
        );
        if (openPhantom) {
          window.location.href = `https://phantom.app/ul/browse/${currentUrl}`;
        }
        return;
      } else {
        alert("No Solana wallet extension detected! Please install the Phantom extension (phantom.app) in your browser.");
        return;
      }
    }

    try {
      const res = await supabase.auth.signInWithWeb3({
        chain: "solana",
        statement: "I confirm that I want to sign in to prediction market DreamBig",
      });
      if (res.error) {
        alert("Login notice: " + res.error.message);
      }
    } catch (err: any) {
      console.error("Solana login error:", err);
      alert("Solana login notice: " + (err.message || "User cancelled or wallet rejected"));
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
            🟣 Login via Solana
          </button>
        )}
      </div>
    </header>
  );
};

import React, { useState } from "react";
import { supabase } from "../hooks/useSupabase";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  isAnonymous: boolean;
  onToggleAnonymous: (val: boolean) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  isAnonymous,
  onToggleAnonymous,
}) => {
  const [tab, setTab] = useState<"wallet" | "email">("email");

  // Email form state (Login vs Register)
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Status
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  if (!isOpen) return null;

  // 1. Solana Web3 Login
  const handleSolanaLogin = async () => {
    setMessage(null);
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
        setMessage({
          text: "No Solana wallet extension detected! Please install Phantom (phantom.app) or use Email & Password login.",
          isError: true,
        });
        return;
      }
    }

    setLoading(true);
    try {
      const res = await supabase.auth.signInWithWeb3({
        chain: "solana",
        statement: "I confirm that I want to sign in to prediction market DreamBig",
      });

      if (res.error) {
        setMessage({ text: res.error.message, isError: true });
      } else {
        onSuccess();
        onClose();
      }
    } catch (err: any) {
      setMessage({
        text: err?.message || "User cancelled or wallet rejected request",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  // 2. Email & Password Login / Registration (Stored & Verified via Supabase Auth)
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    if (password.length < 6) {
      setMessage({ text: "Password must be at least 6 characters long.", isError: true });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        // Register new account: saves email and bcrypt-hashed password in Supabase auth.users
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setMessage({ text: error.message, isError: true });
        } else if (data.session) {
          // Immediately logged in
          onSuccess();
          onClose();
        } else {
          // Account created, switch to sign-in
          setIsSignUp(false);
          setMessage({
            text: "🎉 Account created successfully! Please sign in with your email and password.",
            isError: false,
          });
        }
      } else {
        // Sign in existing account: verifies bcrypt hash against Supabase auth.users
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage({ text: error.message, isError: true });
        } else {
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      setMessage({ text: err?.message || "Authentication failed. Please check credentials.", isError: true });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content login-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Sign In to DreamBig</h3>
          <button className="btn-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {/* Tab Switcher: Email vs Solana Wallet */}
        <div className="segmented-control login-method-tabs">
          <button
            type="button"
            className={`segment-btn ${tab === "email" ? "active" : ""}`}
            onClick={() => {
              setTab("email");
              setMessage(null);
            }}
          >
            ✉️ Email &amp; Password
          </button>
          <button
            type="button"
            className={`segment-btn ${tab === "wallet" ? "active" : ""}`}
            onClick={() => {
              setTab("wallet");
              setMessage(null);
            }}
          >
            🟣 Solana Wallet
          </button>
        </div>

        {/* Anonymity / Privacy Preference */}
        <div className="privacy-preference-box">
          <label className="privacy-toggle-label">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => onToggleAnonymous(e.target.checked)}
            />
            <span className="privacy-toggle-text">
              <strong>🕶️ Trade Anonymously</strong>
              <small>Hide email/public wallet; display as Anon Trader on books</small>
            </span>
          </label>
        </div>

        {message && (
          <div className={`feedback-alert ${message.isError ? "error" : "success"}`}>
            {message.text}
          </div>
        )}

        {/* =========================================
            METHOD 1: EMAIL & PASSWORD (SUPABASE)
            ========================================= */}
        {tab === "email" && (
          <div className="email-auth-section">
            <form onSubmit={handleEmailAuth} className="modal-form">
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. trader@example.com"
                  className="modal-input"
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="modal-input"
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                />
              </div>

              {/* Toggle: Sign In vs Register */}
              <div className="auth-toggle-signup">
                <span>{isSignUp ? "Already registered?" : "Don't have an account?"}</span>
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setMessage(null);
                  }}
                >
                  {isSignUp ? "Sign In Instead" : "Register / Create Account"}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary btn-submit-email"
              >
                {loading
                  ? "Processing..."
                  : isSignUp
                  ? "✨ Register & Sign In"
                  : "🚀 Sign In with Email & Password"}
              </button>
            </form>
          </div>
        )}

        {/* =========================================
            METHOD 2: SOLANA WALLET
            ========================================= */}
        {tab === "wallet" && (
          <div className="wallet-auth-section">
            <p className="auth-explainer">
              Connect via <strong>Phantom</strong> or any Solana Web3 wallet. Instant cryptographic Ed25519 signature.
            </p>

            <button
              type="button"
              className="btn-connect-solana btn-wallet-large"
              onClick={handleSolanaLogin}
              disabled={loading}
            >
              {loading ? "Waiting for Wallet Approval..." : "🟣 Connect Phantom / Solana"}
            </button>

            <div className="auth-help-hint">
              <span>Prefer using email?</span>
              <button
                type="button"
                className="btn-link"
                onClick={() => setTab("email")}
              >
                Sign In with Email &amp; Password →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

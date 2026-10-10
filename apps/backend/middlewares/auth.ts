import type { NextFunction, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../../../packages/db";

// Extend Express Request type to include user information
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userAddress?: string;
      isAdmin?: boolean;
    }
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.warn("Warning: Missing Supabase Environment Variables");
}

const supabase = createClient(
  supabaseUrl || "",
  supabaseSecretKey || ""
);

// Known admin addresses (Your Solana wallet public key)
const DEFAULT_ADMINS = [
  "EpmsQDaWxXQ5sLsnmbFcZMRSXZX6sR58cshNqv4AYL2M",
  "admin_abhimanyu@db.com"
];

// Helper: Check if an address is configured as an Admin
export function checkIsAdmin(address?: string): boolean {
  if (!address) return false;

  const rawEnv = process.env.ADMIN_ADDRESSES || "";
  const envAdmins = rawEnv
    .replace(/"/g, "")
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);

  const allAdmins = [...DEFAULT_ADMINS, ...envAdmins].map((addr) => addr.toLowerCase());

  return allAdmins.includes(address.toLowerCase());
}

// 1. Mandatory User Auth Middleware (Requires valid cryptographically signed Solana session)
export async function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({
      message: "Please login with your Solana wallet to continue",
    });
    return;
  }

  try {
    // Verify token with Supabase (validated by Solana Ed25519 signature from wallet)
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({
        message: "Invalid or expired session. Please connect your Solana wallet.",
      });
      return;
    }

    // Extract verified Solana wallet address from Supabase custom claims
    const address = user.user_metadata?.custom_claims?.address || user.email || user.id;

    if (!address) {
      res.status(401).json({
        message: "No verified Solana wallet address found for this user",
      });
      return;
    }

    // Upsert user in Postgres database
    const userDB = await prisma.user.upsert({
      where: {
        address,
      },
      update: {},
      create: {
        address,
        usdBalance: 0, // Starts at 0, user can click Faucet to claim test funds
      },
    });

    req.userId = userDB.id;
    req.userAddress = userDB.address;
    req.isAdmin = checkIsAdmin(userDB.address);
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(401).json({
      message: "Authentication failed. Please connect your wallet.",
    });
  }
}

// 2. Admin Only Middleware (Requires login AND admin rights)
export async function adminMiddleware(req: Request, res: Response, next: NextFunction) {
  // First run regular authentication with cryptographic verification
  await middleware(req, res, () => {
    // Check admin privilege
    if (!req.isAdmin) {
      res.status(403).json({
        message: "Access denied. Only an admin can perform this action.",
      });
      return;
    }
    next();
  });
}

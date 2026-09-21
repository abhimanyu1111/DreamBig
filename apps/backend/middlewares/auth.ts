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

// Known admin addresses (Your Solana wallet + dev wallets)
const DEFAULT_ADMINS = [
  "EpmsQDaWxXQ5sLsnmbFcZMRSXZX6sR58cshNqv4AYL2M",
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

// 1. Regular User Auth Middleware (Requires cryptographic verification)
export async function middleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({
      message: "Please login with your wallet to continue",
    });
    return;
  }

  try {
    let address: string | undefined;

    // Optional dev bypass ONLY for mock accounts (e.g. dev-wallet-alice for local test scripts)
    // Real Solana public keys CANNOT use this bypass and MUST provide a signed Supabase JWT!
    if (token.startsWith("dev-wallet-") && !token.includes("EpmsQDa")) {
      address = token;
    } else {
      // CRYPTOGRAPHIC VERIFICATION:
      // Verify token with Supabase (validated by Solana Ed25519 signature from Phantom)
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        res.status(403).json({
          message: "Invalid or expired cryptographic session. Please sign in with your wallet.",
        });
        return;
      }

      // Extract verified Solana wallet address from Supabase custom claims
      address = user.user_metadata?.custom_claims?.address || user.email || user.id;
    }

    if (!address) {
      res.status(403).json({
        message: "No wallet address associated with this user",
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
        usdBalance: 100000, // Give 1,000 USD default balance for new users to test!
      },
    });

    req.userId = userDB.id;
    req.userAddress = userDB.address;
    req.isAdmin = checkIsAdmin(userDB.address);
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(403).json({
      message: "Authentication failed",
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

# ⚡ DreamBig — Decentralized Binary Prediction Market

[![Live Demo](https://img.shields.io/badge/Live_Demo-Render-46E3B7?style=for-the-badge&logo=render&logoColor=white)](https://dreambig-afb4.onrender.com)
[![Solana](https://img.shields.io/badge/Web3-Solana-9945FF?style=for-the-badge&logo=solana&logoColor=white)](https://solana.com)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://supabase.com)
[![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Turborepo](https://img.shields.io/badge/Monorepo-Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)](https://turbo.build)

> A full-stack, decentralized binary prediction market platform inspired by **Polymarket** and **Kalshi**. Built with a high-performance Central Limit Order Book (CLOB), Solana Web3 cryptographic authentication, ACID-compliant PostgreSQL transaction locks, and dynamic contract splitting/merging.

🌐 **Live Application:** [https://dreambig-afb4.onrender.com](https://dreambig-afb4.onrender.com)

---

## 📸 Overview

DreamBig allows users to trade on the outcomes of real-world events using binary contracts (**YES** and **NO** shares). The contract price represents the market-implied probability of an event occurring (e.g., a **YES** share trading at **60¢** implies a **60% probability**).

Every binary pair satisfies the fundamental invariant:
$$\text{Price(YES)} + \text{Price(NO)} = \$1.00 \text{ (100¢)}$$

When the event resolves:
- **Winning Outcome:** Redeems for **$1.00 (100¢)** per share.
- **Losing Outcome:** Expires at **$0.00**.

---

## ✨ Key Features

### 1. 📊 Central Limit Order Book (CLOB) & Matching Engine
- **Price-Time Priority:** Orders are matched against complementary orderbook tiers (lowest asks matched first).
- **Complementary Counter-Orders:** Unfilled buy orders on YES at price $P$ automatically place a resting counter-order on NO at $(100 - P)¢$ with `reverseOrder: true`.
- **Live Depth Visualization:** Visual orderbook depth displaying resting liquidity, share quantities, and spread.

### 2. 🟣 Cryptographic Solana Authentication
- **Ed25519 Wallet Signatures:** Authenticate using Phantom, Solflare, or any Solana Web3 wallet via Supabase Auth without passwords or seed phrase exposures.
- **Protected Actions:** Trading (Buy/Sell), Contract Minting (Split/Merge), and Faucet claims strictly require an active cryptographic session.

### 3. 💼 Contract Splitting & Merging (Mint / Redeem)
- **📥 Split ($1.00 $\rightarrow$ 1 YES + 1 NO):** Deposit $1.00 cash to mint 1 YES share and 1 NO share. Provides instantaneous market liquidity without relying on an automated market maker.
- **📤 Merge (1 YES + 1 NO $\rightarrow$ $1.00 Cash):** Burn a complete pair of 1 YES and 1 NO shares anytime to redeem $1.00 back to cash.

### 4. 🛡️ Concurrency & Double-Spend Protection
- **Pessimistic Row-Level Locking:** All financial operations execute inside PostgreSQL transactions using `SELECT ... FOR UPDATE` to eliminate race conditions and double-spending across concurrent requests.
- **Automated Settlement Refunds:** When an Admin resolves a market:
  - All winning position holders receive instant payouts ($1.00/share).
  - Any **unfilled resting limit orders** have their locked cash or unsold shares automatically refunded to their balance.

### 5. 👑 Role-Based Admin Governance (RBAC)
- **Whitelist Verification:** Restricted administrative actions verify the authenticated Solana public key against the admin whitelist.
- **Admin Powers:**
  - Create new prediction markets with custom resolution criteria.
  - Settle & resolve live markets (triggering automated payouts and orderbook cleanup).
  - Delete completed test markets with cascaded database cleanup.

### 6. 🎁 Built-in Testnet Faucet
- Logged-in users can claim **+$500.00 USD** in simulated trading balance with a single click.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DREAMBIG FULL-STACK ARCHITECTURE                │
└────────────────────────────────────────────────────────────────────────┘

  [ Client Browser ]
         │
         ├── 🟣 Solana Wallet (Phantom / Solflare) ─── Ed25519 Signatures
         │
         ▼
  [ React 19 Frontend (Vite) ] ── (Render Global CDN)
         │
         ├── State Management: React Hooks + Context
         ├── Live CLOB Depth Display
         ├── Dynamic YES/NO Price Sliders & Profit Estimator
         └── REST API Client (Axios)
         │
         ▼
  [ Express + Bun Backend API ] ── (Render Web Service)
         │
         ├── Middlewares:
         │     ├── CORS & JSON Body Parser
         │     ├── Auth Middleware (Supabase JWT / Solana claims)
         │     └── Admin RBAC Middleware (Public Key Verification)
         │
         ├── Core Engine Endpoints:
         │     ├── POST /buy & POST /sell (CLOB Matching & Counter-Orders)
         │     ├── POST /split & POST /merge (Token Mint / Burn Mechanics)
         │     ├── POST /market/resolve (Winner Payouts & Order Refunds)
         │     ├── DELETE /market/:id (Cascaded Cleanup)
         │     └── POST /faucet (+$500 Test Balance)
         │
         ▼
  [ PostgreSQL Database (Supabase Cloud) ]
         │
         ├── Tables: User, Market, Position, OrderHistory
         └── Concurrency: ACID Transactions + Row Locks (SELECT FOR UPDATE)
```

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Monorepo & Runtime** | [Turborepo](https://turbo.build), [Bun](https://bun.sh) (v1.4.0) |
| **Frontend** | [React 19](https://react.dev), [Vite 8](https://vitejs.dev), TypeScript, Vanilla CSS (Dark Glassmorphism) |
| **Backend** | [Express 5](https://expressjs.com), TypeScript, [Zod](https://zod.dev) Schema Validation |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org) on [Supabase](https://supabase.com), [Prisma ORM](https://www.prisma.io) (v7.8) |
| **Web3 Authentication**| [@supabase/supabase-js](https://github.com/supabase/supabase-js) Solana Ed25519 Web3 Auth |
| **Deployment** | [Render](https://render.com) (Web Service for Backend + Static Site for Frontend) |

---

## 📁 Repository Structure

```bash
DreamBig/
├── apps/
│   ├── backend/                 # Express matching engine & API routes
│   │   ├── index.ts             # REST server & CLOB transaction engine
│   │   ├── types.ts             # Zod input validation schemas
│   │   └── middlewares/
│   │       └── auth.ts          # Solana signature & admin RBAC middleware
│   │
│   └── frontend/                # React 19 + Vite Web3 client
│       ├── src/
│       │   ├── api.ts           # Production API client with dynamic baseUrl
│       │   ├── types.ts         # TypeScript shared interfaces
│       │   ├── App.tsx          # Main trading dashboard & layout
│       │   ├── App.css          # Curated dark-mode design system
│       │   ├── components/      # Modular UI components
│       │   │   ├── Navbar.tsx             # Wallet login, live cash & faucet
│       │   │   ├── TradingPanel.tsx       # Buy, Sell, Split & Merge controls
│       │   │   ├── OrderbookView.tsx      # CLOB ask depth visualizer
│       │   │   ├── MarketCard.tsx         # Probability bars & market cards
│       │   │   ├── PositionsTable.tsx     # User holdings & portfolio table
│       │   │   ├── OrderHistoryTable.tsx  # Past executions table
│       │   │   └── CreateMarketModal.tsx  # Admin market creator dialog
│       │   └── hooks/
│       │       ├── useUser.ts             # Reactive Supabase auth listener
│       │       └── useSupabase.ts         # Supabase client singleton
│
├── packages/
│   └── db/                      # Shared database package
│       ├── prisma/
│       │   └── schema.prisma    # PostgreSQL database schema
│       └── index.ts             # Exported Prisma client singleton
│
├── package.json                 # Monorepo scripts & dependencies
└── turbo.json                   # Turborepo task pipeline configuration
```

---

## 🚀 Local Development Setup

### Prerequisites
- [Bun](https://bun.sh) (v1.2+) or Node.js (v20+)
- A free [Supabase](https://supabase.com) account (or local PostgreSQL instance)
- A Solana browser wallet (e.g., [Phantom](https://phantom.app/) or [Solflare](https://solflare.com/))

### 1. Clone Repository
```bash
git clone https://github.com/abhimanyu1111/DreamBig.git
cd DreamBig
```

### 2. Install Dependencies
```bash
bun install
```

### 3. Configure Environment Variables

**Backend (`apps/backend/.env`):**
```env
DATABASE_URL="postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
VITE_SUPABASE_URL="https://<ref>.supabase.co"
SUPABASE_SECRET_KEY="<your-supabase-service-role-secret-key>"
ADMIN_ADDRESSES="<your-solana-wallet-public-key>"
PORT=3000
```

**Frontend (`apps/frontend/.env.local`):**
```env
VITE_SUPABASE_URL="https://<ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<your-supabase-anon-key>"
VITE_API_URL="http://localhost:3000"
```

### 4. Push Database Schema & Generate Prisma Client
```bash
cd packages/db
bunx prisma db push
bunx prisma generate
cd ../..
```

### 5. Run Development Servers
```bash
# In terminal 1 (Backend):
cd apps/backend
bun --env-file=.env index.ts

# In terminal 2 (Frontend):
cd apps/frontend
bun run dev
```

Visit **`http://localhost:5173`** in your browser.

---

## 📖 Prediction Market Mechanics & Math

### The Complementary Orderbook Rule
When a trader places an order to **Buy YES at 60¢**:
- If a seller has an open ask for YES at 60¢ or lower, they match immediately.
- If no seller is available, our engine does not leave an isolated bid: it places a complementary ask on the **NO orderbook at $(100 - 60) = 40¢$** (`reverseOrder: true`).
- If another trader comes and buys NO at 40¢, the combined cash deposited ($60¢ + 40¢ = $1.00$) matches the payout liability, minting 1 YES share to Trader A and 1 NO share to Trader B!

### Market Resolution & Automated Refunds
1. The Admin verifies the real-world outcome and settles the market to **YES** or **NO**.
2. **Winning Position Holders:** Receive **$1.00** per held share.
3. **Unfilled Limit Orders:** 
   - Unfilled BUY orders receive a **100% refund of locked cash**.
   - Unfilled SELL orders receive **returned unsold shares** (and collect $1.00 if their outcome won).
4. **Orderbook Wiped:** Both YES and NO books are cleared to zero open orders.

---

## 📄 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

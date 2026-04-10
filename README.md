# MuzeStock.Lab: Pure Quant System Trading Engine

**100% Quant Algorithm Architecture — Zero AI Heuristics**

MuzeStock.Lab is a fully systematic, data-driven quantitative trading engine engineered for robust alpha generation. Every position taken is backed by mathematically structured statistical models, specifically tailored for volatile penny stocks and high-beta assets. There are **no LLM outputs, no AI-generated text, and no black-box heuristics** in any execution path.

---

## Table of Contents

1. [Alpha Source](#alpha-source)
2. [Core Philosophy](#core-philosophy)
3. [Key Engine Implementations](#key-engine-implementations)
4. [Architecture](#architecture)
5. [Prerequisites](#prerequisites)
6. [Environment Variables](#environment-variables)
7. [Setup & Installation](#setup--installation)
8. [Usage](#usage)
9. [CI/CD](#cicd)
10. [Disclaimer](#disclaimer)

---

## Alpha Source

### Mean Reversion & Dead Cat Bounces

Instead of chasing false breakouts, MuzeStock.Lab exploits extreme market micro-structure inefficiencies — Panic Selling & Capitulation.

| Signal | Condition |
|---|---|
| **Super Oversold Setup** | RSI(2) < 10 combined with a −7% deviation from the 5-day SMA |
| **Volume Exhaustion** | Relative Volume (RVOL) > 3.0 during the crash to confirm capitulation |
| **Asymmetric Payoff** | Targets a 5.0 ATR snap-back recovery within a strict **3-day Time Stop** window |

---

## Core Philosophy

> *"In God we trust, all others must bring data." — W. Edwards Deming*

1. **Zero LLM Dependency**: No GPT, no NLP, no AI. All action paths rely entirely on raw price-action dynamics, mathematical transformations, and non-linear scoring.
2. **Trade Reject Logic**: If the natural ATR-based R/R ratio is below 1.5x, the system issues a `REJECT` action rather than force-correcting the target. *If there's no edge, we don't enter.*
3. **Strict Time Limits**: Dynamic time decay via a `λ` penalty function enforces strict capital rotation and punishes idle money.
4. **Statistical Robustness**: Slippage-adjusted backtests on Out-Of-Sample (OOS) data via Walk-Forward Analysis (WFA).

---

## Key Engine Implementations

### 1. DNA Scoring Engine (Dynamic Non-linear Analysis)

Replaces binary buy/sell flags with a continuous score matrix (0–100).

| Parameter | Role |
|---|---|
| **γ (Profit Momentum)** | Caps aggressive expectations, secures profit non-linearly |
| **δ (Loss Fear)** | Accelerates score drops under severe drawdown |
| **λ (Time Decay)** | Penalizes idle capital per trading day held, modulated by Efficiency Ratio (ER) |

Default values: `γ = 0.8`, `δ = 1.5`, `λ = 2.0` — optimized via `optimize_dna.py`.

### 2. Tiered Volatility Fallback

When live ATR data is unavailable, a price-tiered fallback is applied:

| Tier | Price Range | Volatility Assumption |
|---|---|---|
| Penny Stock | < $5 | 20% (Shakeout defense) |
| Swing / Mid-Cap | ≥ $5 | 8% (Precision entries) |
| Sub-dollar Protection | < $1 | Min ATR hard-capped at `0.0005` |

### 3. Chandelier Exit (Trailing Stop)

Stop prices use a Time-based Tightening multiplier. As holding days increase, the multiplier tightens from **2.5× ATR → 1.5× ATR**, protecting gains without premature exits.

### 4. R/R Reject Gate

```text
Natural R/R = (Target - Entry) / (Entry - Stop)
If R/R < 1.5x → Action: REJECT (no forced target adjustment)
```

The system will never artificially inflate the target price to meet a ratio. If the market doesn't offer a valid edge, the position is rejected outright.

### 5. Fractional Kelly Position Sizing

Allocations dynamically shrink with low conviction scores and high-variance regimes. Quarter-Kelly is applied with a Max R/R cap of 5.0 for safety.

### 6. Walk-Forward Analysis (WFA) Module

Located in `python_engine/portfolio_backtester.py`. Parameters are dynamically retrained on rolling windows and applied strictly to the subsequent unseen (OOS) window.

---

## Architecture

### Stack

| Layer | Stack |
|---|---|
| **Frontend** | React 19 + TypeScript + Vite + TailwindCSS + Recharts |
| **Backend API** | FastAPI (Python 3.11) + Uvicorn + WebSocket |
| **Broker** | Alpaca Markets API (Paper & Live trading) |
| **Database** | PostgreSQL via Supabase |
| **Edge Functions** | Supabase Edge Functions (Deno/TypeScript) — 12 functions |
| **Alerts** | Discord Webhook (`webhook_manager.py`) |
| **CI** | GitHub Actions (`python-ci.yml`) |

### Component Flow

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend (Vite)              │
│   Dashboard · Portfolio · Scanner · Backtester UI  │
└────────────┬───────────────────┬────────────────────┘
             │ REST / WebSocket  │ Supabase JS Client
             ▼                   ▼
┌────────────────────┐  ┌─────────────────────────────┐
│  FastAPI Backend   │  │   Supabase Edge Functions   │
│  main.py :8000     │  │   run-quant-scanner         │
│                    │  │   analyze-stock             │
│  /api/analyze      │  │   execute-trades            │
│  /api/portfolio    │  │   monitor-positions         │
│  /api/broker/*     │  │   run-backtest  · +8 more   │
│  /ws/pulse (WS)    │  └──────────────┬──────────────┘
└────────┬───────────┘                 │
         │                            │
         ▼                            ▼
┌────────────────┐          ┌─────────────────┐
│  Alpaca API    │          │  PostgreSQL DB  │
│  (Paper/Live)  │          │  (Supabase)     │
└────────────────┘          └─────────────────┘
         │
         ▼
┌────────────────────┐
│  Discord Webhook   │
│  Super Oversold    │
│  & Standard Alerts │
└────────────────────┘
```

### Python Engine Modules

| Module | Purpose |
|---|---|
| `main.py` | FastAPI server — analysis, broker, WebSocket endpoints |
| `portfolio_backtester.py` | DNA Validator + Walk-Forward Analysis |
| `optimize_dna.py` | Grid-search optimizer for γ, δ, λ parameters |
| `paper_engine.py` | Paper trading manager (Supabase-backed) |
| `scraper.py` | Playwright-based market data scraper |
| `db_manager.py` | Supabase client factory |
| `cache_manager.py` | Request caching layer |
| `news_manager.py` | Finnhub news feed integration |
| `webhook_manager.py` | Discord alert dispatcher |
| `inventory_service.py` | Position inventory tracking |
| `utils.py` | Shared utilities |

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Python** | 3.11 | Required for CI and local dev |
| **Node.js** | 18+ | For the React frontend |
| **Docker** | 24+ | Optional — for containerized backend |
| **Supabase account** | — | Project URL + keys required |
| **Alpaca account** | — | Paper trading free; live trading requires funded account |
| **Finnhub account** | — | Free tier sufficient for news feed |
| **Discord Webhook** | — | Optional — for trade alerts |

---

## Environment Variables

Create a `.env` file in the project root and a separate `.env` inside `python_engine/`:

### Frontend (`/.env`)

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
VITE_FINNHUB_API_KEY=<your-finnhub-key>
VITE_ADMIN_SECRET_KEY=<your-admin-secret>
```

### Python Backend (`/python_engine/.env`)

```env
# Supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<your-service-role-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# Alpaca Markets
APCA_API_KEY_ID=<your-alpaca-key>
APCA_API_SECRET_KEY=<your-alpaca-secret>
APCA_PAPER=true   # Set to false for live trading

# Alerts
DISCORD_WEBHOOK_URL=<your-discord-webhook-url>

# Admin
ADMIN_SECRET_KEY=<your-admin-secret>
```

> **Note**: `APCA_PAPER=true` enables paper trading mode (default). Set to `false` only with a funded Alpaca live account.

---

## Setup & Installation

### 1. Clone & Install Frontend

```bash
git clone https://github.com/dykim72321-ops/muzestock.lab.git
cd MuzeStock.Lab

npm install
```

### 2. Configure Supabase

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Apply database migrations
supabase db push

# Deploy Edge Functions
supabase functions deploy
```

### 3a. Run Python Backend (Local)

```bash
cd python_engine
pip install -r requirements.txt

uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

### 3b. Run Python Backend (Docker)

```bash
cd python_engine
docker-compose up --build
```

The FastAPI server will be available at `http://localhost:8001`.

---

## Usage

### Launch the Quant Terminal UI

```bash
# From project root
npm run dev
```

The React terminal will start at `http://localhost:5173`.

### Run DNA Scoring Backtester (Walk-Forward)

```bash
cd python_engine
python portfolio_backtester.py
```

### Optimize DNA Parameters

```bash
cd python_engine
python optimize_dna.py
```

Runs a grid search over γ, δ, λ and outputs the parameter set with the best OOS Sharpe ratio.

### Check Monitored Stocks

```bash
cd python_engine
python check_stocks.py
```

Queries the `daily_discovery` table and prints the top 5 stocks by DNA score.

### Paper Trading vs Live Trading

Toggle the `APCA_PAPER` environment variable:

```env
APCA_PAPER=true    # Paper trading (default, no real money)
APCA_PAPER=false   # Live trading (real money — use with caution)
```

Paper trading state is persisted in the `paper_account` and `paper_positions` Supabase tables.

### API Endpoints (FastAPI)

| Endpoint | Method | Description |
|---|---|---|
| `/api/analyze` | POST | Run DNA scoring on a ticker |
| `/api/portfolio` | GET | Current portfolio state |
| `/api/broker/status` | GET | Alpaca broker connection status |
| `/api/broker/account` | GET | Account equity & buying power |
| `/api/broker/order` | POST | Place a new order |
| `/api/broker/positions` | GET | Open positions |
| `/api/broker/close-position` | POST | Close a specific position |
| `/api/broker/liquidate-all` | POST | Liquidate all positions |
| `/api/validate_candidates` | POST | Batch-validate candidate tickers |
| `/api/strategy/stats` | GET | Strategy performance statistics |
| `/ws/pulse` | WebSocket | Live market data stream |

---

## CI/CD

GitHub Actions (`python-ci.yml`) runs on every push or PR to `main` that touches `python_engine/**`:

- **Lint**: `flake8` checks for syntax errors and undefined names
- **Format**: `black` formatting validation
- **Import check**: Verifies FastAPI, Alpaca, Supabase, and pandas are importable
- **Tests**: `pytest` suite

---

## Disclaimer

> This system contains zero AI-generated predictions. All signals are derived from mathematical models applied to publicly available market data. **This is not financial advice.** Past backtest performance does not guarantee future results. Live trading involves real financial risk. Use `APCA_PAPER=true` until you have thoroughly validated the system's behavior on your own data.

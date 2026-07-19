# MuzeStock.Lab: Pure Quant System Trading Engine

**100% Quant Algorithm Architecture — Zero AI Heuristics**

> **v5 Paper Trading Engine.** Full pipeline: quant scanner → watchlist → auto buy/sell → trailing stop exit. MomentumValidator interceptor (RVOL + MTF EMA) guards every STRONG BUY entry. Penny Lab runs on a separate state machine with its own parameters.

MuzeStock.Lab is a fully systematic, data-driven quantitative trading engine engineered for robust alpha generation. Every position taken is backed by mathematically structured statistical models, specifically tailored for volatile penny stocks and high-beta assets. There are **no LLM outputs, no AI-generated text, and no black-box heuristics** in any execution path.

---

## Table of Contents

1. [Alpha Source](#alpha-source)
2. [Core Philosophy](#core-philosophy)
3. [Key Engine Implementations](#key-engine-implementations)
4. [Paper Trading Auto-Sell System](#paper-trading-auto-sell-system)
5. [Operations Command Dashboard](#operations-command-dashboard)
6. [Architecture](#architecture)
7. [Prerequisites](#prerequisites)
8. [Environment Variables](#environment-variables)
9. [Setup & Installation](#setup--installation)
10. [Usage](#usage)
11. [CI/CD](#cicd)
12. [Disclaimer](#disclaimer)

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

Constants: `CHANDELIER_K_NORMAL = 3.0`, `CHANDELIER_K_PENNY = 5.0` (wider stop for high-volatility penny stocks).

### 4. R/R Reject Gate

```text
Natural R/R = (Target - Entry) / (Entry - Stop)
If R/R < 1.5x → Action: REJECT (no forced target adjustment)
```

The system will never artificially inflate the target price to meet a ratio. If the market doesn't offer a valid edge, the position is rejected outright.

### 5. Fractional Kelly Position Sizing

Allocations dynamically shrink with low conviction scores and high-variance regimes. Quarter-Kelly is applied with a Max R/R cap of 5.0 for safety.

### 6. MomentumValidator Interceptor

After a STRONG BUY signal is generated, a 2-layer interceptor validates before execution:

1. **RVOL ≥ 3.0** — confirms real volume surge (not noise)
2. **Current price ≥ 15-min 20 EMA** (`MTFCache`) — confirms uptrend alignment

If either condition fails, the signal is downgraded to HOLD before reaching `process_signal()`.

### 7. Walk-Forward Analysis (WFA) Module

Located in `python_engine/portfolio_backtester.py`. Parameters are dynamically retrained on rolling windows and applied strictly to the subsequent unseen (OOS) window.

---

## Paper Trading Auto-Sell System

The paper trading engine (`python_engine/paper_engine.py`) implements a fully automated 2-stage exit state machine triggered on every 1-minute Alpaca bar close.

### Automated Exit Flow

```
Alpaca 1-min bar → on_minute_bar_closed() → paper_engine.process_signal()
    │
    ├─ [Stage 1 — Scale-Out]  RSI > 60 (일반) / RSI > 70 or profit ≥ 20% (페니)
    │   → Sell 50% of position at market price
    │   → Raise trailing stop to entry_price × 1.01 (break-even +1%)
    │   → Status: HOLD → SCALE_OUT
    │   → Discord 🟠 alert
    │
    ├─ [Stage 2 — Trailing Stop]  price < ts_threshold
    │   → Liquidate remaining units at market price
    │   → Record PnL to paper_history table
    │   → Delete from paper_positions
    │   → Discord ✅ / 🛑 alert
    │
    ├─ [EOD Force Exit]  15:30 ET → liquidate all positions
    │
    └─ [Normal]  Update current_price, highest_price, ts_threshold
```

### Trailing Stop Parameters

| Scenario | Stop | Trigger |
|---|---|---|
| Initial entry (normal) | entry × 0.90 (−10%) | Set on BUY |
| Initial entry (penny) | entry × 0.85 (−15%) | Set on BUY |
| Price rises (normal) | highest × 0.90 | Dynamic |
| After Scale-Out | entry × 1.01 | RSI threshold |
| Penny break-even lock | entry price | Profit ≥ +10% |
| Penny tight TS | highest × 0.93 (−7%) | After scale-out |

### Watchlist Sync

| Method | Trigger | Action |
|---|---|---|
| `_sync_watchlist_buy()` | On BUY | status=HOLDING, buy_price, stop_loss |
| `_sync_watchlist_stop_loss()` | On Scale-Out | stop_loss update |
| `_sync_watchlist_exit()` | On liquidation | status=EXITED |

All watchlist mutations include `.is_("user_id", "null")` to isolate engine-managed rows.

### API Endpoints (Paper Trading)

| Endpoint | Method | Description |
|---|---|---|
| `/api/broker/paper/account` | GET | Virtual account cash & equity |
| `/api/broker/paper/positions` | GET | All open paper positions |
| `/api/broker/paper/history` | GET | Last 30 closed trades |
| `/api/broker/paper/sell` | POST | Manual position liquidation |
| `/api/broker/arm` | POST | Toggle SYSTEM_ARMED (auto-trade on/off) |

---

## Operations Command Dashboard

The **작전지휘소** (`/stock/dashboard`) is the real-time command center for monitoring and controlling the trading engine. Single-scroll view, no tabs.

### Dashboard Sections

| Section | Data Source |
|---|---|
| Market status / ARM toggle / scan buttons | Header |
| 4 metric cards (equity, cash, unrealized PnL, win rate) | `paper_account`, `strategy/stats` |
| Cumulative PnL chart + discovery grid | `paper_history`, `daily_discovery` |
| Open positions table | `paper_positions` |
| Recent exits history | `paper_history` |

### Dashboard Connection Map

```
Browser
  ├─ WS  ws://<host>/py-api/ws/pulse  ──────────────────► FastAPI :8001 /ws/pulse
  ├─ REST /py-api/api/broker/paper/*  ──────────────────► FastAPI :8001 (X-Admin-Key)
  ├─ REST /py-api/api/strategy/stats  ──────────────────► FastAPI :8001
  ├─ REST /py-api/api/pulse/status    ──────────────────► FastAPI :8001
  ├─ Supabase JS  system_settings     ──────────────────► Supabase DB (RLS: anon UPDATE ok)
  ├─ Supabase JS  watchlist / paper_* ──────────────────► Supabase DB
  └─ Edge Fn  admin-proxy/api/hunt    ──────────────────► Supabase Edge Function
```

### System Armed State

The `SYSTEM_ARMED` flag (toggled via the ARM button) gates all automated buy execution. Trailing stop exits run regardless of armed state to prevent runaway losses.

---

## Architecture

### Stack

| Layer | Stack |
|---|---|
| **Frontend** | React 19 + TypeScript + Vite + TailwindCSS + Recharts |
| **Backend API** | FastAPI (Python 3.11) + Uvicorn + WebSocket |
| **Broker** | Alpaca Markets API (Paper & Live trading) |
| **Database** | PostgreSQL via Supabase |
| **Edge Functions** | Supabase Edge Functions (Deno/TypeScript) — 13 functions |
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
│  main.py :8001     │  │   run-quant-scanner         │
│                    │  │   analyze-stock             │
│  routers/          │  │   execute-trades            │
│  ├─ broker.py      │  │   monitor-positions         │
│  ├─ penny.py       │  │   admin-proxy  · +8 more    │
│  ├─ strategy.py    │  └──────────────┬──────────────┘
│  └─ ...            │                 │
│  /ws/pulse (WS)    │                 │
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
│  Trade Alerts      │
│  10min Heartbeat   │
└────────────────────┘
```

### Python Engine Modules

| Module | Purpose |
|---|---|
| `main.py` | FastAPI server — app assembly, pulse engine, penny scan, schedulers, WebSocket |
| `paper_engine.py` | Paper trading state machine — auto buy/sell/scale-out/trailing stop |
| `state.py` | Shared `AppState` singleton (Supabase, PaperEngine, Alpaca, MTFCache, armed flag) |
| `portfolio_backtester.py` | DNA Validator + Walk-Forward Analysis |
| `optimize_dna.py` | Grid-search optimizer for γ, δ, λ parameters |
| `db_manager.py` | Supabase client factory + `get_active_tickers()` |
| `webhook_manager.py` | Discord alert dispatcher |
| `watchdog.py` | External process monitor (PID-file guarded) |
| `scraper.py` | Playwright-based market data scraper |
| `news_manager.py` | Finnhub news feed integration |

### Background Schedulers (started at FastAPI startup)

| Scheduler | Interval | Purpose |
|---|---|---|
| `stream_scheduler` | 60s | Open/close detection → start/stop Alpaca stream |
| `mtf_cache_scheduler` | 15min | Refresh 15-min 20 EMA for MomentumValidator |
| `auto_penny_scan_scheduler` | 4h (first run: 30s) | Automatic penny scan |
| `auto_cleanup_scheduler` | 24h | Delete stale watchlist rows |
| `stream_liveness_watchdog` | 3min | Force reconnect if no bar for 5min |
| `system_heartbeat` | 10min | Discord dead-man's switch |

### Supabase Tables

| Table | Purpose |
|---|---|
| `paper_account` | Virtual cash balance |
| `paper_positions` | Active positions: entry/current/highest price, TS threshold, units, status |
| `paper_history` | Closed trades: entry/exit price, PnL%, exit reason |
| `watchlist` | Monitored tickers (engine rows: `user_id IS NULL`) |
| `daily_discovery` | Scanner output — DNA score, price, indicators |
| `realtime_signals` | Pulse Engine signal archive |
| `penny_universe_pool` | Accumulated penny ticker pool for re-prioritized scanning |

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Python** | 3.11 | Required for CI and local dev |
| **Node.js** | 18+ | For the React frontend |
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

# Optional — disables WebSocket, falls back to 60s REST polling
DISABLE_ALPACA_STREAM=false
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
npm install -g supabase
supabase db push
supabase functions deploy
```

### 3a. Run Python Backend (Local)

```bash
cd python_engine
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
```

### 3b. Run Python Backend (Docker)

```bash
cd python_engine
docker-compose up --build
```

---

## Usage

### Launch Full Stack

```bash
npm run dev:all   # Frontend :5173 + Backend :8001 simultaneously
```

### DNA Scoring Backtester (Walk-Forward)

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

### Paper Trading vs Live Trading

Toggle the `APCA_PAPER` environment variable:

```env
APCA_PAPER=true    # Paper trading (default, no real money)
APCA_PAPER=false   # Live trading (real money — use with caution)
```

### API Endpoints (FastAPI)

| Endpoint | Method | Description |
|---|---|---|
| `/api/analyze` | POST | Run DNA scoring on a ticker |
| `/api/broker/paper/account` | GET | Paper account equity |
| `/api/broker/paper/positions` | GET | Open paper positions |
| `/api/broker/paper/history` | GET | Closed paper trade history |
| `/api/broker/paper/sell` | POST | Manual paper position liquidation |
| `/api/broker/arm` | POST | Toggle SYSTEM_ARMED auto-trade flag |
| `/api/penny/scan` | POST | Run penny stock scan |
| `/api/strategy/stats` | GET | Strategy performance statistics |
| `/api/pulse/status` | GET | Pulse engine market status |
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

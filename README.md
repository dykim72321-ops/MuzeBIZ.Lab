# 🚀 MuzeStock.Lab: Pure Quant System Trading Engine

🔥 **100% Quant Algorithm Architecture — Zero AI Heuristics** 🔥

MuzeStock.Lab is a fully systematic, data-driven quantitative trading engine engineered for robust alpha generation. Every position taken is backed by mathematically structured statistical models, specifically tailored for volatile penny stocks and high-beta assets. There are **no LLM outputs, no AI-generated text, and no black-box heuristics** in any execution path.

---

## 🎯 Alpha Source: Mean Reversion & Dead Cat Bounces

Instead of chasing false breakouts, MuzeStock.Lab exploits extreme market micro-structure inefficiencies (Panic Selling & Capitulation).

- **Setup (Super Oversold)**: RSI(2) < 10 combined with a -7% deviation from the 5-day SMA.
- **Volume Exhaustion**: Requires Relative Volume (RVOL) > 3.0 during the crash to confirm capitulation.
- **Asymmetric Payoff**: Targets a massive 5.0 ATR snap-back recovery within a strict **3-day Time Stop** window.

---

## 🚀 Core Philosophy: Robustness First

*"In God we trust, all others must bring data." – W. Edwards Deming*

1. **Zero LLM Dependency**: No GPT, no NLP, no AI. Action paths rely entirely on raw price-action dynamics, mathematical transformations, and non-linear scoring.
2. **Trade Reject Logic**: If the natural ATR-based R/R Ratio is below 1.5x, the system does **not** force-correct the target. Instead, it issues a `REJECT` action. *"If there's no edge, we don't enter."*
3. **Strict Time Limits**: Dynamic time decay via a `λ` penalty function enforces strict capital rotation and punishes idle money.
4. **Statistical Robustness**: Slippage-adjusted backtests on Out-Of-Sample (OOS) data via Walk-Forward Analysis (WFA).

---

## 🧬 Key Engine Implementations

### 1. DNA Scoring Engine (Dynamic Non-linear Analysis)
Replaces binary buy/sell flags with a dynamic score matrix (0–100).
- **γ (Profit Momentum Constraint)**: Caps aggressive expectations, secures profit non-linearly.
- **δ (Loss Fear Constraint)**: Accelerates score drops under severe drawdown.
- **λ (Time Decay Factor)**: Continuously penalizes idle capital per Trading Day held, modulated by Efficiency Ratio (ER).

### 2. Tiered Volatility Fallback
When live ATR data is unavailable, a **price-tiered fallback** is applied:
- **Penny Stock (< $5)** → 20% volatility (Shakeout defense)
- **Swing / Mid-Cap (≥ $5)** → 8% volatility (Precision entries)
- **Sub-dollar Protection** → Minimum ATR hard-capped at `0.0005` to prevent tick-size distortions.

### 3. Chandelier Exit (Trailing Stop)
Stop prices are calculated using a Time-based Tightening multiplier. As holding days increase, the multiplier tightens from **2.5× ATR → 1.5× ATR**, protecting gains without premature exits.

### 4. R/R Reject Gate
```text
Natural R/R = (Target - Entry) / (Entry - Stop)
If R/R < 1.5x → Action: REJECT (no forced target adjustment)
```
The system will **never** artificially inflate the target price to meet a ratio. If the market doesn't offer a valid edge, the position is rejected outright.

### 5. Fractional Kelly Position Sizing
Allocations dynamically shrink with low conviction scores and high-variance regimes *(Quarter-Kelly applied with a Max R/R cap of 5.0 for safety)*.

### 6. Walk-Forward Analysis (WFA) Module
Located in `portfolio_backtester.py`. Parameters are dynamically retrained on rolling windows and applied strictly to the subsequent unseen window.

---

## ⚙️ Full-Stack Architecture & Automation

MuzeStock.Lab is more than just a Python script — it is a fully automated, full-stack trading terminal.

| Layer | Stack |
|---|---|
| **Frontend** | React + TypeScript + Vite + TailwindCSS |
| **Backend** | Python (Backtesting & Scraping) + Supabase Edge Functions (Deno) |
| **Database** | PostgreSQL (Supabase) |

**Autopilot Pipeline:**
- **GitHub Actions Cron Jobs**: Automatically triggers the `finviz-hunter` scraper twice daily (Pre-market & Market Close) to discover Super Oversold candidates.
- **Email Alerts**: Pushes real-time rich alerts with 🚨 (Super Oversold) or 🟢 (Standard) categories directly to the trader's inbox.

---

## 🛠 Usage & Backtesting

```bash
# 1. Setup Environment
cp .env.example .env.local

# 2. Run DNA Scoring Backtester with Walk-Forward Optimization
python python_engine/portfolio_backtester.py

# 3. Launch the Quant Terminal UI
npm install
npm run dev
```

---

> **This system contains zero AI-generated predictions. All signals are derived from mathematical models.**


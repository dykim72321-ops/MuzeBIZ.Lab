# MuzeStock.Lab: Pure Quant System Trading Engine

🔥 **100% Quant Algorithm Architecture — Zero AI Heuristics** 🔥

MuzeStock.Lab is a fully systematic, data-driven quantitative trading engine engineered for robust alpha generation. Every position taken is backed by mathematically structured statistical models, specifically tailored for volatile penny stocks and high-beta assets. There are **no LLM outputs, no AI-generated text, and no black-box heuristics** in any execution path.

---

## 🚀 Core Philosophy: Robustness First

*"In God we trust, all others must bring data." – W. Edwards Deming*

1. **Zero LLM Dependency**: No GPT, no NLP, no AI. Action paths rely entirely on raw price-action dynamics, mathematical transformations, and non-linear scoring.
2. **Trade Reject Logic**: If natural ATR-based R/R Ratio is below 1.5x, the system does **not** force-correct the target. Instead, it issues a `REJECT` action. *"If there's no edge, we don't enter."*
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

### 3. Chandelier Exit (Trailing Stop)
Stop prices are calculated using a Time-based Tightening multiplier. As holding days increase, the multiplier tightens from 2.5× ATR → 1.5× ATR, protecting gains without premature exits.

### 4. R/R Reject Gate (Trade Reject Logic)
```
Natural R/R = (Target - Entry) / (Entry - Stop)
If R/R < 1.5x → Action: REJECT (no forced target adjustment)
```
The system will **never** artificially inflate the target price to meet a ratio. If the market doesn't offer a valid edge, the position is rejected outright.

### 5. Fractional Kelly Position Sizing
```
f* = p - (1-p) / r   →  Quarter-Kelly: f/4
```
Allocations dynamically shrink with low conviction scores and high-variance regimes.

### 6. Walk-Forward Analysis (WFA) Module
Located in `portfolio_backtester.py`. Parameters (γ, δ, λ) are dynamically retrained on rolling N-month windows and applied strictly to the subsequent unseen M-month window.

---

## 🛠 Usage & Backtesting

```bash
# Run DNA Scoring Backtester with Walk-Forward Optimization
python python_engine/portfolio_backtester.py
```

*The Python engine evaluates realistic slippage over latest market data, generating OOS robustness metrics and true Profit Factor (PF) confidence logic.*

---

> **This system contains zero AI-generated predictions. All signals are derived from mathematical models.**

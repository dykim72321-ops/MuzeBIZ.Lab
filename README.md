# MuzeStock.Lab: Pure Quant System Trading Engine

🔥 **100% Quant Algorithm Architecture Focus** 🔥
MuzeStock.Lab is a fully systematic, data-driven quantitative trading engine engineered for robust alpha generation without reliance on arbitrary AI heuristics or text-based hallucinations. Every position taken and every limit order placed is backed by mathematically structured statistical models, specifically tailored for volatile penny stocks and high-beta assets.

---

## 🚀 Core Philosophy: Robustness First 

*Curve-fitting is the enemy of algorithmic trading. We do not aim to over-optimize past data, but rather build structurally resilient models that survive Out-Of-Sample (OOS) environments.*

1. **Zero LLM Dependency**: Removed all GPT and NLP heuristics. Action paths rely entirely on raw order book/price action dynamics, mathematical transformations, and non-linear dynamic scoring.
2. **Strict Time Limits & Opportunity Costs**: The market changes fast. We embrace dynamic time decay using our $\lambda$ penalty function, enforcing strict capital rotation.
3. **Statistical Robustness check**: We utilize explicit Trading Days logic and rigorously apply *Slippage* to every backtest, verifying the strategy against conservative, real-world execution costs.

---

## 🧬 Key Engine Implementations

### 1. DNA Scoring Engine (Dynamic Non-linear Analysis)
Our proprietary entry/exit scoring logic replaces binary buy/sell flags with a dynamic "DNA Score" matrix (0-100). 
- **$\gamma$ (Profit Momentum Constraint)**: Caps aggressive expectations and secures profit non-linearly.
- **$\delta$ (Loss Fear Constraint)**: Accelerates scoring drops under severe volatility or loss realization.
- **$\lambda$ (Time Decay Factor)**: Actively punishes idle money. The `lambda_val` parameter continuously decreases a position's DNA score for every Trading Day held, modulated by the asset's Efficiency Ratio (ER).
- **Efficiency Ratio (ER) Modulator**: Calculates noise-to-signal ratio to dynamically tighten stop losses and penalize chop.

### 2. Walk-Forward Analysis (WFA) Module
Located in `portfolio_backtester.py`, our Walk-Forward Optimizer systematically fights curve fitting. 
- **In-Sample Train / Out-Of-Sample Test**: Parameters ($\gamma, \delta, \lambda$) are dynamically retrained on rolling $N$-month windows and strictly applied to the subsequent unseen $M$-month window.
- **True Validity**: Provides an authentic picture of future performance variance, avoiding the illusion of perfect hindsight optimization.

### 3. Realistic Market Constraints
- **Trading Days Validation**: Holding periods strictly respect equity market sessions. Time decay logic avoids penalizing assets over weekends and holidays.
- **Slippage Impact ($S$)**: A rigid execution penalty is universally applied at both market entry and stop-loss triggering, preventing false Alpha caused by microscopic price volatility captures.

### 4. Position Sizing (Fractional Kelly & Target Volatility)
Allocations are mathematically derived using Target Volatility equations modulated by a Fractional Kelly formula. Rather than static unit sizing, allocations organically swell with market conviction and dynamically shrink during high-variance regimes.

---

## 🛠 Usage & Backtesting

Run the DNA Scoring Backtester and perform a Walk-Forward Optimization:
```bash
python python_engine/portfolio_backtester.py
```

*The Python engine evaluates realistic slippage over the latest market data, generating OOS robustness metrics and true Profit Factor (PF) confidence logic.*

---

*“In God we trust, all others must bring data.” – W. Edwards Deming*

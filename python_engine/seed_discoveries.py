import asyncio
import os
from datetime import datetime
from db_manager import DBManager
import yfinance as yf
import ta
import pandas as pd
from dotenv import load_dotenv

# .env 로드
load_dotenv()

def calculate_dna_score(df):
    if df.empty: return 0, "No Data"
    
    last = df.iloc[-1]
    
    # Simple DNA Score logic based on Mean Reversion & Momentum
    rsi = ta.momentum.RSIIndicator(df['Close'], window=14).rsi().iloc[-1]
    ret_1m = (df['Close'].iloc[-1] / df['Close'].iloc[0] - 1) * 100
    ema20 = ta.trend.EMAIndicator(df['Close'], window=20).ema_indicator().iloc[-1]
    is_up_trend = last['Close'] > ema20
    
    # Score calculation
    score = 50
    if rsi < 40: score += 20
    if rsi > 70: score -= 10
    if ret_1m > 10: score += 15
    if is_up_trend: score += 10
    
    summary = f"RSI: {rsi:.1f}, 1M Return: {ret_1m:.1f}%, Trend: {'UP' if is_up_trend else 'DOWN'}"
    return int(min(100, max(0, score))), summary

async def update_today_discoveries():
    db = DBManager()
    tickers = ["SOFI", "PLTR", "AMC", "GME", "RIOT", "MARA", "NIO", "XPEV", "HOOD", "UPST", "COIN", "DKNG"]
    
    print(f"🚀 Updating {len(tickers)} discoveries for {datetime.now().date()}...")
    
    for ticker in tickers:
        try:
            tk = yf.Ticker(ticker)
            df = tk.history(period="1mo")
            if df.empty: continue
            
            dna_score, ai_summary = calculate_dna_score(df)
            current_price = df['Close'].iloc[-1]
            prev_price = df['Close'].iloc[-2]
            change_pct = (current_price / prev_price - 1) * 100
            
            # DB 실제 컬럼명에 매칭: ['ticker', 'price', 'volume', 'change', 'updated_at', 'ai_summary', 'dna_score', 'risk_level']
            data = {
                "ticker": ticker,
                "price": round(current_price, 2),
                "volume": int(df['Volume'].iloc[-1]),
                "change": round(change_pct, 2),
                "dna_score": dna_score,
                "ai_summary": ai_summary,
                "updated_at": datetime.now().isoformat(),
                "risk_level": "Medium" if dna_score < 70 else "Low"
            }
            
            db.upsert_discovery(data)
            print(f"✅ {ticker}: DNA {dna_score} (Price: {current_price:.2f})")
            
        except Exception as e:
            print(f"⚠️ Failed to update {ticker}: {e}")

if __name__ == "__main__":
    asyncio.run(update_today_discoveries())

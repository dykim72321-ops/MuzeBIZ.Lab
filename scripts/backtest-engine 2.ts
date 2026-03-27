import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 1. [Math Engine] EMA True Range (지수 평활 실제 변동성)
 * 최근 데이터에 더 높은 가중치를 주어 폭등/폭락 변동성에 즉각적으로 반응합니다.
 */
function calculateTrueRange(current: Candle, prev: Candle): number {
  const hl = current.high - current.low;
  const hc = Math.abs(current.high - prev.close);
  const lc = Math.abs(current.low - prev.close);
  return Math.max(hl, hc, lc);
}

/**
 * 2. [Math Engine] 동적 DNA Score (Z-Score & 상대 지표 기반)
 * 하드코딩된 절대값(-40%, $20M 등)을 모두 제거하고 ATR과 평소 거래량 대비 비율로 채점합니다.
 */
function calculateDynamicDnaScore(
  changePercent: number, 
  volume: number, 
  avgVolume20d: number,
  atrPercent: number // 가격 대비 ATR 비율 (예: 5% 변동성)
): number {
  let score = 50;

  // 상대적 변동성(Z-Score 개념) 기반 점수: 
  // 상승/하락폭이 평소 변동성(ATR)의 몇 배인지 계산
  const moveRatio = (changePercent / 100) / (atrPercent || 0.01); 

  if (moveRatio > 0) {
    score += Math.min(25, moveRatio * 5); // 긍정적 모멘텀 (최대 25점)
  } else {
    // 평소 변동성 대비 3배 이상 빠지면 -30점 (Catastrophic Crash)
    score -= Math.min(40, Math.abs(moveRatio) * 10); 
  }

  // 상대 거래량 (RVOL) 필터: 20일 평균 대비 거래량
  const rvol = volume / (avgVolume20d || 1);
  if (rvol >= 3.0 && changePercent > 0) score += 20;      // 폭발적 매수세
  else if (rvol >= 3.0 && changePercent < 0) score -= 25; // 폭발적 덤핑
  else if (rvol < 0.5) score -= 15;                       // 유동성 가뭄 (Death Zone)

  // 파라볼릭 과열 방지: 평소 변동성의 5배 이상 단기 급등 시 추격 금지
  if (moveRatio > 5.0) score -= 15; 

  return Math.min(100, Math.max(0, score));
}

// Target & Stop 계산 (Winner's Grace 적용 유지)
function calculateDNATargets(
  entryPrice: number, atr: number, daysHeld: number = 0,
  currentPrice: number = 0, currentHigh: number = 0
) {
  const initialStopMultiplier = 3.0; 
  const trailingMultiplier = 4.5;    
  const scaleOutMultiplier = 3.0; // 50% 분할 익절 타겟
  const targetMultiplier = 5.0;   // 최종 타겟 (7.0 -> 5.0 하향)

  const scaleOutPrice = entryPrice + (atr * scaleOutMultiplier);
  const targetPrice = entryPrice + (atr * targetMultiplier);
  const initialStop = entryPrice - (atr * initialStopMultiplier);

  let stopPrice = initialStop;

  if (daysHeld >= 3 || currentHigh > entryPrice + (atr * 2.0)) {
     const trailingStop = currentHigh - (atr * trailingMultiplier);
     stopPrice = Math.max(initialStop, trailingStop);
  }
  
  stopPrice = Math.max(stopPrice, entryPrice * 0.75); // 하드스탑 25% 제한
  if (daysHeld === 0 && currentPrice > 0) stopPrice = Math.min(stopPrice, currentPrice * 0.98);

  return { targetPrice, scaleOutPrice, stopPrice };
}

/**
 * 3. [Execution Engine] 백테스트 실행기 (관통 체결 & MA 미분 필터 적용)
 */
class RobustBacktestEngine {
  private initialBalance = 10000;
  private balance = 10000;
  private peakBalance = 10000;
  private maxDrawdown = 0;
  private trades: any[] = [];

  public run(ticker: string, candles: Candle[]) {
    console.log(`\n[BACKTEST] Starting simulation for ${ticker}...`);
    let position: any = null;
    let pendingEntry: boolean = false;
    let emaAtr = 0; // 지수 평활 ATR 상태 저장

    for (let i = 21; i < candles.length; i++) {
      const current = candles[i];
      const prev = candles[i-1];
      
      // MDD 추적
      if (this.balance > this.peakBalance) this.peakBalance = this.balance;
      const currentDrawdown = ((this.peakBalance - this.balance) / this.peakBalance) * 100;
      if (currentDrawdown > this.maxDrawdown) this.maxDrawdown = currentDrawdown;

      // [핵심] EMA ATR 업데이트 (최근 변동성에 훨씬 민감하게 반응)
      const tr = calculateTrueRange(current, prev);
      if (emaAtr === 0) emaAtr = tr; // 초기화
      else emaAtr = (tr - emaAtr) * (2 / (14 + 1)) + emaAtr; // 14일 EMA ATR 공식

      // 1. 청산 로직 (Exit Logic) - 관통(Penetration) 체결 모델
      if (position) {
        position.daysHeld++;
        position.highestHigh = Math.max(position.highestHigh, current.high);

        const { targetPrice, scaleOutPrice, stopPrice } = calculateDNATargets(
          position.entryPrice, position.atr, position.daysHeld, current.close, position.highestHigh
        );

        // 호가창의 환상 제거: 목표가를 단지 '터치'한 게 아니라 1.5% 이상 확실히 '관통'해야만 체결 인정
        const targetPenetration = targetPrice * 1.015;
        const scaleOutPenetration = scaleOutPrice * 1.015;
        // 손절선도 마찬가지로 1.0% 이상 확실히 깨져야 패닉셀 발동
        const stopPenetration = stopPrice * 0.99;

        // 1-A. 분할 익절 (Scale-Out 50%)
        if (!position.scaledOut && current.high >= scaleOutPenetration) {
          const halfAmount = position.amount / 2;
          this.closePosition(ticker, current.date, scaleOutPrice, { ...position, amount: halfAmount }, 'SCALE_OUT');
          position.amount -= halfAmount;
          position.scaledOut = true;
          // 분할 익절 후 본절가(Break-even) 혹은 더 높은 가격 확보 유도
          position.entryPrice = Math.max(position.entryPrice, position.entryPrice * 1.01);
        }

        // 1-B. 전량 청산
        if (current.high >= targetPenetration) {
          this.closePosition(ticker, current.date, targetPrice, position, 'TARGET');
          position = null; pendingEntry = false;
        } else if (current.low <= stopPenetration) {
          this.closePosition(ticker, current.date, stopPrice, position, 'STOP');
          position = null; pendingEntry = false;
        } else if (position.daysHeld >= 12) {
          this.closePosition(ticker, current.date, current.close, position, 'TIME_STOP');
          position = null; pendingEntry = false;
        }
      }

      // 2. 진입 로직 (Entry) - Next Day Open
      if (pendingEntry && !position) {
        const riskAmount = this.balance * 0.05; // 5% Half-Kelly 
        position = {
          entryPrice: current.open,
          entryDate: current.date,
          atr: emaAtr, // 지연 없는 EMA ATR 사용
          daysHeld: 0,
          amount: riskAmount / current.open,
          highestHigh: current.open,
          scaledOut: false
        };
        pendingEntry = false;
        continue; 
      }

      // 3. 시그널 스캔 (Signal Scan)
      const change = ((current.close - prev.close) / prev.close) * 100;
      const atrPercent = (emaAtr / prev.close); // 가격 대비 ATR 비율
      const avgVol20 = candles.slice(i-20, i).reduce((sum, c) => sum + c.volume, 0) / 20;
      
      const score = calculateDynamicDnaScore(change, current.volume, avgVol20, atrPercent);
      const rvol = current.volume / (avgVol20 || 1);

      // [핵심] MA20 미분(Slope) 필터 도입: 20일선 자체가 상승 중인가?
      const sma20_today = candles.slice(i-19, i+1).reduce((sum, c) => sum + c.close, 0) / 20;
      const sma20_yesterday = candles.slice(i-20, i).reduce((sum, c) => sum + c.close, 0) / 20;
      const isTrendUp = sma20_today > sma20_yesterday; // 기울기가 양수(+)일 때만 진짜 상승 추세

      // 필터: 점수 70 이상 + 거래량 폭발 + 종가가 20일선 위 + 20일선이 우상향 중 (문턱 완화)
      if (!position && score >= 70 && rvol > 2.0 && current.close > sma20_today && isTrendUp) {
        pendingEntry = true; 
      }
    }
  }

  private closePosition(ticker: string, date: string, price: number, pos: any, reason: string) {
    let actualExitPrice = price;
    if (reason === 'TARGET' || reason === 'SCALE_OUT') actualExitPrice = price * 0.99;  // 1% 익절 슬리피지
    else if (reason === 'STOP' || reason === 'TIME_STOP') actualExitPrice = price * 0.985; // 1.5% 손절 슬리피지

    const pnl = (actualExitPrice - pos.entryPrice) * pos.amount;
    this.balance += pnl;
    this.trades.push({
      ticker,
      entryDate: pos.entryDate,
      exitDate: date,
      entryPrice: pos.entryPrice,
      exitPrice: Number(actualExitPrice.toFixed(4)),
      pnl,
      isWin: pnl > 0,
      reason
    });
  }

  public report() {
    const totalTrades = this.trades.length;
    if (totalTrades === 0) {
      console.log("\n[REPORT] No trades executed.");
      return;
    }

    const wins = this.trades.filter(t => t.pnl > 0);
    const losses = this.trades.filter(t => t.pnl <= 0);
    const winRate = (wins.length / totalTrades) * 100;
    
    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0)) / losses.length : 0;
    const rrRatio = avgLoss === 0 ? avgWin : avgWin / avgLoss;

    const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLoss === 0 ? grossProfit : grossProfit / grossLoss;
    
    const ev = (winRate / 100 * avgWin) - ((1 - winRate / 100) * avgLoss);
    
    const totalROI = ((this.balance - this.initialBalance) / this.initialBalance) * 100;

    console.log(`\n=========================================`);
    console.log(` FINAL BACKTEST REPORT (ROBUST) `);
    console.log(`=========================================`);
    console.log(`Total Trades:    ${totalTrades}`);
    console.log(`Win Rate:        ${winRate.toFixed(2)}%`);
    console.log(`Avg Win/Loss:    $${avgWin.toFixed(2)} / $${avgLoss.toFixed(2)}`);
    console.log(`R/R Ratio:       ${rrRatio.toFixed(2)}`);
    console.log(`-----------------------------------------`);
    console.log(`Profit Factor:   ${profitFactor.toFixed(2)}`);
    console.log(`Expected Value:  $${ev.toFixed(2)} / trade`);
    console.log(`Max Drawdown:    ${this.maxDrawdown.toFixed(2)}%`);
    console.log(`-----------------------------------------`);
    console.log(`Total ROI:       ${totalROI.toFixed(2)}%`);
    console.log(`Final Balance:   $${this.balance.toFixed(2)}`);
    console.log(`=========================================\n`);
    
    if (profitFactor > 1.5 && ev > 0 && this.maxDrawdown < 20) {
      console.log(`✅ [VERDICT] Mathematical Edge Confirmed. System is robust.`);
    } else if (profitFactor > 1.0 && ev > 0) {
      console.log(`⚠️ [VERDICT] Marginal Edge. Tuning recommended (Check MDD).`);
    } else {
      console.log(`❌ [VERDICT] System Failure. Negative expectancy.`);
    }
  }
}

/**
 * Mock Data Generator for initial run
 */
function generateMockCandles(count: number, startPrice: number): Candle[] {
  const candles: Candle[] = [];
  let currentPrice = startPrice;
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getTime() - (count - i) * 24 * 60 * 60 * 1000).toISOString();
    const volatility = currentPrice * 0.05;
    const open = currentPrice;
    const high = open + Math.random() * volatility;
    const low = open - Math.random() * volatility;
    const close = low + Math.random() * (high - low);
    const volume = 1000000 + Math.random() * 10000000;
    
    candles.push({ date, open, high, low, close, volume });
    currentPrice = close;
  }
  return candles;
}

// MAIN EXECUTION
const engine = new RobustBacktestEngine();

const dataPath = path.join(__dirname, '../data/backtest');

if (fs.existsSync(dataPath)) {
  const files = fs.readdirSync(dataPath).filter(f => f.endsWith('.json'));
  if (files.length > 0) {
    console.log(`[BOOT] Found ${files.length} historical data files. Loading...`);
    files.forEach(file => {
      const ticker = file.replace('.json', '');
      const data = JSON.parse(fs.readFileSync(path.join(dataPath, file), 'utf-8'));
      engine.run(ticker, data);
    });
  } else {
    runMock();
  }
} else {
  runMock();
}

function runMock() {
  console.log(`[BOOT] No historical data found. Running with mock data...`);
  const tickers = ['SNDL', 'MULN', 'IDEX', 'ZOM', 'FCEL'];
  tickers.forEach(t => {
    const mockCandles = generateMockCandles(252, Math.random() * 5 + 0.5);
    engine.run(t, mockCandles);
  });
}

engine.report();

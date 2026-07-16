# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 철학

**100% 퀀트 알고리즘** — LLM 예측, AI 생성 시그널 없음. 모든 매매는 수학적 모델(가격·거래량·기술적 지표)로만 결정된다.

- **Frontend**: React 19 + TypeScript + Vite + TailwindCSS (`src/`)
- **Backend**: FastAPI + Python 3.11 + Uvicorn (`python_engine/`)
- **Database**: Supabase (PostgreSQL + Edge Functions + RLS)
- **Broker**: Alpaca Markets API (paper mode 기본)
- **Alerts**: Discord Webhook

---

## 개발 명령어

```bash
# 전체 동시 실행 (권장)
npm run dev:all

# Frontend만 (port 5173)
npm run dev

# Backend만 (port 8001)
npm run dev:python
# 또는 직접:
cd python_engine && uvicorn main:app --host 127.0.0.1 --port 8001 --reload

# 프론트 빌드 (TypeScript 타입 검사 포함)
npm run build

# 린트
npm run lint

# 페니 엔진 단위 테스트
python_engine/venv/bin/python python_engine/test_penny_engine.py

# 데이터 파이프라인 테스트
python_engine/venv/bin/python python_engine/test_pipeline.py

# DNA 백테스트
cd python_engine && python portfolio_backtester.py

# DNA 파라미터 최적화 (γ, δ, λ 그리드 서치)
cd python_engine && python optimize_dna.py

# Supabase Edge Functions 배포
supabase functions deploy
```

---

## 시스템 아키텍처 전체 플로우

### 일반 퀀트 파이프라인

```
[1] 퀀트 스캐너 (DNA ≥ 80)
        │
        ▼
[2] 관심종목 자동 등록 (watchlist, status=WATCHING)
        │
        ▼
[3] STRONG BUY 조건 충족 시 Alpaca 가상 매수
    - paper_positions 생성 (status=HOLD)
    - watchlist status → HOLDING
    - Discord 🚀 알림
        │
        ▼
[4] 실시간 모니터링 (1분봉 스트림)
    ├─ RSI > 60 → 50% Scale-Out + TS 본절+1% + watchlist stop_loss 동기화
    └─ 가격 < Trailing Stop → 전량 청산
           - paper_history 기록
           - watchlist status → EXITED
           - Discord ✅/🛑 알림
```

### Penny Lab 파이프라인 ($1 이하 전용)

```
[1] POST /api/penny/scan
    - Alpaca 스크리너(most-actives/movers)로 당일 모멘텀 후보 조회 + 전체 유니버스(~10,150개) 배치 스냅샷(11요청)으로 가격·달러볼륨 필터 (2026-07-17: 무작위 500개 샘플링 방식 폐기 — 이하 "과거 수정된 버그" 참고)
    - yfinance 2개월 일봉 → RSI/MACD/ADX/RVOL → DNA 점수
        │
        ▼
[2] Top 3 자동 watchlist 등록 (status=WATCHING)
    ※ HOLDING/EXITED 종목은 status 갱신 금지
    ※ 신규 등록 종목 발생 시 → 장 중이면 Alpaca 스트림 즉시 재시작
        │
        ▼
[3] STRONG BUY 신호 → paper_engine.process_signal()
    - 진입가 ≤ $1이면 페니 파라미터 자동 전환 (is_penny = entry_price ≤ 1.0)
    - 초기 TS: -15% (일반: -10%)
    - MomentumValidator 인터셉터: RVOL < 1.5 또는 현재가 < 15분봉 20 EMA → 차단
        │
        ▼
[4] 페니 상태 머신
    ├─ 수익 +10% 달성: TS 하한을 진입가(본전)로 락인
    ├─ RSI > 65 OR 수익률 ≥ +10%: 50% Scale-Out + -5% 타이트 TS
    └─ 가격 < TS: 전량 청산
```

---

## 백엔드 모듈 구조 (`python_engine/`)

### 진입점 & 핵심 클래스 (`main.py`)

`main.py`는 FastAPI 앱 조립과 퀀트 엔진 핵심 로직을 모두 담는다.

| 클래스/함수 | 역할 |
|---|---|
| `ConnectionManager` | WebSocket 브로드캐스터 |
| `TickerDataState` | 1분봉 히스토리 유지 + Volume Multiplier(IEX→Full Market) 캘리브레이션 |
| `MTFCache` | 15분봉 20 EMA를 15분 주기로 캐싱 (MomentumValidator에 공급) |
| `MomentumValidator` | STRONG BUY 직전 RVOL·상위 추세 2중 검증 인터셉터 |
| `calculate_advanced_signals()` | RSI·MACD·ADX·RVOL → `DNA_Score`·`Strong_Buy` 컬럼 생성 |
| `calculate_dna_score()` | 스칼라 입력 → 0~100 DNA 점수 반환 (페니 스캔용) |
| `run_pulse_engine()` | 1분봉 → 지표·포지션 사이징·DNA 합성 → WebSocket payload |
| `run_quant_scan_internal()` | 페니 스캔 핵심 — HTTP 엔드포인트·자동 스케줄러 양쪽에서 호출 |
| `on_minute_bar_closed()` | Alpaca 1분봉 콜백: HOLD 포지션은 경량 모니터 경로, 미보유는 전체 DNA 경로 분기 |
| `start_alpaca_stream()` | Alpaca WebSocket IEX 스트림 기동 (인증 실패·connection limit 시 REST 폴링 폴백) |
| `stream_scheduler()` | 개장/폐장 감지해 스트림 자동 시작/종료 |
| `mtf_cache_scheduler()` | 15분봉 EMA 캐시 갱신 (15분 주기) |
| `auto_penny_scan_scheduler()` | 서버 기동 30초 후 즉시 + 이후 `SCAN_INTERVAL_SECONDS`(2시간) 주기 자동 페니 스캔 |
| `auto_cleanup_scheduler()` | EXITED 3일, WATCHING 7일 초과 watchlist 행 자동 삭제 |
| `stream_liveness_watchdog()` | 3분 주기로 WebSocket 생존 체크 — 5분 무응답 시 강제 재연결 |
| `system_heartbeat()` | 10분 주기 Discord Dead Man's Switch |

### 라우터 (`python_engine/routers/`)

| 파일 | 역할 |
|---|---|
| `analyze.py` | `POST /api/analyze` — DNA 분석 |
| `broker.py` | paper 계좌·포지션·수동 매도·ARM 토글 |
| `penny.py` | `POST /api/penny/scan` |
| `pulse.py` | `GET /api/pulse/status` |
| `strategy.py` | `GET /api/strategy/stats` + `stats_cache` 공유 |
| `backtest.py` | 백테스트 엔드포인트 |
| `settings.py` | 전략 파라미터 조회/수정 |
| `edge.py`, `parts.py`, `portfolio.py` | 기타 분석·포트폴리오 |

### 공유 전역 상태 (`state.py`)

모든 라우터와 `main.py`가 `from state import app_state`로 참조한다. `AppState` 단일 인스턴스에 Supabase 클라이언트, PaperEngine, Alpaca TradingClient, Webhook, ConnectionManager, TickerDataState, MTFCache, `SYSTEM_ARMED` 플래그, `_held_tickers` Set 등이 집약된다.

### 기타 모듈

| 모듈 | 역할 |
|---|---|
| `paper_engine.py` | Paper trading 상태 머신 (매수/Scale-Out/TS/청산) |
| `db_manager.py` | Supabase 클라이언트 팩토리 + `get_active_tickers()` |
| `webhook_manager.py` | Discord Webhook 발송 |
| `portfolio_backtester.py` | Walk-Forward Analysis DNA 백테스터 |
| `optimize_dna.py` | γ·δ·λ 그리드 서치 최적화 |
| `watchdog.py` | 외부 watchdog 프로세스 (PID 파일로 중복 방지) |

---

## 퀀트 스캐너

### 두 가지 스캐너

| 스캐너 | 위치 | 실행 주기 |
|---|---|---|
| **Edge Function 스캐너** | `supabase/functions/run-quant-scanner/index.ts` | 수동 또는 스케줄 |
| **Pulse Engine 스캐너** | `python_engine/main.py → run_pulse_engine()` | Alpaca 1분봉 실시간 |
| **Penny 스캐너** | `python_engine/main.py → run_penny_scan_internal()` | 자동(4h) + 수동(POST /api/penny/scan) |

### DNA 점수 기준

```
Tier-1 (STRONG BUY) → DNA ≥ 80          일반 종목
Tier-2 (BUY)        → DNA ≥ 75 + RVOL > 1.5  일반 종목
Tier-Penny (STRONG BUY) → DNA ≥ 65      페니 종목 ($1 이하)
HOLD 시그널  → DNA 60
SELL 시그널  → DNA 40
```

### STRONG BUY 조건 (`calculate_advanced_signals()` in `main.py`)

```python
Strong_Buy = (
    DNA_Score >= (80 | 75 | 65)  # Tier-1 / Tier-2 / Penny thresholds
    AND RSI < 70                 # 과매수 방지
    AND Numba OR Conditions      # Is_Golden/Adx/Macd_Diff_Rise 등에 의한 점수 획득
)
```

### MomentumValidator 인터셉터 (`main.py`)

STRONG BUY 신호가 생성된 후, `on_minute_bar_closed()` 내부에서 두 가지를 추가 검증한다:

1. **RVOL < 1.5** → 차단 (거래량 부족)
2. **현재가 < 15분봉 20 EMA** (`MTFCache`) → 차단 (상위 추세 하락) ※ DNA ≥ 80이면 스킵

MTF 캐시 미존재 시 검증을 스킵하고 진입 허용한다.

### 1분봉 경로 분기 (`on_minute_bar_closed()`)

HOLD 포지션(`app_state._held_tickers`)은 경량 경로: RSI-14·ATR-14만 계산하고 `process_signal()`에 직접 전달. 미보유 종목은 전체 `run_pulse_engine()` 경로(DNA·포지션 사이징·WebSocket broadcast).

---

## Paper Trading 엔진 (`python_engine/paper_engine.py`)

### 포지션 사이징 상수

```python
KELLY_FRACTION = 0.15    # 가용 현금의 15% (Kelly 15% × $100k = $15k → MAX_BUY_BUDGET 캡으로 $5k 고정)
MIN_BUY_BUDGET = 10.0   # 최소 주문 금액
MAX_BUY_BUDGET = 5000.0 # 종목당 최대 매수 금액 ($5000)
MAX_CONCURRENT_POSITIONS = 20  # 동시 보유 최대 종목 수 (실질 도달 가능한 상한)
MAX_CONCENTRATION_PCT = 0.75   # 총 자산 대비 투입 비중 상한 (20종목 × $5k = $100k = 100% 이론 상한)
TS_INIT_PCT    = 0.90   # 일반: 초기 TS -10%
TS_TRAIL_PCT   = 0.95   # 일반: 최고가 추종 TS
REENTRY_COOLDOWN_MINUTES = 15  # 청산 후 재진입 금지 시간
ENFORCE_PDT_SAFEGUARD = False  # PDT Rule = 마진 계좌 $25k 미만 전용, $100k 가상 계좌에 미적용
```

### Penny Lab 전용 상수 (`paper_engine.py` 상단)

```python
PENNY_MAX_PRICE        = 1.0   # 이 가격 이하이면 페니 파라미터 자동 전환
PENNY_TS_INIT_PCT      = 0.85  # 초기 TS -15%
PENNY_TS_TRAIL_PCT     = 0.90  # 최고가 추종 TS
PENNY_BREAKEVEN_TRIGGER= 1.10  # +10% 달성 시 TS 하한 → 진입가
PENNY_SCALE_OUT_RSI    = 60    # 1차 매도 RSI 기준
PENNY_SCALE_OUT_PROFIT = 0.10  # 1차 매도 수익률 기준 (+10%)
PENNY_TIGHT_TS_PCT     = 0.95  # Scale-Out 후 잔여 물량 TS -5%
```

`is_penny` 판정: `entry_price <= PENNY_MAX_PRICE` — **현재가 기준이 아닌 진입가 기준**이므로 보유 중 주가가 $1 이상으로 오르더라도 페니 파라미터 유지.

### Scale-Out 조건 (`process_signal()`)

```python
# 일반 종목
scale_trigger = rsi > 55

# 페니 종목 (is_penny=True)
scale_trigger = rsi > PENNY_SCALE_OUT_RSI or (price/entry_price - 1) >= PENNY_SCALE_OUT_PROFIT
```

### Paper Engine 상태머신 로직 (process_signal)

매 1분봉 데이터가 들어올 때마다 다음 순서로 검증한다:
1. **신규 진입**: 현재 포지션이 없고, 보유 중인 종목 수가 20개(MAX_CONCURRENT_POSITIONS) 미만이며, 투입 자본이 계좌의 75%(MAX_CONCENTRATION_PCT) 미만일 때 진입. 페니 주식은 DNA≥65, 일반 주식은 DNA≥75 필요 (quant_engine.py의 tier_penny/tier2 기준과 정합). 포지션 수·집중도·예산 산정·진입 클레임 INSERT는 `_entry_lock`으로 직렬화되어 서로 다른 티커의 동시 신호가 상한을 초과해 진입하는 경합을 막는다.
2. **Time-Decay Exit**: Scale-Out 미완료 포지션 한정. 일반 60분·페니 90분 경과 & 수익률 ±2% 이내(횡보)면 청산. 오버나이트 홀딩은 당일 09:30 ET 기준으로 경과 시간 리셋.
3. **EOD 청산**: 15:30 ET 기준 수익률이 +5% 이하면 강제 청산 (오버나잇 리스크 헷지).
4. **TS 업데이트**: 최고가 갱신 시 `Highest - k×ATR` 또는 고정 % 방식으로 스탑 상향.
5. **Scale-Out 발동**: 1차 조건 도달 시 보유 수량의 50% 매도 후 3분간 TS 발동 쿨다운.
6. **TS 청산**: 현재가가 `ts_threshold` 밑으로 내려가면 잔여 물량 전량 청산.

### watchlist 동기화 메서드

| 메서드 | 트리거 | 동작 |
|---|---|---|
| `_sync_watchlist_buy()` | 매수 실행 시 | status=HOLDING, buy_price, stop_loss 기록 |
| `_sync_watchlist_stop_loss()` | Scale-Out 시 | stop_loss 갱신 |
| `_sync_watchlist_exit()` | 청산 시 | status=EXITED |

---

## 대시보드 구조

### 단일 진입점: `src/pages/UnifiedDashboard.tsx`

탭 없는 단일 스크롤 뷰. `/stock/dashboard` 하나의 URL만 사용한다 (`useSearchParams` 없음).

구버전 라우트는 모두 이 페이지로 리다이렉트:
- `/dashboard`, `/pulse`, `/command`, `/scanner`, `/scan`, `/penny` → `/stock/dashboard`

`Dashboard.tsx`, `ScannerPage.tsx`는 삭제됨. UnifiedDashboard가 모든 기능을 흡수.

### 화면 레이아웃 (위 → 아래)

| 섹션 | 내용 |
|---|---|
| **헤더** | 시장 개장 상태 · ARM 토글 · Auto Scan 상태 배지(읽기 전용) · 설정 |
| **지표 카드 4개** | 총 자산 · 가용 잔고 · 미실현 손익 · 백테스트 승률 |
| **메인 풀와이드** | 누적 손익 차트 + 퀀트 추천 종목 2열 그리드 (full width) |
| **하단 2열** | 좌(2/3): 현재 보유 포지션 테이블 / 우(1/3): 최근 청산 이력 |
| **좌측 Action Center 카드** | "AI 퀀트 헌팅 실행" 버튼 (헤더가 아닌 카드에 위치) |

### 헤더 버튼 동작

| 버튼/요소 | 위치 | 동작 | 비고 |
|---|---|---|---|
| **ARM 토글** | 헤더 | `POST /api/broker/arm` → `is_armed` 전환 | 실동작. 현재 상태 + "→ 전환" 레이블 분리 표시 |
| **Auto Scan 상태 배지** | 헤더 | `pennyScanStatus.last_scan_at` 읽기 전용 표시 | 트리거 버튼 아님 — 서버 자동 스케줄러(`auto_penny_scan_scheduler`)의 마지막 실행 시각만 표시 |
| **AI 퀀트 헌팅 실행** | 좌측 Action Center 카드 | Edge Function `admin-proxy/api/hunt` → `routers/penny.py` → `/api/quant/scan` 트리거 | 실동작. Alpaca Universe · DNA ≥ 80 · 일반 종목 |
| **설정** | 헤더 | `CommandSettings` 슬라이드 패널 열기 | 패널은 ARM 토글 + Discord Webhook 설정/테스트만 제공 (아래 참고) |

**페니 스캔 수동 트리거 버튼은 UI에 존재하지 않는다.** `POST /api/penny/scan`은 서버 기동 30초 후 및 이후 `SCAN_INTERVAL_SECONDS`(2시간, `core/quant_scanner.py`) 주기로 `auto_penny_scan_scheduler()`가 자동 호출한다 (`main.py`). 과거 프론트엔드에 있던 `pennyService.ts`의 `scanPennyStocks()` 수동 트리거 함수는 어디서도 호출되지 않고 존재하지 않는 라우트(`/api/penny/scan` vs 실제 프리픽스 `/api/quant`)를 가리키는 죽은 코드였으므로 삭제됨 (2026-07-08).

### CommandSettings (NexGuard Control 패널) 실제 구성

`src/components/dashboard/CommandSettings.tsx` — 헤더 "설정" 버튼으로 여는 슬라이드 패널. 다음 2가지만 실제로 동작한다:
- **ARM/DISARM 토글**: `POST /api/broker/arm` → `state.py`의 `app_state.SYSTEM_ARMED` 즉시 반영, `paper_engine.py`가 매 시그널마다 참조
- **Discord Webhook URL 입력 + Test 버튼**: `POST /api/settings/webhook`, `/api/settings/webhook/test` → `app_state.webhook` 즉시 반영 (재시작 불필요)

과거 있었던 "DNA Score Threshold" 슬라이더와 "FLUSH CACHE" 버튼은 삭제됨 (2026-07-08) — 둘 다 DB 컬럼(`alert_threshold`)이나 테이블(`backtest_cache`)에 쓰기는 했지만 백엔드 어디서도 그 값을 읽지 않는 죽은 UI였다. 실제 DNA 매수 게이트(`paper_engine.py`의 `dna_gate=55/70`, `quant_engine.py`의 tier 80/75/65 임계값)와 백테스트 캐시(`routers/backtest.py`의 인메모리 `TTLCache`)는 여전히 하드코딩된 모듈 상수이며, 설정 패널을 통해 조정할 수 없다. 이 상수들을 UI에서 조정 가능하게 하려면 `system_settings`에 실제 컬럼을 추가하고 백엔드가 런타임에 읽도록 리팩터링해야 한다.

`/settings` 라우트와 사이드바의 "환경 설정" 메뉴는 100% 목업 데이터로 구성된 별개의 `SettingsView.tsx` 컴포넌트를 가리켰으나, 실제 설정 기능과 무관한 죽은 화면이었으므로 삭제하고 `/stock/dashboard`로 리다이렉트하도록 변경 (2026-07-08). 설정은 이제 대시보드 헤더의 "설정" 버튼(NexGuard Control 패널)에서만 접근한다.

### 누적 손익 차트

- `paper_history` 기반 실제 청산 이력으로만 구성
- 이력이 없으면 "청산 이력이 없습니다" 빈 상태 UI 표시 (샘플 데이터 없음)
- 30초마다 `loadDashboardData()` + `loadArmStatus()` 자동 갱신

### 페니 표시 임계값 (`UnifiedDashboard.tsx` 상단 상수)

```typescript
const PENNY_DISPLAY_THRESHOLD = 1.5; // 현재가 기준 +50% tolerance
```

- 발굴 종목의 `isPenny` 판정: `currentPrice <= 1.5`
- 포지션·이력의 `isPenny` 판정: `entry_price <= 1.0` (진입가 기준, 변경 없음)

### 컴포넌트 연결 구조

```
Frontend (Vite :5173)
  ├─ WS   /py-api/ws/pulse             → FastAPI :8001  (Vite proxy: ws 지원)
  ├─ REST /py-api/api/broker/paper/*   → FastAPI :8001  (X-Admin-Key 인증)
  ├─ REST /py-api/api/penny/scan       → FastAPI :8001  (X-Admin-Key 인증)
  ├─ REST /py-api/api/strategy/stats   → FastAPI :8001
  ├─ REST /py-api/api/pulse/status     → FastAPI :8001
  ├─ REST /yahoo-api/...               → Yahoo Finance  (Vite proxy, CORS 우회)
  ├─ Supabase JS  system_settings      → Supabase DB    (RLS: anon UPDATE 허용)
  └─ Edge Fn  admin-proxy/api/hunt     → Supabase Edge Function
```

### 데이터 로딩 패턴 (UnifiedDashboard)

단일 `loadDashboardData()` 함수가 모든 데이터를 병렬 fetch:
- watchlist (티커·상태만, 가격 조회 없음), paper_positions, paper_history, paper_account, daily_discovery
- 30초 `setInterval`로 자동 갱신 (ARM 상태 포함)
- `watchlistItems`는 discovery 카드의 관심종목 체크 표시에만 사용 (`watchlistedTickers` Set)

---

## API 엔드포인트

### Paper Trading

| Endpoint | Method | 설명 |
|---|---|---|
| `/api/broker/paper/account` | GET | 가상 계좌 잔고 |
| `/api/broker/paper/positions` | GET | 현재 보유 포지션 |
| `/api/broker/paper/history` | GET | 최근 30건 거래 이력 |
| `/api/broker/paper/sell` | POST | 수동 청산 `{ticker}` |
| `/api/broker/arm` | POST | 자동 매매 ON/OFF `{arm: bool}` |

### Penny Lab

| Endpoint | Method | 설명 |
|---|---|---|
| `/api/penny/scan` | POST | 페니 스캔 `{max_price, top_n}` |

### 분석 / 인프라

| Endpoint | Method | 설명 |
|---|---|---|
| `/api/analyze` | POST | DNA 분석 `{ticker, period}` |
| `/api/strategy/stats` | GET | 승률, PF, MDD 통계 |
| `/api/broker/status` | GET | Alpaca 연결 상태 |
| `/api/pulse/status` | GET | 펄스 엔진 시장 상태 |
| `/ws/pulse` | WebSocket | 1분봉 실시간 스트림 |

---

## 데이터베이스 테이블

### Paper Trading

| 테이블 | 역할 |
|---|---|
| `paper_account` | 가상 계좌 잔고 |
| `paper_positions` | 현재 보유 포지션 (TS, 수량, 상태) |
| `paper_history` | 청산된 거래 이력 (PnL, 사유) |

### 관심종목 / 발굴

| 테이블 | 역할 |
|---|---|
| `watchlist` | 관심종목 (수동+자동 등록). `user_id IS NULL` = 엔진 자동 등록. `initial_dna_score`는 매 스캔 시 최신 DNA로 갱신됨 |
| `daily_discovery` | 스캐너 발굴 종목 (DNA, 섹터, 가격) |
| `quant_signals` | Edge Function 시그널 아카이브 |
| `realtime_signals` | Pulse Engine 실시간 시그널 |
| `penny_universe_pool` | 페니 스캔 누적 종목 풀 (scan_count, last_seen_at 기반 우선 재검) |

### watchlist 상태 전이

```
WATCHING → HOLDING  : 퀀트 엔진 매수 실행 시 (_sync_watchlist_buy)
HOLDING  → EXITED   : 트레일링 스탑 발동 또는 수동 매도 시 (_sync_watchlist_exit)
```

watchlist 자동 조작 시 반드시 `.is_("user_id", "null")` 필터를 포함해야 다른 사용자 행을 건드리지 않는다.

---

## SYSTEM_ARMED 플래그

`python_engine/state.py` → `app_state.SYSTEM_ARMED`. `False`이면 스캐닝은 하되 매수 실행 없음. 트레일링 스탑 청산은 ARMED 해제 상태에서도 실행됨(손실 확대 방지 우선).

```
POST /api/broker/arm { "arm": true }   # 자동 매매 활성화
POST /api/broker/arm { "arm": false }  # 관제 전용
```

---

## 새 기능 추가 가이드

### FastAPI 엔드포인트 추가
`python_engine/routers/` 아래에 라우터 파일 작성 후 `main.py`에 `app.include_router()`. Pydantic `BaseModel`로 요청 스키마 정의, `api_key: str = Security(get_api_key)` 인증 패턴 사용.

### Frontend API 호출 추가
`src/services/pythonApiService.ts` — `brokerApiFetch()` (X-Admin-Key 인증) 또는 `apiFetch()` (공개) 사용.

### Supabase 테이블 추가
`supabase/migrations/` 에 타임스탬프 prefix로 마이그레이션 파일 생성 → `supabase db push`.

---

## 환경 변수

### Frontend (`/.env`)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_SUPABASE_SERVICE_ROLE_KEY
VITE_FINNHUB_API_KEY
VITE_ADMIN_SECRET_KEY
```

### Backend (`/python_engine/.env`)
```
SUPABASE_URL
SUPABASE_KEY                  # service role key (RLS 우회)
SUPABASE_SERVICE_ROLE_KEY
APCA_API_KEY_ID
APCA_API_SECRET_KEY
APCA_PAPER=true               # false = 실제 자금 (주의)
TRADE_MODE=PAPER              # PAPER(기본) | LIVE(실계좌 — APCA_PAPER=false 필수)
DISCORD_WEBHOOK_URL
ADMIN_SECRET_KEY
DISABLE_ALPACA_STREAM=false   # true 시 WebSocket 비활성화 → REST 60초 폴링 모드
NEXAR_CLIENT_ID               # Nexar(Octopart) 부품 검색 병행 소스, 비어있으면 자동 스킵
NEXAR_CLIENT_SECRET
```

---

## 알려진 버그 (미수정)

| 버그 | 파일 | 위치 | 현상 |
|---|---|---|---|

## 과거 수정된 버그

| 버그 | 파일 | 원인 | 수정 |
|---|---|---|---|
| Penny scan이 HOLDING/EXITED 상태 덮어씀 | `main.py` | `run_penny_scan_internal()` auto-register | `not in ("HOLDING","EXITED")` 로 수정 |
| pennyPositions에 일반 포지션 혼입 | `UnifiedDashboard.tsx` | `loadPennySideData()` | `entry_price <= 1.0` 필터 추가 |
| pennyWatchlist가 현재가 기준 필터 | `UnifiedDashboard.tsx` | `loadPennySideData()` | `buyPrice <= 1.0` 기준으로 변경 |
| DNA 게이트 80이 페니 시그널 차단 | `paper_engine.py` | `process_signal()` BUY 조건 | 페니는 70, 일반은 80으로 분기 |
| Scale-Out RSI arm 최소 수익 가드 없음 | `paper_engine.py` | `process_signal()` SCALE_OUT | RSI arm에 `profit >= 5%` 가드 추가 |
| unrealized_plpc NaN 표시 | `UnifiedDashboard.tsx` | `pennyPositions` map | null 가드 후 undefined 저장, UI에서 0 폴백 |
| Lambda 클로저 버그 (fallback 루프) | `main.py` | `run_penny_scan_internal()` fallback | `lambda t=tk: t.fast_info` 로 수정 |
| pennyWatchlist 전체 종목 가격 조회 | `UnifiedDashboard.tsx` | `loadPennySideData()` | buyPrice 직접 필터로 대체 |
| Save Configuration 버튼 크래시 | `CommandSettings.tsx` | `(window as any).apiFetch` 미정의 | `supabase.from('system_settings').update()` 직접 호출로 교체 |
| Dashboard 계좌 잔고 $0 표시 | `main.py` + `LiveExecutionCenter.tsx` | 응답 필드명 불일치 | 백엔드 반환 필드명 통일 |
| watchlist 타 유저 행 덮어쓰기 | `paper_engine.py` | `eq("ticker")` 필터만 사용 | `.is_("user_id", "null")` 필터 추가 |
| 손실 구간 Scale-Out | `paper_engine.py` | `price > entry_price` 체크 없음 | SCALE_OUT 조건에 수익 확인 추가 |
| 1분봉 MA20 필터 — RSI<45 조건과 모순으로 매수 신호 전무 | `quant_engine.py` | `calculate_advanced_signals()` `Strong_Buy` | `is_uptrend = Close > ma20` 조건 제거 — MomentumValidator(15분봉 EMA)가 추세 필터 역할 수행 |
| 청산 시 watchlist 미동기화 (전 경로) | `paper_engine.py` + `routers/broker.py` | `_sync_watchlist_exit()`/`_sync_watchlist_stop_loss()`가 정의만 되고 6개 청산 경로(EOD/Time-Decay/Trailing Stop/Scale-Out/수동매도/비상청산) 어디서도 호출되지 않음 | 6개 청산 경로 모두에 호출 추가 + 어긋난 기존 watchlist 행 백필 (2026-07-06) |
| LIVE 모드 수동매도·비상청산이 실제 Alpaca 주문 미제출 | `routers/broker.py` | `manual_paper_sell`/`emergency_liquidate`가 `app_state.paper_engine` 고정 참조, 주문 훅 미호출 | `app_state.active_engine` 사용 + `_on_order_sell()` 호출로 실주문 제출·체결 확인 후 DB 반영 (2026-07-06) |
| Live 주문 접수=체결로 간주, qty 정수 내림 시 DB와 실계좌 수량 불일치 | `live_engine.py` | `_submit_alpaca_order()`가 주문 접수 즉시 True 반환, 체결 미확인 | 체결 상태를 폴링해 실제 체결 수량을 반환하도록 변경, `process_signal()`이 그 값을 `units`로 사용 (2026-07-06) |
| HOLD 포지션이 daily_discovery 상위권 밖으로 밀려나면 스트림 구독 누락 → current_price가 진입가에 고정되어 평가손익이 항상 +$0.00으로 표시 | `main.py` | `start_alpaca_stream()`가 tickers 미지정 시 `_db.get_active_tickers()`(daily_discovery 상위 N개)만 구독 대상으로 사용, `app_state._held_tickers` 미포함 — 시장 개장 시 및 penny scan 자동 재등록 후 스트림 재시작마다 발생 | `start_alpaca_stream()`·`stream_liveness_watchdog()` 모두 `set(discovery_tickers) | app_state._held_tickers` 로 병합해 구독 (2026-07-07) |
| REST Polling 루프가 고아 태스크로 누적 → Alpaca Data API 429 "too many requests" | `main.py` | `start_alpaca_stream()`의 connection-limit/재연결 예외 처리부가 `asyncio.create_task(...)`만 호출하고 `app_state._current_stream_task`를 갱신하지 않아, `_stop_current_stream()`이 실제 실행 중인 폴링/스트림 태스크를 절대 취소하지 못함 — 재연결마다 폴링 루프가 중복 누적되어 60초마다 Alpaca에 중복 요청 발생 | connection-limit·일반 재연결 두 분기 모두에서 새로 생성한 태스크를 `app_state._current_stream_task`에 대입하도록 수정 (2026-07-07) |
| 백테스트 캐시 키가 `tickers`/`lambda_val`/`slippage_rate`/`target_atr`를 포함하지 않아 다른 조합의 결과를 오반환 | `routers/backtest.py` | `run_backtest_endpoint()` 캐시 키가 `gamma/delta/deviation_threshold/start_date/end_date`만 사용 | 캐시 키에 정렬된 `tickers` + 나머지 파라미터 전부 포함 (2026-07-08) |
| 백테스트 엔진이 라이브 엔진과 별개의 슬리피지 모델(flat 1%) 및 별개의 자본 기준($10,000)을 사용해 이론 승률·PF가 실제 리스크 모델과 괴리 | `portfolio_backtester.py` | `simulate_ticker()`가 `self.slippage_rate`로 균일 슬리피지 적용, `report()`가 `capital=10000.0`으로 자산곡선 산출 — `paper_engine.py`의 페니/저유동성 차등 슬리피지·$100,000 계좌 기준과 불일치 | `paper_engine._apply_slippage()`(페니·저유동성 2배 가중 반영)를 직접 import해 진입/청산가 산출에 재사용, `slippage_rate` 파라미터 제거. 자산곡선 기준자본을 `paper_engine.INITIAL_CAPITAL`($100,000)로 통일. `routers/backtest.py`·`BacktestRunParams`·`BacktestPanel.tsx`에서 `slippage_rate` 필드 제거 (2026-07-08). 단, 진입/청산 로직 자체(RSI2<10 평균회귀, 3거래일 Time-Stop 등)는 라이브의 모멘텀 브레이크아웃 전략과 의도적으로 다른 별개 전략이므로 정합화 대상에서 제외 — `portfolio_backtester.py` 코드 내 "[전략 변경]" 주석 참고 |
| 장시간 구동 시 백엔드 프로세스 RAM이 계단식으로 증가 (RAM 부족 경고) | `main.py` + `services/market_data.py` | `mtf_cache_scheduler`(15분 주기)·`run_quant_scan_internal`(4시간 주기, 최대 80종목)·`paper_portfolio_updater`(30초 주기)가 각각 `yf.download(threads=True)` 배치 호출을 반복 — yfinance의 세션/스레드풀·대형 DataFrame이 명시적으로 해제되지 않아 반복될수록 누적. `auto_quant_scan_scheduler`는 docstring/로그엔 "4시간"이라 되어 있었지만 실제 `sleep(2*3600)`으로 2시간마다 돌던 불일치도 존재 | ① `MTFCache.update_cache()`를 Alpaca `get_stock_bars`(15분봉) 우선 조회로 전환, 커버 안 되는 종목만 yfinance fallback. ② `paper_portfolio_updater()`도 Alpaca `get_stock_latest_trade` 우선 조회로 전환. ③ `run_quant_scan_internal()` 종료부에 `del df_all` + `gc.collect()`, `mtf_cache_scheduler`·`auto_quant_scan_scheduler` 루프 `finally`에 `gc.collect()` 추가. ④ `auto_quant_scan_scheduler` 주기를 `sleep(4*3600)`으로 docstring과 일치시켜 yfinance 대량 배치 호출 빈도 절반으로 축소 (2026-07-11). 런타임 RSS 테스트로 `run_quant_scan_internal` 2회 연속 호출 시 1회차 247MB → 2회차 247.69MB로 누적 증가가 사실상 없음을 확인 — 단, 검증은 단기 반복 기준이며 수일 단위 무중단 운영에서의 안정성은 별도 모니터링 필요 |
| Kelly 회로차단기가 계좌 전체 최근 거래로 판단해 한 종목의 손실이 전 종목 신규 매수를 잠금 | `paper_engine.py` | `process_signal()` fallback이 `paper_history`를 `ticker` 필터 없이 최근 50건 조회 — 계좌 전체 EV가 0 이하로 나오면 `KellySizer.compute()`가 `0.0`을 반환해 무관한 종목까지 `buy_budget=0`으로 매수 전면 차단 (2026-07-13 커밋에서 도입) | fallback 쿼리에 `.eq("ticker", ticker)` 추가 — 회로차단기가 해당 종목 자신의 이력만으로 판단하도록 스코프 축소 (2026-07-15) |
| `_er14_last()`가 횡보장을 강한 추세로 오판해 HOLD 포지션 트레일링 스탑이 정반대로 느슨해짐 | `main.py` | 신규 헬퍼가 `sum_vol==0`일 때 `1.0`(강한 추세) 반환, `quant_engine.py`의 정식 ER 공식은 동일 조건에서 `~0.0`(횡보) 반환 — 서로 반대 값이 같은 `smoothed_er` 파라미터로 `update_reversible_trailing_stop()`에 들어가 k_t 레짐이 뒤집힘. lookback(14 vs 10)·EWM 평활화 유무도 불일치해 HOLD 경량 경로와 전체 DNA 경로의 스탑이 서로 어긋남 (2026-07-13 커밋에서 도입) | `_er14_last()`를 `quant_engine.py`와 동일한 공식(lookback=10, +1e-8 epsilon, EWM span=15)으로 재작성 (2026-07-15) |
| 백테스터 Kelly 표본이 같은 진입가의 서로 다른 거래를 한 그룹으로 잘못 합산 | `portfolio_backtester.py` | `formatted_trades`가 `KellySizer._group_trades()`의 그룹핑 키로 실제 `entry_price`를 그대로 사용 — 백테스터의 `trades`는 라이브의 Scale-Out과 달리 한 행이 이미 독립된 라운드트립인데, 우연히 같은 진입가를 가진 별개의 거래가 하나의 표본으로 뭉개져 표본 수·승률이 축소·왜곡됨 (2026-07-13 커밋에서 도입) | `entry_price` 자리에 거래 인덱스를 넣어 매 거래를 독립 표본으로 그룹핑 (2026-07-15) |
| `run_comparison.py`의 NEW Kelly 사이징이 항상 고정 5% 폴백만 사용 (실제 KellySizer 미검증) | `backtest_harness/run_comparison.py` | `self.closed_trades`에 `{"pnl_pct": <fraction>}`만 저장돼 KellySizer가 기대하는 `ticker`/`entry_price`/`profit_amt`가 없고 스케일도 소수(fraction) vs 퍼센트로 불일치 — `profit_amt`가 항상 0으로 채워져 `entry_val=0`이 되어 모든 표본이 걸러지고 `compute()`가 항상 `None` 반환 (2026-07-13 커밋에서 도입) | `try_enter()`에서 KellySizer 호출 직전 `ticker`/인덱스 기반 `entry_price`/퍼센트 스케일 `profit_amt`·`pnl_pct`로 변환하는 `formatted_trades` 추가 (2026-07-15) |
| HOLD 경량 경로가 봉 1개당 스레드풀 왕복 3회(RSI/ATR/ER 개별 `asyncio.to_thread`) 낭비 | `main.py` | `on_minute_bar_closed()`가 매 1분봉·보유 종목마다 `asyncio.gather`로 스레드 호출 3개를 병렬 실행 — 세 지표 모두 빠른 numpy/ta 연산이라 병렬화 이득 없이 스케줄링 오버헤드만 3배 | `_rsi_atr_er_last()` 헬퍼로 세 지표를 한 스레드 호출에서 계산하도록 통합 (2026-07-15) |
| 서로 다른 티커의 동시 매수/매도가 `cash_available`을 stale 값으로 read-modify-write해 현금 장부가 어긋남 | `paper_engine.py` | `_process_signal_locked()`가 함수 진입 시 fetch한 `acc["cash_available"]`를 매수 체결(`-executed_cost`)·매도 체결(`+proceeds`)·Scale-Out(`+profit_cash`) 세 지점에서 그대로 재사용 — 티커별 `asyncio.Lock`은 동일 티커만 보호하므로 서로 다른 티커가 동시에 각자의 stale 값 기준으로 UPDATE하면 한쪽 반영이 유실됨 | `_apply_cash_delta()` 헬퍼 도입 — 전역 `_cash_lock` 안에서 최신 잔액을 다시 조회한 뒤 delta를 반영하도록 세 지점 모두 교체. `_close_position()`의 불필요해진 `acc` 파라미터도 제거 (2026-07-15) |
| `MAX_CONCURRENT_POSITIONS`(20)가 check-then-act라 서로 다른 티커의 동시 신호가 상한을 초과해 진입 가능 | `paper_engine.py` | `_process_signal_locked()`가 포지션 수 SELECT COUNT와 진입 클레임 INSERT 사이를 잠금 없이 수행 — 티커별 락은 다른 티커 간 경합을 막지 못해, 여러 티커가 동시에 "19개 < 20개"를 읽고 모두 진입해 실제 보유 종목 수가 상한을 초과할 수 있음 | 전역 `_entry_lock`을 도입해 포지션 수 체크~진입 클레임 INSERT 구간을 직렬화. 실주문 제출(`_on_order_buy`, 네트워크 I/O)은 락 해제 후 실행해 서로 다른 티커 간 병렬성은 유지 (2026-07-15) |
| DNA 진입 게이트가 55(페니)/70(일반)까지 조용히 완화되어 quant_engine.py의 tier 기준(65/75/80)보다 낮은 품질의 신호도 통과 | `paper_engine.py` | 커밋 `a8dafad`에서 70/80으로 설정된 게이트가 이후 커밋 `c1fa770`에서 55/70으로 완화됐으나 이 문서(과거 수정된 버그 표·"신규 진입" 절)는 갱신되지 않아 실제 동작과 괴리. `numba_strong_buy`(RSI·RVOL 백분위 랭크 기반) 경로는 DNA_Score 기준 없이 `Strong_Buy=True`를 만들 수 있어, 완화된 게이트와 결합 시 tier_penny(65) 미만인 신호도 매수될 수 있었음 | `dna_gate`를 `65 if is_penny_signal else 75`로 복원해 quant_engine.py의 tier_penny/tier2 기준과 정합시킴. 관련 docstring(`STRONG BUY (DNA≥80)`)도 실제 값으로 수정 (2026-07-15) |
| LIVE 모드에서 체결 확인 폴링(최대 5초)이 티커 락을 점유해 같은 티커의 트레일링 스탑 SELL이 지연 | `live_engine.py` | `_submit_alpaca_order()`가 `FILL_POLL_INTERVAL_SEC=0.5초` 간격으로 `FILL_POLL_TIMEOUT_SEC=5.0초`까지 폴링하는 동안, 이 호출은 `_process_signal_locked()`가 잡고 있는 티커별 `asyncio.Lock` 안에서 실행됨 — 매수 체결 확인 중 가격이 급락해도 같은 티커의 SELL 신호는 락 해제 전까지 대기해야 함 | `PaperTradingManager._get_lock()`을 매수(`_process_signal_locked`의 진입 처리)와 청산(`_close_position`)이 별도 락을 쓰도록 분리 — `_buy_locks`/`_exit_locks` 두 딕셔너리로 분리해, 매수 체결 확인 대기 중에도 동일 티커의 청산 경로가 즉시 진행되도록 함 (2026-07-15) |
| 일반 종목 Scale-Out의 RSI arm(`rsi > 52`)에 최소 수익 가드가 없어 근접 손익분기점에서도 조기 익절 | `paper_engine.py` | 페니 종목 분기는 `profit_pct >= 0.05`를 RSI arm과 함께 요구하도록 이미 수정됐으나(과거 수정된 버그: "손실 구간 Scale-Out"), 일반 종목 분기는 `rsi > 52 or profit_pct >= 0.07`로 남아있어 RSI만으로도 트리거되고 남은 가드는 슬리피지 감안 `~0.1%` 수준의 사실상 무의미한 손익분기 확인뿐 | 일반 종목 RSI arm에도 `profit_pct >= 0.05` 최소 수익 가드를 추가 (2026-07-15) |
| STRONG BUY 신호가 게이트를 전부 통과하고도 실주문 단계에서 조용히 유실되어 매수가 하루 종일 0건 | `live_engine.py` + `paper_engine.py` | (1) `_submit_alpaca_order()`가 체결가 폴백에 정의되지 않은 변수 `int_qty`를 참조 — `order.filled_qty`가 falsy(예: PARTIALLY_FILLED 전이 순간의 "0")일 때 `NameError`로 크래시해 정상 체결도 실패 처리됨. (2) `process_signal()`이 `_on_order_buy()`가 `None`(Alpaca 거절/체결 미확인)을 반환하는 경로에서 클레임만 롤백하고 `_log_decision()`을 호출하지 않아 `engine_decisions` 감사로그에 아무 흔적도 안 남음 — DNA 80짜리 STRONG BUY가 5회 발생해도 BLOCKED/EXECUTED 어느 쪽도 기록되지 않아 원인 추적이 불가능했음. (3) 페니/저유동성 종목은 스프레드가 넓어 `FILL_POLL_TIMEOUT_SEC=5.0`초 안에 체결 확인이 안 되는 경우가 잦아 자동 취소됨 | (1) `int_qty` → `order_qty`로 수정. (2) 주문 거절/미체결 경로에 `gate="ORDER_REJECTED"` `_log_decision()` 호출 추가. (3) `fallback_price <= PENNY_MAX_PRICE`이면 `PENNY_FILL_POLL_TIMEOUT_SEC=12.0`초로 폴링 시간 연장 (2026-07-15) |
| 매수 전 watchlist(WATCHING) 종목이 Alpaca 실시간 스트림/REST 폴링 구독 대상 산출에서 누락 — daily_discovery 순위 밖으로 밀리면 STRONG BUY 신호를 감지할 데이터 자체가 끊김 | `infra/db_manager.py` + `market/alpaca_stream.py` + `schedulers/tasks.py` + `main.py` | `get_active_tickers()`가 `daily_discovery` 테이블만 조회 — HOLD 포지션은 `_held_tickers` 병합으로 이미 해결됐지만(과거 수정된 버그: "HOLD 포지션이 daily_discovery 상위권 밖으로 밀려나면 스트림 구독 누락") 아직 매수 전인 `watchlist` 종목은 구독 산출 어디에도 조회되지 않아 동일한 사각지대가 남아있었음 | `DBManager.get_watchlist_tickers()` 신규 추가(`status=WATCHING`, `user_id IS NULL`, DNA 상위순) — `start_alpaca_stream()`·`start_rest_polling()`·`stream_liveness_watchdog()`·`mtf_cache_scheduler()`·서버 기동 시퀀스(main.py) 5개 지점 모두에서 `discovery_tickers | watchlist_tickers | _held_tickers`로 구독 대상 병합 (2026-07-16) |
| `stream_liveness_watchdog()`가 이전 WS 연결 종료를 기다리지 않고 새 스트림을 띄워 Alpaca가 "connection limit exceeded"로 거절 | `schedulers/tasks.py` | 정체 감지(5분 무봉수신) 시 `app_state._current_ws_stream.close()`를 fire-and-forget으로 호출한 직후 곧바로 `asyncio.create_task(start_alpaca_stream(...))`로 새 연결을 시도 — 이전 연결의 서버 측 종료 핸드셰이크가 끝나기 전에 새 연결이 겹쳐 계정의 WS 슬롯이 일시적으로 2개로 보여 거절당함. 게다가 이 `create_task()` 결과를 `app_state._current_stream_task`에 대입하지 않아(과거 수정된 버그 "REST Polling 루프가 고아 태스크로 누적"과 동일 패턴이 이 호출부에만 재발) 이후 `_stop_current_stream()`이 이 태스크를 절대 취소할 수 없었음 | `_current_ws_stream.close()` 직접 호출 대신 `await _stop_current_stream()`으로 교체(태스크 취소+대기까지 완료 후 재연결) + `start_alpaca_stream()` 결과를 `app_state._current_stream_task`에 대입 (2026-07-16) |
| DNA≥80 STRONG BUY 신호도 MomentumValidator에 RVOL/MTF 재검증을 당해 관심종목 자동 매수가 지연·차단됨 | `services/market_data.py` | `MomentumValidator.validate()`가 `dna_score` 파라미터를 받기만 하고 본문에서 전혀 사용하지 않음 — 문서화된 "DNA≥80이면 스킵" 설계가 코드에 구현되어 있지 않아, 최상급 신호도 그 순간 RVOL<1.5x이거나 현재가가 15분봉 20 EMA보다 낮으면 무조건 HOLD로 강등됨 | `validate()` 최상단에 `if dna_score >= 80.0: return True, "DNA≥80 — 인터셉터 스킵"` 추가 (2026-07-16) |
| DNA 점수 컷오프가 파일마다 제각각(스캔 라벨 STRONG=85, watchlist 등록 컷=70, 프론트엔드 표시 배지 85/70/60 등)이라 실제 매수 게이트(페니 65/일반 75)와 어긋남 | `core/quant_scanner.py` + 프론트엔드 다수 파일 | 스캔 단계(`calculate_dna_score` 스칼라 경로)의 라벨링·watchlist 자동 등록 컷이 실시간 경로(`quant_engine.py` tier1/tier2/tier_penny, `paper_engine.py` dna_gate)와 별도 숫자를 썼음 — DNA 70~74인 일반 종목이 watchlist에 등록되고도 실시간 게이트(75) 미달로 영원히 매수되지 않는 등 사각지대 존재. 프론트엔드도 컴포넌트마다 80/70/85/75/60 등 제각각 매직넘버 사용 | `quant_scanner.py`: 스캔 라벨을 tier1(일반 DNA≥80·RVOL>1.0)/tier2(일반 75·RVOL>1.5)/tier_penny(페니 65)로 재작성, watchlist 등록 컷도 가격 기준 분기(페니 65/일반 75)로 정합. 프론트엔드: `src/constants/dnaThresholds.ts` 신규 도입(`DNA_STRONG_BUY=80`/`DNA_BUY=75`/`DNA_PENNY_STRONG_BUY=65`/`DNA_SELL=40`)해 `generateVerdictFromIndicators.ts`·`AnalysisResultCard.tsx`·`ScannerAssetList.tsx`·`ScannerTopFive.tsx`·`useDashboardData.ts`·`recommendationService.ts` 전부 이 상수를 참조하도록 통일 (2026-07-16) |
| 퀀트 스캐너가 전체 유니버스(~10,150개) 중 무작위 500개만 표본 추출해, 그날 실제로 거래량·모멘텀이 터진 종목을 스캔이 놓치는 경우가 잦았고 4시간(→2시간) 주기로는 유니버스 전체를 한 바퀴 도는 데 며칠이 걸림 | `core/quant_scanner.py` | `run_quant_scan_internal()`의 유니버스 수집이 `random.sample(tradable, 500)` + `penny_universe_pool`(과거 스캔에서 통과한 최대 100개) 조합을 yfinance 배치 다운로드(50개씩)로 가격 필터링 — DNA 스캐너가 원하는 신호(모멘텀·거래량 급증)와 무관한 무작위 표본이라 발굴 효율이 구조적으로 낮았고, 매 스캔 커버리지가 전체의 ~5.6%에 불과 | Alpaca `ScreenerClient`(`get_most_actives`/`get_market_movers`)로 당일 실제 모멘텀 후보를 교차 조회 + `StockHistoricalDataClient.get_stock_snapshot()` 배치 스냅샷(1요청당 최대 1,000심볼)으로 전체 유니버스를 매 스캔마다 100% 커버(~11요청·약 16초, 실측)해 가격·달러볼륨(`>$200k`) 필터링. 무작위 샘플링·`penny_universe_pool` 기반 우선 재검 로직·yfinance 가격 필터 배치 루프 전부 제거 (2026-07-17) |
| 위 수정 직후 상위 80석을 순수 달러볼륨 순으로만 채우자 자본 규모가 큰 대형주·ETF(MDLZ/ABT/XLP/TLT 등)가 상위를 독점 — 스캐너가 원래 노리는 "그날 움직이는 소형주 모멘텀"이 뒤로 밀려 실거래(`/api/quant/scan`) 검증에서 STRONG BUY가 0건이었음 | `core/quant_scanner.py` | (1) Alpaca Asset 모델에 ETF 여부 필드가 없어 대형 ETF가 유니버스에 그대로 섞여 있었음. (2) 스크리너(`get_most_actives`/`get_market_movers`) 결과를 후보 로깅에만 쓰고 최종 상위 80 선정에는 반영하지 않아, 달러볼륨 절대값이 항상 이기는 대형주가 상위를 채움 | (1) 종목명 패턴(`ETF`/`Trust`/`Fund`/`iShares`/`SPDR`/`ProShares` 등)으로 ETF 제외 — 유니버스 10,150→5,746개. (2) 후보 정렬을 "스크리너 통과 종목 우선(달러볼륨순) + 나머지 달러볼륨순"으로 변경. 실거래 검증 결과 상위권이 ATPC(DNA83,RVOL449x)·GORO(DNA77,RVOL15.8x) 등 소형 모멘텀주로 교체되고 STRONG BUY 2건 발생 확인 (2026-07-17) |

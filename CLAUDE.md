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
    - Alpaca universe 샘플링 (500개 신규 + 최대 100개 pool 축적) → $1 이하 필터
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
    - MomentumValidator 인터셉터: RVOL < 3.0 또는 현재가 < 15분봉 20 EMA → 차단
        │
        ▼
[4] 페니 상태 머신
    ├─ 수익 +10% 달성: TS 하한을 진입가(본전)로 락인
    ├─ RSI > 70 OR 수익률 ≥ +20%: 50% Scale-Out + -7% 타이트 TS
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
| `run_penny_scan_internal()` | 페니 스캔 핵심 — HTTP 엔드포인트·자동 스케줄러 양쪽에서 호출 |
| `on_minute_bar_closed()` | Alpaca 1분봉 콜백: HOLD 포지션은 경량 모니터 경로, 미보유는 전체 DNA 경로 분기 |
| `start_alpaca_stream()` | Alpaca WebSocket IEX 스트림 기동 (인증 실패·connection limit 시 REST 폴링 폴백) |
| `stream_scheduler()` | 개장/폐장 감지해 스트림 자동 시작/종료 |
| `mtf_cache_scheduler()` | 15분봉 EMA 캐시 갱신 (15분 주기) |
| `auto_penny_scan_scheduler()` | 서버 기동 30초 후 즉시 + 이후 4시간 주기 자동 페니 스캔 |
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
Tier-1 (STRONG BUY) → DNA ≥ 85          일반 종목
Tier-2 (BUY)        → DNA ≥ 82 + RVOL > 2.0  일반 종목
Tier-Penny (STRONG BUY) → DNA ≥ 70      페니 종목 ($1 이하)
HOLD 시그널  → DNA 60
SELL 시그널  → DNA 40
```

### STRONG BUY 조건 (`calculate_advanced_signals()` in `main.py`)

```python
Strong_Buy = (
    RSI < 45           # 과매도권
    AND MACD 골든크로스  # MACD > Signal, 직전 봉은 MACD ≤ Signal
    AND ADX > 20        # 추세 강도
    AND RVOL > 3.0      # 거래량 폭증 (3배 이상)
    AND NOT Is_Extended # 당일 50% 이상 급등 종목 제외
)
```

### MomentumValidator 인터셉터 (`main.py`)

STRONG BUY 신호가 생성된 후, `on_minute_bar_closed()` 내부에서 두 가지를 추가 검증한다:

1. **RVOL < 3.0** → 차단 (거래량 부족)
2. **현재가 < 15분봉 20 EMA** (`MTFCache`) → 차단 (상위 추세 하락)

MTF 캐시 미존재 시 검증을 스킵하고 진입 허용한다.

### 1분봉 경로 분기 (`on_minute_bar_closed()`)

HOLD 포지션(`app_state._held_tickers`)은 경량 경로: RSI-14·ATR-14만 계산하고 `process_signal()`에 직접 전달. 미보유 종목은 전체 `run_pulse_engine()` 경로(DNA·포지션 사이징·WebSocket broadcast).

---

## Paper Trading 엔진 (`python_engine/paper_engine.py`)

### 포지션 사이징 상수

```python
KELLY_FRACTION = 0.15    # 가용 현금의 15%
MIN_BUY_BUDGET = 10.0   # 최소 주문 금액
MAX_BUY_BUDGET = 1000.0 # 종목당 최대 매수 금액 — 리스크 상한
TS_INIT_PCT    = 0.90   # 일반: 초기 TS -10%
TS_TRAIL_PCT   = 0.90   # 일반: 최고가 추종 TS
```

### Penny Lab 전용 상수 (`paper_engine.py` 상단)

```python
PENNY_MAX_PRICE        = 1.0   # 이 가격 이하이면 페니 파라미터 자동 전환
PENNY_TS_INIT_PCT      = 0.85  # 초기 TS -15%
PENNY_TS_TRAIL_PCT     = 0.85  # 최고가 추종 TS
PENNY_BREAKEVEN_TRIGGER= 1.10  # +10% 달성 시 TS 하한 → 진입가
PENNY_SCALE_OUT_RSI    = 70    # 1차 매도 RSI 기준
PENNY_SCALE_OUT_PROFIT = 0.20  # 1차 매도 수익률 기준 (+20%)
PENNY_TIGHT_TS_PCT     = 0.93  # Scale-Out 후 잔여 물량 TS -7%
```

`is_penny` 판정: `entry_price <= PENNY_MAX_PRICE` — **현재가 기준이 아닌 진입가 기준**이므로 보유 중 주가가 $1 이상으로 오르더라도 페니 파라미터 유지.

### Scale-Out 조건 (`process_signal()`)

```python
# 일반 종목
scale_trigger = rsi > 60

# 페니 종목 (is_penny=True)
scale_trigger = rsi > PENNY_SCALE_OUT_RSI or (price/entry_price - 1) >= PENNY_SCALE_OUT_PROFIT
```

### watchlist 동기화 메서드

| 메서드 | 트리거 | 동작 |
|---|---|---|
| `_sync_watchlist_buy()` | 매수 실행 시 | status=HOLDING, buy_price, stop_loss 기록 |
| `_sync_watchlist_stop_loss()` | Scale-Out 시 | stop_loss 갱신 |
| `_sync_watchlist_exit()` | 청산 시 | status=EXITED |

---

## DnaSimulatorPage (`src/pages/DnaSimulatorPage.tsx`)

백엔드 `paper_engine.py`·`main.py`의 DNA 점수·포지션 사이징·Chandelier Exit 수식을 TypeScript로 수동 복제한 시뮬레이터. **백엔드 상수나 로직 변경 시 이 파일도 반드시 동시에 수정**해야 한다.

```
참조 상수: CHANDELIER_K_NORMAL=3.0, CHANDELIER_K_PENNY=5.0 (paper_engine.py)
```

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
| **헤더** | 시장 개장 상태 · ARM 토글 · 라이브 헌팅 · 페니 스캔 · 설정 |
| **지표 카드 4개** | 총 자산 · 가용 잔고 · 미실현 손익 · 백테스트 승률 |
| **메인 풀와이드** | 누적 손익 차트 + 퀀트 추천 종목 2열 그리드 (full width) |
| **하단 2열** | 좌(2/3): 현재 보유 포지션 테이블 / 우(1/3): 최근 청산 이력 |

### 헤더 버튼 동작

| 버튼 | 동작 | 비고 |
|---|---|---|
| **ARM 토글** | `POST /api/broker/arm` → `is_armed` 전환 | 현재 상태 + "→ 전환" 레이블 분리 표시 |
| **라이브 헌팅** | Edge Function `admin-proxy/api/hunt` 트리거 | Alpaca Universe · DNA ≥ 80 · 일반 종목 |
| **페니 스캔** | `POST /api/penny/scan` | yfinance · $1.50 이하 · DNA ≥ 70 · 2개월 일봉 |
| **설정** | NexGuard Control 슬라이드 패널 열기 | 전략 파라미터 수정 |

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
| `watchlist` | 관심종목 (수동+자동 등록). `user_id IS NULL` = 엔진 자동 등록 |
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

### DnaSimulatorPage 수식 동기화
`paper_engine.py` 또는 `main.py`의 DNA·포지션 사이징·Chandelier Exit 로직 변경 시 `src/pages/DnaSimulatorPage.tsx`를 반드시 함께 수정한다.

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
DISCORD_WEBHOOK_URL
ADMIN_SECRET_KEY
DISABLE_ALPACA_STREAM=false   # true 시 WebSocket 비활성화 → REST 60초 폴링 모드
```

---

## 알려진 버그 (미수정)

| 버그 | 파일 | 위치 | 현상 |
|---|---|---|---|
| Discord 알림 본문 불일치 | `main.py` | `run_penny_scan_internal()` Discord 블록 | `auto_registered`(성공) 기준이 아닌 `results[:top_n]`(전체) 기준으로 알림 생성 |

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
| 수동 매도 시 watchlist 미동기화 | `main.py` | `_sync_watchlist_exit()` 미호출 | position 삭제 후 sync 호출 추가 |
| 손실 구간 Scale-Out | `paper_engine.py` | `price > entry_price` 체크 없음 | SCALE_OUT 조건에 수익 확인 추가 |

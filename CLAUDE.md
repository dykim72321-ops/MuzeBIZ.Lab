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
cd python_engine && uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload

# 프론트 빌드 (TypeScript 타입 검사 포함)
npm run build

# 린트
npm run lint

# 페니 엔진 단위 테스트
python_engine/.venv/bin/python python_engine/tests/test_penny_engine.py

# 데이터 파이프라인 테스트
python_engine/.venv/bin/python python_engine/tests/test_pipeline.py

# DNA 백테스트
cd python_engine && python -m engine.portfolio_backtester

# DNA 파라미터 최적화 (γ, δ, λ 그리드 서치)
cd python_engine && python -m scripts.optimize_dna

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

### Penny Lab 파이프라인 ($1 초과 ~ $50 이하, 2026-07-28부로 스캔 범위 변경 — 하위 "장기 보유 모드 도입" 참고)

**2026-07-28: $1 이하 페니 종목은 스캐닝·watchlist 자동등록 대상에서 완전히 제외됨.** 원인: GSUN/SLGB/INUV/CHAI 등 최악의 손실 사고가 페니 종목에 집중됐던 이력(하위 "과거 수정된 버그" 다수 참고) — 이제 신규 페니 진입 자체가 발생하지 않는다. **2026-07-30: `paper_engine.py`의 `PENNY_MAX_PRICE`/`PENNY_TS_*`/`penny_dna_gate` 등 페니 전용 상태머신 자체를 완전히 삭제함** — 열려있던 진입가 $1 이하 레거시 포지션이 0건임을 DB로 확인 후 제거(하위 "페니($1 이하) 포지션 관리 레거시 제거" 참고). $50 초과 종목도 함께 스캔 대상에서 제외됨(엔드포인트 이름 `/api/penny/scan`·테이블명 `penny_universe_pool` 등은 레거시 명칭 그대로 유지, 실제 스캔 범위와 무관).

```
[1] POST /api/penny/scan
    - Alpaca 스크리너(most-actives/movers)로 당일 모멘텀 후보 조회 + 전체 유니버스(~10,150개) 배치 스냅샷(11요청)으로 가격·달러볼륨 필터 (2026-07-17: 무작위 500개 샘플링 방식 폐기 — 이하 "과거 수정된 버그" 참고)
    - 가격 필터: `SCAN_MIN_PRICE`($1) 초과 ~ `SCAN_MAX_PRICE`($50) 이하만 통과 (2026-07-28, `core/quant_scanner.py`)
    - yfinance 2개월 일봉 → RSI/MACD/ADX/RVOL → DNA 점수
        │
        ▼
[2] Top 3 자동 watchlist 등록 (status=WATCHING)
    ※ HOLDING/EXITED 종목은 status 갱신 금지
    ※ 신규 등록 종목 발생 시 → 장 중이면 Alpaca 스트림 즉시 재시작
        │
        ▼
[3] STRONG BUY 신호 → paper_engine.process_signal()
    - 진입가가 $1 초과 ~ $50 이하이면 장기 보유 파라미터 자동 전환 (is_long_term, 하위 "장기 보유 모드 도입" 참고)
    - 초기 TS: -5% (장기 보유 모드 고정값)
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

폴더별로 책임이 분리되어 있다 — 신규 로직 추가 시 아래 표에서 알맞은 폴더를 먼저 찾고, 어디에도 안 맞으면 새 폴더를 만들지 말고 가장 가까운 폴더에 넣는다.

| 폴더 | 책임 |
|---|---|
| `app/` | FastAPI 앱 조립(`main.py`) + 공유 전역 상태(`state.py`) + 외부 watchdog 프로세스(`watchdog.py`) — 이 3개는 프로젝트의 "진입점 계열" 파일 |
| `routers/` | HTTP 엔드포인트 (`APIRouter`) |
| `core/` | 퀀트 신호 오케스트레이션 — 펄스 엔진 루프, 퀀트 스캐너, WebSocket 브로드캐스터 |
| `services/` | 순수 계산/도메인 로직 — DNA 지표 계산, 시장 데이터 상태(TickerDataState/MTFCache/MomentumValidator), Kelly 사이징 |
| `engine/` | 매매 상태 머신 — paper/live 엔진, 백테스터 |
| `market/` | Alpaca 실시간 스트림 연결·콜백 |
| `infra/` | 외부 시스템 클라이언트 — Supabase(`db_manager.py`), Discord(`webhook_manager.py`), Nexar, 부품 검색 |
| `schedulers/` | 주기 실행 백그라운드 태스크(`asyncio.create_task` 루프) |
| `api/` | 의존성 주입(`deps.py`) + 저수준 라우트 조립 |
| `utils/` | 범용 헬퍼 (지표 계산 유틸, 캐시 매니저) |
| `scripts/` | 수동 실행용 CLI 스크립트 (백테스트 최적화, 크롤러, 일회성 마이그레이션 도구, `run_feature_significance.py` — `engine_decisions` 실측 forward return으로 DNA_Score/RSI/RVOL 예측력 검증) |
| `tests/` | 단위/통합 테스트 |
| `backtest_harness/` | 구버전(OLD) 퀀트 엔진과 현재(NEW) 로직을 동일 가격 데이터로 나란히 시뮬레이션하는 대조 하네스(`run_comparison.py`). 일봉 근사이므로 Time-Decay/EOD 등 분봉 전용 로직은 제외. `run_zero_slippage.py`(슬리피지 0% 순수 비교), `run_scale_out_experiment.py`(Scale-Out on/off·초기스탑 실험), `run_signal_quality_experiment.py`(numba/DNA 게이트 임계값 실험), `run_long_term_trail_experiment.py`(장기 보유 모드 고정 % 트레일 폭 스윕), `run_long_term_trail_atr_experiment.py`(고정 % vs ATR 적응형 트레일 비교 — 결론: ATR 적응형이 손실 확대·대박 의존도 증가로 전부 열세, 기각)가 이 위에서 시나리오별 사전검증을 수행 — 결과 JSON은 gitignore 처리되어 매 실행마다 재생성됨 |

### 진입점 (`app/main.py`)

FastAPI 앱 생성·라우터 include·시작/종료 시퀀스(`startup_event`/`shutdown_event`/`run_startup_sequence`)만 담당한다. 퀀트 로직 자체는 `core/`·`services/`·`market/`·`schedulers/`로 이관되어 있다.

| 클래스/함수 | 실제 위치 | 역할 |
|---|---|---|
| `ConnectionManager` | `core/websocket.py` | WebSocket 브로드캐스터 |
| `TickerDataState` | `services/market_data.py` | 1분봉 히스토리 유지 + Volume Multiplier(IEX→Full Market) 캘리브레이션 |
| `MTFCache` | `services/market_data.py` | 15분봉 20 EMA를 15분 주기로 캐싱 (MomentumValidator에 공급) |
| `MomentumValidator` | `services/market_data.py` | STRONG BUY 직전 RVOL·상위 추세 2중 검증 인터셉터 |
| `calculate_advanced_signals()` | `services/quant_engine.py` | RSI·MACD·ADX·RVOL → `DNA_Score`·`Strong_Buy` 컬럼 생성 |
| `calculate_dna_score()` | `services/quant_engine.py` | 스칼라 입력 → 0~100 DNA 점수 반환 (페니 스캔용) |
| `run_pulse_engine()` | `core/pulse.py` | 1분봉 → 지표·포지션 사이징·DNA 합성 → WebSocket payload |
| `run_quant_scan_internal()` | `core/quant_scanner.py` | 퀀트 스캔 핵심 — HTTP 엔드포인트·자동 스케줄러 양쪽에서 호출 |
| `on_minute_bar_closed()` | `market/alpaca_stream.py` | Alpaca 1분봉 콜백: HOLD 포지션은 경량 모니터 경로, 미보유는 전체 DNA 경로 분기 |
| `start_alpaca_stream()` | `market/alpaca_stream.py` | Alpaca WebSocket IEX 스트림 기동 (인증 실패·connection limit 시 REST 폴링 폴백) |
| `stream_scheduler()` | `schedulers/tasks.py` | 개장/폐장 감지해 스트림 자동 시작/종료 |
| `mtf_cache_scheduler()` | `schedulers/tasks.py` | 15분봉 EMA 캐시 갱신 (15분 주기) |
| `auto_quant_scan_scheduler()` | `schedulers/tasks.py` | 서버 기동 30초 후 즉시 + 이후 `SCAN_INTERVAL_SECONDS`(30분) 주기 자동 퀀트 스캔 |
| `auto_paper_history_cleanup_scheduler()` | `schedulers/tasks.py` | `paper_history` 90일 초과 행 매일 1회 삭제 |
| `stream_liveness_watchdog()` | `schedulers/tasks.py` | 무응답 스트림 감지 시 강제 재연결 (`_stop_current_stream()` 완료 대기 후 재기동) |
| `system_heartbeat()` | `schedulers/tasks.py` | 주기적 Discord Dead Man's Switch |
| `_spawn_watchdog_if_not_running()` | `schedulers/tasks.py` | `app/watchdog.py`를 별도 프로세스로 기동 (PID 파일로 중복 방지) |

### 라우터 (`python_engine/routers/`)

| 파일 | 역할 |
|---|---|
| `analyze.py` | `POST /api/analyze` — DNA 분석 |
| `broker.py` | paper 계좌·포지션·수동 매도·ARM 토글 |
| `penny.py` | `POST /api/penny/scan` |
| `pulse.py` | `GET /api/pulse/status` |
| `strategy.py` | `GET /api/strategy/stats` + `stats_cache` 공유 |
| `settings.py` | 전략 파라미터 조회/수정 |
| `checklist.py` | 통합 준비도 — `GET /api/checklist/unified`(데이터 신뢰도 + 전략 개선 검증 + LIVE 전환 게이트) + `POST /api/checklist/{item_key}/toggle` |
| `edge.py`, `parts.py`, `portfolio.py` | 기타 분석·포트폴리오 |

### 공유 전역 상태 (`app/state.py`)

모든 라우터와 `app/main.py`가 `from app.state import app_state`로 참조한다. `AppState` 단일 인스턴스에 Supabase 클라이언트, PaperEngine, Alpaca TradingClient, Webhook, ConnectionManager, TickerDataState, MTFCache, `SYSTEM_ARMED` 플래그, `_held_tickers` Set 등이 집약된다.

### 기타 핵심 모듈

| 모듈 | 역할 |
|---|---|
| `engine/paper_engine.py` | Paper trading 상태 머신 (매수/Scale-Out/TS/청산) |
| `engine/live_engine.py` | LIVE 모드 실주문 제출·체결 확인 |
| `engine/portfolio_backtester.py` | Walk-Forward Analysis DNA 백테스터 |
| `infra/db_manager.py` | Supabase 클라이언트 팩토리 + `get_active_tickers()`/`get_watchlist_tickers()` |
| `infra/webhook_manager.py` | Discord Webhook 발송 |
| `services/kelly_sizer.py` | 종목별 Kelly 기준 포지션 사이징 |
| `scripts/optimize_dna.py` | γ·δ·λ 그리드 서치 최적화 |
| `app/watchdog.py` | 외부 watchdog 프로세스 (PID 파일로 중복 방지, `app/main.py`와 별도 서브프로세스로 기동) |

---

## 퀀트 스캐너

### 두 가지 스캐너

| 스캐너 | 위치 | 실행 주기 |
|---|---|---|
| **Edge Function 스캐너** | `supabase/functions/run-quant-scanner/index.ts` | 수동 또는 스케줄 |
| **Pulse Engine 스캐너** | `python_engine/core/pulse.py → run_pulse_engine()` | Alpaca 1분봉 실시간 |
| **Penny 스캐너** (레거시 명칭, 실제로는 $1~$50 스캐너) | `python_engine/core/quant_scanner.py → run_quant_scan_internal()` | 자동(30분, `SCAN_INTERVAL_SECONDS`) + 수동(POST /api/penny/scan) |

### DNA 점수 기준

```
Tier-1 (STRONG BUY) → DNA ≥ 80          $1~$50 종목
Tier-2 (BUY)        → DNA ≥ 75 + RVOL > 1.5  $1~$50 종목
Tier-Penny (STRONG BUY) → DNA ≥ 65      (2026-07-28부로 신규 스캔 대상 아님 — 레거시 포지션 청산 로직에만 잔존)
HOLD 시그널  → DNA 60
SELL 시그널  → DNA 40
```

### STRONG BUY 조건 (`calculate_advanced_signals()` in `services/quant_engine.py`)

```python
Strong_Buy = (
    DNA_Score >= (80 | 75 | 65)  # Tier-1 / Tier-2 / Penny thresholds
    AND RSI < 70                 # 과매수 방지
    AND Numba OR Conditions      # Is_Golden/Adx/Macd_Diff_Rise 등에 의한 점수 획득
)
```

### MomentumValidator 인터셉터 (`services/market_data.py`)

STRONG BUY 신호가 생성된 후, `market/alpaca_stream.py`의 `on_minute_bar_closed()` 내부에서 두 가지를 추가 검증한다:

1. **RVOL < 1.5** → 차단 (거래량 부족)
2. **현재가 < 15분봉 20 EMA** (`MTFCache`) → 차단 (상위 추세 하락) ※ DNA ≥ 80이면 스킵

MTF 캐시 미존재 시 검증을 스킵하고 진입 허용한다.

### 1분봉 경로 분기 (`on_minute_bar_closed()`)

HOLD 포지션(`app_state._held_tickers`)은 경량 경로: RSI-14·ATR-14만 계산하고 `process_signal()`에 직접 전달. 미보유 종목은 전체 `run_pulse_engine()` 경로(DNA·포지션 사이징·WebSocket broadcast).

---

## Paper Trading 엔진 (`python_engine/engine/paper_engine.py`)

### 포지션 사이징 상수

```python
MIN_BUY_BUDGET = 100.0  # 최소 주문 금액 (초소형 파편화 거래 방지, 2026-07-30 이전 $10에서 상향)
MAX_BUY_BUDGET = 1000.0 # 종목당 최대 매수 금액 ($1,000, 2026-07-30 $5,000에서 하향)
MAX_CONCURRENT_POSITIONS = 20  # 동시 보유 최대 종목 수 (실질 도달 가능한 상한)
MAX_CONCENTRATION_PCT = 0.75   # 총 자산 대비 투입 비중 상한 (20종목 × $1k = $20k = $100k 계좌의 20% — 75% 상한과는 이제 수학적으로 무관, 실제 체결 종목 수가 늘어도 75% 캡이 먼저 걸릴 일은 거의 없음)
TS_INIT_PCT    = 0.90   # 일반: 초기 TS -10%
TS_TRAIL_PCT   = 0.95   # 일반: 최고가 추종 TS
REENTRY_COOLDOWN_MINUTES = 15  # 청산 후 재진입 금지 시간
ENFORCE_PDT_SAFEGUARD = False  # PDT Rule = 마진 계좌 $25k 미만 전용, $100k 가상 계좌에 미적용
```

### 페니($1 이하) 포지션 관리 레거시 제거 (2026-07-30)

`paper_engine.py`에 있던 페니 전용 상수(`PENNY_MAX_PRICE`/`PENNY_TS_INIT_PCT`/`PENNY_TS_TRAIL_PCT`/
`PENNY_BREAKEVEN_TRIGGER`/`PENNY_SCALE_OUT_RSI`/`PENNY_SCALE_OUT_PROFIT`/`PENNY_TIGHT_TS_PCT`/
`CHANDELIER_K_PENNY`/`SLIPPAGE_*_PENNY`/`self.penny_dna_gate`)와 `is_penny`/`is_penny_signal`
분기 전체를 삭제했다. 2026-07-28부로 스캐너가 $1 이하 종목을 신규 스캔·watchlist 등록
대상에서 제외한 뒤로 이 경로가 도달 불가능해졌고(paper_positions 전수 확인 결과 진입가
$1 이하 보유 포지션 0건), 살아있는 코드로 남겨둘 이유가 없었다. `_apply_slippage()`/
`_compute_entry_stop_pct()`/`_compute_locked_floor()`/`update_reversible_trailing_stop()`
모두 `is_penny` 파라미터가 제거되고 항상 "일반" 값(TS_INIT_PCT/CHANDELIER_K_NORMAL/
SLIPPAGE_*_NORMAL/NORMAL_BREAKEVEN_TRIGGER)만 사용한다. `PENNY_MAX_PRICE`는
`LONG_TERM_MIN_PRICE`(=1.0)로 이름만 남아 장기 보유 모드의 하한 경계로만 쓰인다.
`live_engine.py`의 저가 종목 체결 폴링 연장(`PENNY_FILL_POLL_TIMEOUT_SEC`)도 같은 이유로
제거되어 항상 `FILL_POLL_TIMEOUT_SEC`(5초)를 쓴다. `checklist.py`의 `penny_gate_80` 개선
항목은 감사 기록(IMPROVEMENT_ADOPTED/baseline)으로만 남기고 롤백 액션(`ROLLBACK_ACTIONABLE_ITEMS`)
에서는 제외했다 — 되돌릴 `self.penny_dna_gate` 자체가 더 이상 존재하지 않기 때문. 이력이
남아있는 `backtest_harness/run_comparison.py`(9e52902 이전 OLD 전략 재현용 대조 하네스)는
예외적으로 페니 상수·`is_penny` 분기를 자체 로컬 정의로 보존한다 — production 코드 삭제와
무관하게 과거 전략의 재현 결과가 그대로 나와야 하기 때문.

### 장기 보유 모드 전용 상수 (`paper_engine.py` 상단, 2026-07-28)

```python
LONG_TERM_MIN_PRICE    = 1.0   # 이 값(구 PENNY_MAX_PRICE) 이하는 스캐너가 애초에 걸러내 도달 불가
LONG_TERM_MAX_PRICE    = 50.0  # 진입가가 이 값 이하이면 장기 보유 파라미터 자동 전환
LONG_TERM_TS_TRAIL_PCT = 0.95  # 최고가 추종 TS -5% (진입 시점부터 동일 폭 — ATR/브레이크이븐락인 없음)
```

`is_long_term` 판정: `entry_price <= LONG_TERM_MAX_PRICE` (진입가 기준, 매 호출 시 계산). 진입은 기존 DNA 게이트(75)로 완전 자동, 매도는 최고가 대비 -5% 트레일링 스탑 단 하나만 자동이고 그 외 자동 청산(Scale-Out/Time-Decay/EOD 강제청산)은 전부 스킵 — 사용자가 기존 수동 매도(청산) 버튼으로 익절 시점을 직접 결정하는 것이 의도된 설계. 새 매수 버튼은 없음(기존 자동매수 그대로). **2026-07-30부터 수동 매도가 부분 매도도 지원** — 대시보드 포지션 카드의 "50%" 버튼(또는 `POST /api/broker/paper/sell {ticker, percentage}`)으로 일부만 정리하고 나머지는 계속 보유 가능. 부분 매도는 `ts_threshold`를 조정하지 않으므로 남은 물량의 -5% 트레일링 스탑은 그대로 유지된다. **2026-07-28부로 스캐너(`core/quant_scanner.py`)가 $1 이하·$50 초과 종목을 아예 스캔·watchlist 등록 대상에서 제외**하므로, 신규 진입은 사실상 전부 이 장기 보유 모드로만 발생한다 — $50 초과 진입가에 적용되는 일반(ATR 트레일링) 경로는 그 이전에 이미 매수된 레거시 포지션이 청산될 때까지만 코드에 남아있는 하위호환 경로다.

### Scale-Out 조건 (`process_signal()`)

```python
scale_trigger = (rsi > 52 and profit_pct >= 0.05) or profit_pct >= 0.07
```

### Paper Engine 상태머신 로직 (process_signal)

매 1분봉 데이터가 들어올 때마다 다음 순서로 검증한다:
1. **신규 진입**: 현재 포지션이 없고, 보유 중인 종목 수가 20개(MAX_CONCURRENT_POSITIONS) 미만이며, 투입 자본이 계좌의 75%(MAX_CONCENTRATION_PCT) 미만일 때 진입. DNA≥75 필요 (quant_engine.py의 tier2 기준과 정합). 포지션 수·집중도·예산 산정·진입 클레임 INSERT는 `_entry_lock`으로 직렬화되어 서로 다른 티커의 동시 신호가 상한을 초과해 진입하는 경합을 막는다.
2. **Time-Decay Exit**: Scale-Out 미완료 포지션 한정. 60분 경과 & 수익률 ±2% 이내(횡보)면 청산. 오버나이트 홀딩은 당일 09:30 ET 기준으로 경과 시간 리셋. **장기 보유 모드(`is_long_term`)는 스킵**.
3. **EOD 청산**: 15:30 ET 기준 수익률이 +5% 이하면 강제 청산 (오버나잇 리스크 헷지). **장기 보유 모드는 스킵** — 오버나이트/장기 홀딩이 의도된 동작.
4. **TS 업데이트**: 최고가 갱신 시 `Highest - k×ATR` 또는 고정 % 방식으로 스탑 상향. **장기 보유 모드는 `highest_price × LONG_TERM_TS_TRAIL_PCT`(-5%) 고정 트레일링만 사용** — ATR·브레이크이븐 락인 없음.
5. **Scale-Out 발동**: 1차 조건 도달 시 보유 수량의 50% 매도 후 3분간 TS 발동 쿨다운. **장기 보유 모드는 스킵** — 자동 익절 없이 전량 보유, 사용자가 수동 매도로 직접 결정.
6. **TS 청산**: 현재가가 `ts_threshold` 밑으로 내려가면 잔여 물량 전량 청산. 장기 보유 모드에서도 이 단계는 그대로 적용되는 유일한 자동 매도 경로.

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

**페니 스캔 수동 트리거 버튼은 UI에 존재하지 않는다.** `POST /api/penny/scan`은 서버 기동 30초 후 및 이후 `SCAN_INTERVAL_SECONDS`(30분, `core/quant_scanner.py`) 주기로 `auto_quant_scan_scheduler()`(`schedulers/tasks.py`)가 자동 호출한다. 과거 프론트엔드에 있던 `pennyService.ts`의 `scanPennyStocks()` 수동 트리거 함수는 어디서도 호출되지 않고 존재하지 않는 라우트(`/api/penny/scan` vs 실제 프리픽스 `/api/quant`)를 가리키는 죽은 코드였으므로 삭제됨 (2026-07-08).

### CommandSettings (NexGuard Control 패널) 실제 구성

`src/components/dashboard/CommandSettings.tsx` — 헤더 "설정" 버튼으로 여는 슬라이드 패널. 다음 2가지만 실제로 동작한다:
- **ARM/DISARM 토글**: `POST /api/broker/arm` → `state.py`의 `app_state.SYSTEM_ARMED` 즉시 반영, `paper_engine.py`가 매 시그널마다 참조
- **Discord Webhook URL 입력 + Test 버튼**: `POST /api/settings/webhook`, `/api/settings/webhook/test` → `app_state.webhook` 즉시 반영 (재시작 불필요)

과거 있었던 "DNA Score Threshold" 슬라이더와 "FLUSH CACHE" 버튼은 삭제됨 (2026-07-08) — 둘 다 DB 컬럼(`alert_threshold`)이나 테이블(`backtest_cache`)에 쓰기는 했지만 백엔드 어디서도 그 값을 읽지 않는 죽은 UI였다. 실제 DNA 매수 게이트(`paper_engine.py`의 `dna_gate=55/70`, `quant_engine.py`의 tier 80/75/65 임계값)는 여전히 하드코딩된 모듈 상수이며, 설정 패널을 통해 조정할 수 없다. 이 상수들을 UI에서 조정 가능하게 하려면 `system_settings`에 실제 컬럼을 추가하고 백엔드가 런타임에 읽도록 리팩터링해야 한다.

과거 설정 드로어의 `CommandSettings` 바로 아래에 있던 `BacktestPanel.tsx`("DNA 전략 백테스트" UI, `POST /api/backtest/run` 호출)는 라이브 매매 전략과 무관한 죽은 기능으로 판단되어 프론트엔드 컴포넌트·`pythonApiService.ts`의 `runBacktest()`/`fetchBacktestData()`·백엔드 `routers/backtest.py`(`/api/backtest/*` 엔드포인트, `DNAValidator` 호출부) 전부 삭제됨 (2026-08-07). `engine/portfolio_backtester.py` 자체는 `scripts/optimize_dna.py`·`routers/edge.py`(`run_edge_monitor`)·`backtest_harness/`·`services/kelly_sizer.py`에서 여전히 사용 중이라 삭제하지 않았다.

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
| `/api/broker/paper/sell` | POST | 수동 청산 `{ticker, percentage?}` — `percentage` 생략 시 100(전량). 100 미만이면 `PaperTradingManager.manual_partial_sell()`로 분기해 해당 비중만 매도하고 나머지는 포지션(HOLD) 그대로 유지, `ts_threshold`는 건드리지 않음 (2026-07-30) |
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
| `/api/checklist/unified` | GET | 통합 준비도 — 데이터 신뢰도·전략 개선 검증·LIVE 게이트 3그룹을 단일 item 스키마로 반환 (2026-08-08 통합) |
| `/api/checklist/{item_key}/toggle` | POST | 수동 체크리스트 항목 토글 (자동 판정 항목은 403) |
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

`python_engine/app/state.py` → `app_state.SYSTEM_ARMED`. `False`이면 스캐닝은 하되 매수 실행 없음. 트레일링 스탑 청산은 ARMED 해제 상태에서도 실행됨(손실 확대 방지 우선).

```
POST /api/broker/arm { "arm": true }   # 자동 매매 활성화
POST /api/broker/arm { "arm": false }  # 관제 전용
```

---

## 새 기능 추가 가이드

### FastAPI 엔드포인트 추가
`python_engine/routers/` 아래에 라우터 파일 작성 후 `app/main.py`에 `app.include_router()`. Pydantic `BaseModel`로 요청 스키마 정의, `api_key: str = Security(get_api_key)` 인증 패턴 사용.

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
SUPABASE_KEY                  # ⚠️ 현재 실제 값은 anon 키다 (2026-08-08 JWT 디코드로 확인).
                              # 문서상 "service role key (RLS 우회)"로 적혀 있었으나 사실과 달랐음 —
                              # RLS를 우회하지 못하므로 테이블 정책에 없는 작업은 실패한다.
                              # 예: engine_decisions는 읽기·삽입 정책만 있어 DELETE가 조용히 무시된다
                              # (엔진은 삽입만 하므로 현재 동작에는 영향 없음).
                              # 관리자 권한이 필요한 작업은 `supabase db query --linked`로 수행한다.
SUPABASE_SERVICE_ROLE_KEY     # 현재 .env에 없음 (미설정)
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

## 통합 준비도 화면 (2026-08-08)

`ReportsPage.tsx`의 "전략 개선 검증 트래커"(`ImprovementTracker.tsx`)와 "실계좌 전환 체크리스트"(`LiveTransitionChecklist.tsx`) 두 패널을 **`UnifiedReadinessPanel.tsx` 하나로 통합**했다. 두 컴포넌트와 각각의 조회 엔드포인트(`GET /api/checklist`, `GET /api/checklist/improvements`), 프론트 서비스 함수(`fetchChecklist`/`fetchImprovementStatus`)·타입(`ChecklistItem`/`ImprovementItem` 등)은 전부 삭제됐다. 판정 계산 함수 `compute_improvement_status()`는 `evaluate_improvement_rollback()` 스케줄러와 통합 엔드포인트가 공유하므로 그대로 남아있다.

통합의 이유는 화면 정리가 아니라 **교차 질문에 답할 수 없던 구조** 때문이다 — "개선이 REGRESSED인데 게이트는 왜 그대로인가", "표본이 부족한데 판정은 왜 났는가"를 두 화면을 번갈아 봐서는 알 수 없었다.

### 세 그룹 구조

| 그룹 | 내용 | 상태 값 |
|---|---|---|
| `data_quality` | 라벨 무결성 · 독립 관측일수 · 신규 관찰 축 적재 | VERIFIED / COLLECTING / REGRESSED |
| `improvements` | 기존 개선 검증 트래커 항목 (판정 로직 변경 없음) | VERIFIED / ON_TRACK / COLLECTING / REGRESSED |
| `live_gate` | 기존 실계좌 전환 체크리스트 10항목 | PASSED / BLOCKED |

### 데이터 신뢰도 그룹이 새로 드러내는 것

2026-08-08 재분석에서 기존 화면이 **판정의 근거를 실제보다 강해 보이게** 하고 있었음이 확인됐다:

1. **라벨 오염** — `forward_return_logger` 측정 버그(2026-08-04 수정)로 30분·60분 창이 같은 값으로 채워진 행이 8/3 이전 구간에 70~100% 존재한다. 백필로도 복구되지 않아 그 구간 라벨은 사실상 전량 폐기 대상인데, 기존 트래커는 이 행들을 정상 표본으로 세고 있었다. 현재 화면은 수정일 이후 오염률(실측 3.3%)과 전 기간 누적 오염률(15.8%)을 분리해 표시한다.
2. **독립 관측일수** — 같은 날 신호들은 같은 시장에 노출돼 서로 독립 표본이 아니다. 겉보기 1,722행이 실제로는 **4거래일**이었고, 일자 클러스터로 재검정하니 유의해 보이던 관계(MIDDAY×UPTREND 초과수익 +1.04%)가 t=1.67·3일 중 1일 음수로 무너졌다. `TARGET_INDEPENDENT_DAYS=20`에 미달하면 화면 상단에 "아래 판정은 모두 잠정치" 경고 배너가 뜬다.

독립 거래일 계산은 `MIN_CLEAN_ROWS_PER_DAY=20` 이상 정상 라벨이 쌓인 날만 1일로 인정한다 — 오염 구간에 한두 건씩 섞인 정상 행까지 세면 유효 표본이 과대 계상된다.

### `engine_decisions_daily_quality` 뷰

데이터 품질 집계는 **행 단위 조회가 아니라 일자별 집계 뷰**로 계산한다. PostgREST가 요청 limit과 무관하게 1,000행 상한을 걸기 때문에(2026-08-07 알파 팩터 0건 버그와 같은 원인), 하루 500~900행이 쌓이는 현재 속도에서는 최신 1,000행이 2일치도 못 덮어 "독립 거래일 20일" 같은 목표가 구조적으로 도달 불가능했다. 뷰는 한 달치도 30행이라 상한과 무관하다. `security_invoker=true`로 생성해 RLS를 우회하지 않는다.

### 시간대 · 시장 레짐 관찰 축 (관찰 전용)

`engine_decisions`에 `time_bucket`·`market_regime` 두 컬럼을 추가했다.

- `time_bucket`: `utils/utils.py`의 `et_time_bucket()`이 ET 기준으로 분류 — `OPEN`(9:30-10:00) / `MORNING`(~11:30) / `MIDDAY`(~14:00) / `AFTERNOON`(~15:30) / `CLOSE`(~16:00) / `EXTENDED`(정규장 밖·휴장일)
- `market_regime`: `MTFCache.update_market_regime()`이 SPY 15분봉 종가 > 15분봉 20 EMA면 `UPTREND` — MomentumValidator가 개별 종목에 쓰는 상위 추세 판정을 지수에 그대로 적용한 정의다. `mtf_cache_scheduler`가 확장 거래시간에도 15분마다 갱신하고(1요청), 캐시가 45분 넘게 낡으면 `None`을 반환해 컬럼이 NULL로 남는다.

두 값은 `_log_decision()` 내부에서 직접 산출한다 — 호출 경로(전체 DNA 경로 / HOLD 경량 경로 / 스위퍼)마다 인자로 넘기면 경로별 누락이 생기기 때문.

**이 두 축은 매매 게이트에 일절 반영하지 않는다.** 4거래일치 데이터로 로직을 바꾸는 것은 `rsi_falling_knife_fix`(도입 3일 만에 REGRESSED 자동 롤백)와 동일한 실패 패턴이라, 판정 가능한 최소 표본(≥20거래일)을 모으는 것이 유일한 목적이다.

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
| `run_comparison.py`/`run_zero_slippage.py` 일봉 백테스트에서 NEW 로직이 15개 종목 전체 0건 거래로 나와 "numba 과최적화 때문"으로 오판할 뻔함 | `backtest_harness/run_comparison.py` | `quant_engine.calculate_advanced_signals()`의 RVOL 공식(`Volume / (avg_daily_volume/390)`)은 1분봉 전용이라 `avg_daily_volume`을 안 넘기면 `RVOL`이 항상 1.0으로 고정됨(services/quant_engine.py:124-128) — 하네스의 `prep_signals()`가 이 인자를 넘기지 않아 `tier1`(RVOL>1.0)·`tier2`(RVOL>1.5)·`numba_strong_buy`(rvol_rank≥0.95) 게이트가 전부 원천 봉쇄됨. 라이브 경로(`core/pulse.py`·`routers/pulse.py`)는 `app_state.candle_state.avg_daily_volume`을 실제로 주입하므로 이 버그의 영향을 받지 않음 — 하네스 전용 데이터 결함이었음 | `_fix_daily_rvol()` 추가 — 일봉에 맞는 상대거래량(`Volume / 20일 평균`)으로 RVOL·rvol_rank를 재계산 후 `_recompute_strong_buy()`로 Strong_Buy 재산출 (2026-07-21) |
| 위 수정 직후 백테스트 거래 수가 50→10건으로 다시 줄어 이번엔 "Scale-Out 폐기가 필요하다"는 결론으로 오판할 뻔함 | `backtest_harness/run_comparison.py` | `try_enter()`가 KellySizer 호출 시 `self.closed_trades`(포트폴리오 전체, 티커 무관)를 그대로 넘김 — 라이브 `paper_engine.py`가 2026-07-15에 이미 종목 단위로 스코프한 켈리 회로차단기 버그(위 "Kelly 회로차단기가 계좌 전체 최근 거래로 판단" 항목)가 하네스에는 반영되지 않아 재발. PF<1인 백테스트에서 표본이 10건을 넘는 순간 계좌 전체 EV가 음수로 굳어 `raw_kelly=0.0`(← `None`이 아니라서 0.05 폴백을 안 탐) → `budget=0`으로 이후 모든 신규 진입이 영구 차단됨 | `closed_trades`에 `ticker` 필드를 추가하고 `try_enter()`에서 `[t for t in self.closed_trades if t["ticker"]==ticker]`로 스코프 축소. 수정 후 44종목·2018~2024·213건 기준 OLD PF 0.82, NEW PF 0.65~0.81(Scale-Out on/off·게이트 완화 모두 시도) — 청산/게이트 조정만으로는 PF>1.0 미확인, DNA_Score 자체의 예측력 검증이 필요하다는 결론(`scripts/run_feature_significance.py` 참고) (2026-07-21) |
| 일반 종목은 페니와 달리 수익 락인이 없어 Trailing Stop이 고점 근처 ATR 되돌림만으로 청산돼 수익이 +5% 미만(때로는 거의 0%)까지 반납됨 | `engine/paper_engine.py` | `_compute_locked_floor()`가 `PENNY_BREAKEVEN_TRIGGER`(+10%) 락인을 페니 종목에만 적용 — 일반 종목은 `adaptive_stop = highest - k_t*ATR`만으로 트레일링돼, 고점이 +3~4%에 불과했다면 ATR만큼 되돌아간 시점의 잔여 수익이 그대로 실현됨(실사례: OTLY +3.03%, ONDS +0.61%, 둘 다 Trailing Stop 청산) | `NORMAL_BREAKEVEN_TRIGGER = 1.05` 추가, `_compute_locked_floor()`가 페니/일반 공통으로 `breakeven_trigger` 도달 시 본전 락인하도록 통합 (2026-07-24) |
| Trailing Stop이 실제로는 브로커 스탑 주문이 아니라 1분봉 폴링 임계값이라, 저유동성/페니 종목이 봉 사이에 갭다운하면 손실이 명목 상한(-10%/-15%)을 훌쩍 넘겨 체결됨(실사례: SLGB -30.19%, INUV -17.36%, KG -14.26%, CHAI -22.37%, 전부 Trailing Stop 청산) | `engine/paper_engine.py` + `engine/live_engine.py` | `if price < ts_threshold: close_position(pos, price, ...)`가 `ts_threshold`가 아닌 관측된 `price`로 그대로 체결 — 브로커에 리밋/스탑 주문이 없어 폴링 사이 갭을 흡수할 방법이 없었음. PAPER 전용 "Hard Stop 방어" 시뮬레이션 보정(`not self.IS_LIVE` 게이트)이 있었지만 이는 사후에 기록만 보정하는 것이라 LIVE에 확장하면 실제 손실은 그대로 두고 장부만 왜곡시킴 — 부적절한 해법으로 기각 | Alpaca 브로커 사이드 Stop-Market 주문을 실제 방어선으로 도입: (1) `LiveTradingManager.ensure_broker_stop()` 신규 — 매수 체결 직후 `entry_stop_pct` 기반 초기 스탑가로 등록, 멱등(이미 원하는 스탑가·수량이면 API 호출 없이 반환)이라 `position_ts_sweeper`가 10초마다 호출해 DAY TIF 만료·Scale-Out 취소·서버 재시작으로 사라진 스탑을 자동 재등록. (2) `_close_position(external_fill=...)` 추가 — 브로커 스탑이 엔진 모르게 체결되면 `paper_history`/현금이 영영 반영 안 되는 구조적 공백이 있었는데, Trade Update 스트림이 `_own_order_ids`(엔진이 직접 낸 주문)에 없는 SELL 체결을 감지해 이 경로로 회계 반영. (3) Stop-Market은 트리거 시 시장가로 전환되므로 리밋 주문 방식과 달리 CLOSING 고착(2026-07-22 CHAI 사고 패턴) 위험이 구조적으로 없음 — 이 이유로 리밋 주문 기반 손실 상한 방식은 채택하지 않음. Bracket/OCO 주문도 스탑 다리가 전체 수량을 락해 Scale-Out 50% 부분매도와 구조적으로 충돌해 기각 (2026-07-24) |
| 매수 부분체결 잔여 물량이 DB에 안 잡혀 TS 감시 없는 유령 보유가 됨 — 청산 후에도 Alpaca에 초과분이 영구 방치(실사례: GSUN 8,606주 체결 중 5,992주만 기록, 잔여 2,614주가 -49.9%까지 무방비 하락. FFUT/OTLY/VHC도 동일 패턴) | `engine/live_engine.py` | `_FILLED_STATUSES`에 `PARTIALLY_FILLED`가 포함되어 체결 확인 폴링이 부분체결 시점에 종료 — 그 순간의 `filled_qty`를 최종 수량으로 DB에 기록하고, 이후 마저 체결된 잔여분은 어떤 경로도 추적하지 않음. 전량 청산 시에도 DB `units`만큼만 매도해 초과 실보유가 남고, 행 삭제 후에는 TS 스위퍼 감시 대상에서도 제외됨 | (1) `_FILLED_STATUSES`에서 `PARTIALLY_FILLED` 제거 — FILLED만 종결로 인정, 타임아웃 시 잔여분 취소 후 취소 확정 시점의 실제 `filled_qty`만 반환(0이면 실패 처리). (2) `_submit_alpaca_order()`에 `close_all` 파라미터 추가 — Scale-Out 외 모든 매도(전량 청산)는 Alpaca 실보유가 DB 수량보다 많으면 실보유 전체로 올려 잡아 미추적 잔여분까지 함께 청산. 기존 유령 보유 4건은 paper_positions 백필로 엔진 관리 복원 (2026-07-25) |
| 개선 검증 트래커의 "Forward Return 로거" 항목이 실제 독립 표본보다 훨씬 많은 표본을 수집한 것으로 오판정(VERIFIED)해 신뢰도를 과장 표시 | `routers/checklist.py` | `compute_improvement_status()`가 `engine_decisions` 원본 행을 그대로 세어 표본 수를 산정 — 같은 종목이 짧은 간격으로 반복 게이트 차단되면(예: GSUN 크래시 중 `COOLDOWN_ACTIVE`가 15:15~15:42 사이 10회 연속 기록) 하나의 시장 사건이 여러 행으로 중복 집계됨. 127건(원본)이 실제로는 독립 종목 13개뿐이었는데도 목표(100건) 초과로 VERIFIED 판정되고 DNA≥80 평균 30m 수익률(-9.32%)도 이 중복에 왜곡됨 | `_dedup_signal_episodes()` 추가 — 같은 티커가 15분 이내 재등장하면 같은 사건으로 묶어 최초 행만 표본으로 인정. 적용 후 127행→48건(독립 사건)으로 정정되어 상태가 VERIFIED→COLLECTING으로 바뀜. "원본 로그 행수(중복 포함)" 메트릭을 별도로 남겨 두 숫자를 함께 확인 가능하게 함 (2026-07-27) |
| Risk Analytics 패널이 phantom position 사고 소급 기록 행을 실제 거래로 집계 | `routers/broker.py` | `get_paper_history()`(`/api/broker/paper/history`)가 `paper_history`를 필터 없이 반환 — `routers/strategy.py`·`routers/checklist.py`는 이미 "Manual Sell (Backfilled" 행을 제외하는데 이 엔드포인트만 누락되어 있었음. 이 엔드포인트가 `RiskAnalyticsPanel`(Win/Loss Ratio·Avg Win/Loss·MDD 폴백)과 대시보드 승률·거래건수 표시의 데이터 원천이라, 부분체결 유령 보유 소급 기록 4건(CHAI/MED/SLGB/INUV)이 실거래처럼 집계됨(현재는 n=200 중 4건이라 승률 영향 0.11%p로 미미하나, 같은 사고 재발 시 왜곡 확대 가능) | `strategy.py`/`checklist.py`와 동일하게 `Manual Sell (Backfilled`로 시작하는 행 제외 필터 추가 (2026-07-27) |
| 개선 검증 트래커의 목표 진행률(n_ts/n_penny/n_ext/n_pullback)이 포지션 승률(pos_wr) 계산과 다른 기준(원본 청산 행수)을 사용 | `routers/checklist.py` | `_calc_metrics_expectancy()`는 Scale-Out 이중 집계 방지를 위해 ticker+진입가로 포지션 그룹핑해 `pos_wr`을 계산하지만, 호출부의 `n_ts`/`n_penny`/`n_ext`/`n_pullback`은 `len(sub_trades)`(원본 청산 행수)를 그대로 써서 서로 다른 분모를 사용. 부분체결 유령 보유 사고(2026-07-25) 복구로 SLGB/MED/CHAI가 같은 진입가로 청산 행 2개씩 남은 잔재 때문에 atr_stop/extension_guard_tighten 항목의 표시 건수가 실제 포지션 수보다 많게 나옴(예: extension_guard_tighten 16건 표시 vs 실제 13포지션) | `_calc_metrics_expectancy()`가 포지션 그룹 수(`pos_trades`)도 함께 반환하도록 변경, 4개 항목 모두 이 값을 목표 진행률에 사용하도록 통일. 원본 행수와 다를 때만 "원본 청산 행수" 메트릭을 별도 표시. 판정 결과(REGRESSED/COLLECTING) 자체는 이번엔 안 바뀜 — 표본이 여전히 5건 이상이라 임계값 통과 여부는 동일 (2026-07-27) |
| 프리마켓/애프터마켓에 TS 감시 경로가 전무해 갭다운이 무방비로 방치됨(실사례: GSUN, TS $0.3958 대비 현재가 $0.1828까지 프리마켓에서 폭락하는 동안 09:30 정규장 재개 전까지 청산 시도 자체가 없었음) | `schedulers/tasks.py` + `utils/utils.py` | `position_ts_sweeper()`가 1분봉 공백 사각지대를 메우려고 2026-07-17에 추가된 10초 안전망인데(RAYA 사고 대응), 정작 게이트가 정규장 전용 `is_market_hours()`(평일 09:30~16:00 ET)라 가장 위험한 프리마켓/애프터마켓 자체가 커버 대상에서 빠져있었음. 1분봉 스트림도 `stream_scheduler()`가 장마감 시 완전히 끊어 정규장에만 도는 건 동일 | `utils.py`에 `is_extended_market_hours()`(평일 04:00~20:00 ET) 신규 추가, `position_ts_sweeper()`의 게이트를 `is_market_hours()`→`is_extended_market_hours()`로 교체. CLOSING 고착 복구 로직은 같은 루프 안에서 자동으로 확장 시간대까지 커버됨 — 단, EOD 강제청산(`is_eod`)은 게이트 확장에 편승해 15:30~20:00 ET 전체로 같이 넓어지면 애프터마켓 저유동성 가격에 강제 체결되는 부작용이 있어 `dtime(15,30) <= now_et.time() < dtime(16,0)`로 원래 30분 창을 명시적으로 유지(코드 리뷰에서 발견해 즉시 수정). 심야(20:00~04:00 ET)는 Alpaca 체결 데이터가 희박해 여전히 미커버 — LIVE 모드 브로커 사이드 Stop-Market(`ensure_broker_stop`)도 Alpaca `clock.is_open` 기준이라 정규장 외엔 등록되지 않아(`extended_hours` 미설정) 별개 과제로 남음 (2026-07-28) |
| 저유동성 종목의 전량 청산 시장가 주문이 부분체결(요청 수량 일부만 체결 후 잔여분 타임아웃 취소)되면, 실제로는 일부만 팔렸는데도 시스템이 "전체 포지션 청산 완료"로 기록해 미판매 잔여분이 DB 어디에도 안 잡히는 유령 보유가 됨(실사례: GSUN 2026-07-27, 2,614주 청산 시도 중 극심한 유동성 고갈로 5회 연속 시장가 주문 0주 체결·취소, 마지막 시도에서 373주(14%)만 체결됐는데 `paper_history`엔 전량 청산으로 기록되고 `paper_positions` 행이 삭제됨. 잔여 2,241주가 이틀 가까이(7/27~7/29) TS 감시 대상에서 완전히 이탈해 방치되다 사용자가 Alpaca 대시보드에서 직접 발견해 수동 매도) | `engine/paper_engine.py` | `_close_position()`이 항상 "요청 수량 = 실제 판매 수량"을 가정하고 `_on_order_sell()`(LIVE 모드는 `_submit_alpaca_order`)이 반환한 실체결 수량을 그대로 "전체 청산"으로 처리 — 부분체결이어도 `paper_positions`를 무조건 DELETE. 매수(BUY) 쪽엔 이미 동일 패턴의 phantom 방지 로직이 있었으나(2026-07-25, `_FILLED_STATUSES`에서 `PARTIALLY_FILLED` 제거) 매도(SELL) 쪽엔 대칭 방어가 없었음 | 청산 요청 수량(`requested_units`) 대비 실체결 수량이 1% 넘게 부족하면(`is_partial_close`) `paper_history`엔 실체결분만 `(부분체결 X/Y주)` 표시로 기록하고, `paper_positions`는 삭제 대신 `units`를 잔여분으로 정정해 원래 상태(HOLD)로 유지 — 다음 `position_ts_sweeper` 사이클이 잔여 물량을 계속 청산 시도하도록 함. 정상 예외처리 재시도 경로(cash 반영 후 history/positions 갱신 실패 시 1회 재시도)도 동일하게 분기 처리. Discord에 부분체결 사실과 잔여 수량을 별도 알림 (2026-07-29) |
| 2026-07-28 스캐너 변경으로 진입가 $1 이하 신규 진입이 완전히 불가능해졌는데도 `paper_engine.py`에 페니 전용 상태머신(진입 게이트·TS·슬리피지·Scale-Out·Chandelier·눌림목 되돌림폭)이 그대로 남아있어, 코드를 처음 보는 사람이 "페니 전략이 아직 살아있다"고 오인하거나 실수로 그 죽은 분기에 새 로직을 얹을 위험이 있었음 | `engine/paper_engine.py` + `live_engine.py` + `schedulers/tasks.py` + `routers/checklist.py` + `engine/portfolio_backtester.py` + 프론트엔드(`TensionGauge.tsx`) | 진입가 $1 이하 오픈 포지션이 0건임을 DB로 확인 후에도 `PENNY_MAX_PRICE`/`PENNY_TS_*`/`penny_dna_gate` 등 관련 상수·`is_penny`/`is_penny_signal` 분기가 계속 유지되고 있었음 — "이전에 매수된 레거시 포지션의 청산 로직 유지 목적"이라는 주석과 달리 실제로 지킬 레거시 포지션이 이미 사라진 상태였음 | 페니 전용 상태머신 전체 삭제(항상 "일반" 값만 사용), `PENNY_MAX_PRICE`→`LONG_TERM_MIN_PRICE`로 개명해 장기 보유 모드 하한 경계로만 재사용. `live_engine.py`의 `PENNY_FILL_POLL_TIMEOUT_SEC`, `checklist.py`의 `penny_gate_80` 롤백 액션(감사 기록은 유지)도 함께 제거. `TensionGauge.tsx`의 페니 전용 DNA 80 게이트 표시(실제로는 이미 75 단일 게이트)도 제거. `backtest_harness/run_comparison.py`(9e52902 이전 OLD 전략 재현 하네스)만 예외적으로 로컬 상수로 페니 파라미터 보존 (2026-07-30) |
| 저유동성 종목(ZNB)이 TS(-5%) 아래로 실제 하락했는데도 PAPER 모드 포지션이 청산되지 않음 — 사용자가 대시보드 밖 실제 시세로 -6.56% 손실을 확인했는데 시스템은 -2%대로 표시, TS 미발동 | `schedulers/tasks.py` (`position_ts_sweeper`) | 원인은 로직 버그가 아니라 데이터 피드 공백이었음 — Alpaca `StockLatestTradeRequest`가 기본으로 쓰는 `DataFeed.IEX`는 전체 미국 주식 거래량의 2~3%만 처리하는 단일 거래소라, ZNB처럼 거래량이 희박한 종목은 체결이 몇 분씩 끊긴다. 실측: yfinance(전 거래소 통합 시세)는 09:59 ET에 $2.28(TS $2.318 하회)까지 하락한 걸 보여줬지만, 같은 시간 Alpaca IEX 1분봉은 13:50~14:01 UTC 구간이 통째로 비어 있었고 가격이 반등한 뒤인 13:50 체결가($2.39)만 스위퍼에 남아 TS 이탈이 감지되지 않음 | `position_ts_sweeper()`에 IEX 체결 정체 감지 추가 — 최신 체결(`trade.timestamp`)이 `STALE_TRADE_THRESHOLD_SEC`(120초)보다 오래됐으면 `yf.Ticker(ticker).fast_info["lastPrice"]`(통합 시세)를 보조 조회해 IEX가와 비교, 더 낮은 쪽을 TS 판정·`current_price` 갱신에 채택. yfinance도 완전한 실시간은 아니므로 100% 보장은 아니며, 이 한계는 LIVE 모드에서는 `ensure_broker_stop()`(브로커 사이드 실제 Stop-Market)이 이미 커버해 영향 없음 — PAPER 전용 보완책 (2026-07-30) |
| 장기 보유 모드 트레일링 스탑을 종목 변동성에 맞춰 자동으로 넓히면(ATR 적응형) ISOU 같은 "정상 노이즈에 조기 청산"되는 사례를 줄일 수 있을 거라는 가설을 세웠으나 백테스트에서 기각됨 | `backtest_harness/run_comparison.py` + `run_long_term_trail_atr_experiment.py` | ISOU가 당일 고점($9.76) 대비 -3% 트레일(장기 보유 모드 고정값)에 걸려 진입가 대비 +2.37%에 청산된 실사례를 계기로 `highest_price - k*ATR`(Chandelier 스타일, 라쳇) 옵션을 하네스에 추가해 k=1.5~3.0을 현재 라이브 값(-3% 고정)과 비교. 결과: k값 전부 PF가 -3% 고정(2.586)보다 낮았고(최고 k=3.0도 1.931), 평균 손실폭도 -2.6%→최대 -7.1%로 악화. "상위 5건 제외 PF"도 ATR 변형 쪽이 전부 1.0 근처거나 미만으로 나와(고정 -3%는 1.891) 소수 대박 거래 의존도가 오히려 더 커짐 — 넓은 스탑이 손절을 늦춰서 손실만 키우는 효과가 승자를 더 태우는 효과를 상회함 | 라이브 코드 변경 없음(현행 고정 -3% 유지). 일봉 ATR(14일) 기반 실험이라 ISOU 사례 같은 분 단위 일중 변동을 완벽히 재현하진 못한다는 한계는 있으나, 방향성이 뚜렷이 반대로 나와 이 방향 튜닝은 보류. 대안으로 "스탑 폭 대신 포지션 크기를 종목 변동성에 반비례시키는" volatility-targeting 방식이 다음 검토 후보로 남음 (2026-08-04) |
| DNA_Score의 RSI 컴포넌트가 일반 종목에 한해 "과매도=반등 매수 기회"로 채점해, 실측 데이터가 가리키는 방향과 반대로 점수를 매기고 있었음 | `services/quant_engine.py` | `calculate_advanced_signals()`의 `normal_rsi`(일반 종목)는 RSI<30~55 구간을 최대 +20점까지 보상하는 평균회귀 가정을 썼던 반면, `penny_rsi`(페니)는 RSI<45를 -20점("떨어지는 칼날 방지")으로 이미 반대로 채점하고 있어 종목군마다 RSI 해석이 모순됐음. `forward_return_logger` 실측 76건(2026-08-01) 분석에서 RSI가 `forward_return_30m`과 유의한 음의 상관(r=-0.229, p=0.047)으로 나와, 일반 종목도 과매도가 저가 매수 기회가 아니라 낙폭 방어가 필요한 신호에 더 가깝다는 게 확인됨. 같은 표본에서 DNA_Score 전체도 유의한 음의 상관(r=-0.292, p=0.011)이었고, `numba_strong_buy`(DNA와 별개로 Strong_Buy를 발생시킬 수 있는 경로)는 2026-07-18 이후 151건의 Strong_Buy 이벤트 중 단 한 번도 DNA<75로 독립 발화한 적이 없어(전량 tier1/tier2와 겹침) "DNA tier 경로를 끄고 numba만 남긴다"는 대안은 신호 자체가 0건이 될 위험이 커 기각 | `calculate_advanced_signals()`의 `normal_rsi`/`penny_rsi` 이원 채점을 `penny_rsi`와 동일한 낙폭방어형 단일 로직으로 통일(`calculate_dna_score()` 스칼라 버전도 동일하게 수정). 44종목·2018~2024 일봉 백테스트에선 PF 0.785→0.801로 뚜렷한 개선은 없었으나(수정 근거가 30m/60m 분봉 실측이라 일봉 백테스트와 타임프레임 불일치, CLAUDE.md 상단 backtest_harness 설명 참고), 지금이 3개월 페이퍼 검증 기간(2026-07-08~)이라 실거래 리스크가 없어 바로 배포 — `routers/checklist.py`의 `IMPROVEMENT_ADOPTED`에 `rsi_falling_knife_fix`(2026-08-01) 등록해 기존 승률/기대값 자동 추적·판정 체계로 흡수. 되돌릴 런타임 토글이 없어(atr_stop 등과 달리 엔진 인스턴스 속성이 아니라 스코어링 산식 자체 변경) `ROLLBACK_ACTIONABLE_ITEMS`에서는 제외 — 회귀 확인 시 git revert 필요 |
| VCP 스퀴즈+RVOL 돌파 섀도우 팩터(`gate="VCP_SQUEEZE_SHADOW"`, 2026-07-30 도입)가 7일간 `engine_decisions`에 단 한 번도 기록을 남기지 못함 — 판독할 표본 자체가 존재하지 않았음 | `services/quant_engine.py` (`compute_squeeze_signal`) + `core/quant_scanner.py` | 스캔 유니버스(Alpaca `most_actives`/`movers`·달러볼륨 상위)와 VCP 팩터(자체 과거 ATR/MA20 분포 하위 20% = 변동성 "수축" 상태)가 정반대 성질을 요구하는 구조적 모순 — 스캐너가 뽑는 종목은 정의상 "방금 크게 움직인" 종목이라 ATR이 이미 부풀어 있음. 현재 스캔 유니버스 80종목 실측 결과 `squeeze_percentile` 최솟값이 0.35(임계값 0.20에 근접도 못 함), 관측 분포 전체가 median 0.69로 압축과 반대 방향에 몰려 있어 임계값 조정으로 해결 불가능함을 확인(2026-08-06) | 살아있는 코드로 남겨둘 이유가 없어 `compute_squeeze_signal()`·`VCP_SQUEEZE_PERCENTILE_MAX`/`VCP_SQUEEZE_MIN_SAMPLES`/`VCP_BREAKOUT_RVOL_MIN`·`quant_scanner.py`의 섀도우 로깅 블록 전체 삭제. VCP 자체를 되살리려면 스캔 후보 산출과 무관한 별도의 압축 스크리닝 경로가 필요하다는 결론만 남기고 그 경로는 구현하지 않음 (2026-08-06) |
| TS(트레일링 스탑) 이탈이 정확히 감지되고 매도 주문도 계속 재시도됐는데, 개장 직후 체결 지연 구간과 겹쳐 9분 가까이 청산이 안 되고 손실이 더 커짐(실사례 2026-08-06: FIG -17.20%·ELAN -9.19%로 청산, TS 이탈가 대비 각각 훨씬 낮은 가격에 체결) | `engine/live_engine.py` (`_submit_alpaca_order`) | `position_ts_sweeper`가 10초마다 `_close_position()`을 재시도하는데, 매도 주문 제출 직전 그 티커의 기존 미체결 주문을 무조건 취소하고, 5초 폴링 타임아웃 시에도 무조건 취소하는 구조였음 — 시장가 주문은 취소·재제출한다고 더 나은 가격/속도를 받는 게 아닌데도 매 사이클 취소→재제출을 반복해, "취소 확인~다음 재시도" 사이 수십 초씩 해당 종목에 매도 주문이 아예 없는 무방비 공백이 반복 발생. 개장 직후처럼 Alpaca 페이퍼 체결이 5초보다 오래 걸리는 구간에서는 이 공백이 누적돼 청산이 계속 미뤄짐(같은 시간대 CNH/VOYG/PRSO/FCNCN 등 타 종목도 동일 지연 패턴 확인 — Alpaca 자체 체결 지연이지 이 종목들만의 문제는 아니었음) | `STALE_OPEN_ORDER_SEC=60.0` 도입 — 매도 주문 제출 전 해당 티커에 60초 이내 제출된 신선한 매도 주문이 이미 떠 있으면 취소하지 않고 그 주문을 그대로 이어받아 폴링. 5초 폴링 타임아웃 시에도 원 주문 제출 후 60초가 안 지났으면 취소하지 않고 `None` 반환(`last_order_fail_reason="PENDING_FRESH"`) — 다음 사이클이 같은 주문을 이어받아 계속 대기. 60초 넘게 안 풀린 진짜 고착 주문만 취소 대상으로 남김. LIMIT(눌림목 확인 매수)·BUY 주문은 기존 동작(타임아웃 즉시 취소) 그대로 유지 (2026-08-06) |
| "$1 이하 페니는 스캔·watchlist 등록 대상에서 완전히 제외"라는 2026-07-28 정책에도 불구하고 sub-$1 종목이 실제로 매수됨(실사례 2026-08-05: PRSO $0.70에 473주 체결) | `core/quant_scanner.py` (`run_quant_scan_internal`) | 가격 검증이 서로 다른 두 소스로 이원화돼 있었음 — 1차 후보 필터는 Alpaca 스냅샷 `daily_bar.close`로 `SCAN_MIN_PRICE(1.0)~50` 범위를 확인하지만, 이후 DNA 채점 단계는 yfinance 일봉 `Close`로 가격을 다시 계산하면서 이 값에 대해서는 범위 재검증이 전혀 없었음. PRSO처럼 하루 체결이 4~5건뿐인 초저유동성 종목은 두 소스의 가격이 어긋날 수 있어(Alpaca 스냅샷은 통과, yfinance 실가는 $0.70) 1차 필터를 우회. 게다가 2026-07-28 이전 구 페니 스캐너의 잔재 코드(`is_penny_item = price <= 1.0` 분기)가 그대로 남아있어, 이 sub-$1 가격을 오히려 "penny 종목"으로 인식해 DNA≥80이면 STRONG BUY로 라벨링하고 watchlist 등록까지 통과시켰음(PRSO DNA 84.5) | `is_penny_item` 분기 완전 삭제 — 이제 모든 종목을 동일한 정상가 기준으로만 채점. watchlist 등록 직전 DNA 점수와 무관하게 yfinance 가격 기준 하드 게이트(`SCAN_MIN_PRICE < price <= max_price`)를 추가해, 두 가격 소스가 어긋나도 최종 등록 단계에서 반드시 걸러지도록 이중 방어. 아무 데서도 더 이상 쓰이지 않던 구 페니 상수 6개(`PENNY_TS_INIT_PCT`/`PENNY_BREAKEVEN_TRIGGER`/`PENNY_SCALE_OUT_RSI`/`PENNY_SCALE_OUT_PROFIT`/`PENNY_SCALE_OUT_RATIO`/`PENNY_TIGHT_TS_PCT`/`PENNY_RVOL_MIN`)도 함께 삭제. 사고 당시 이미 매수된 PRSO 포지션 자체는 되돌리지 않고 기존 TS($0.679)에 청산을 맡기기로 함 (2026-08-06) |
| 개선 검증 트래커의 신규 알파 팩터 3개(평균회귀/모멘텀/변동성 돌파)가 2026-08-05 도입 이후 이틀 넘게 표본이 계속 0건으로 표시됨 — 실제로는 engine_decisions에 z_score_20/ma20_deviation_pct/breakout_deviation_pct가 매 신호마다 정상적으로 기록되고 있었음(실측 24시간 1,065건) | `routers/checklist.py` (`compute_improvement_status`) | `engine_decisions` 조회 쿼리가 `.order("ts", desc=False).limit(2000)`로 오름차순 정렬 후 앞쪽 N행만 가져왔는데, PostgREST가 `limit(2000)` 요청도 서버 설정상 1000행으로 상한을 걸어 실제로는 항상 "penny_gate_80 도입일(2026-07-17) 이후 가장 오래된 1,000행"만 반환됨 — 테이블이 계속 자라 총 4,193건이 쌓인 시점엔 이 1,000행의 최신 경계가 2026-08-04까지밖에 못 갔고, 8/5 도입된 알파 팩터 3개는 이 윈도우에 단 한 번도 포함될 수 없어 영구히 0건으로 고정됐음. forward_return_logger는 채택일(7/18)이 이 윈도우 안에 들어 있어 우연히 영향을 받지 않았음 | 정렬을 `.order("ts", desc=True)`로 변경해 항상 최신 1,000행이 반환되도록 수정 — 테이블이 계속 자라도 신규 도입 항목이 데이터 창밖으로 밀려나지 않는다. 수정 후 실데이터로 재계산 시 세 알파 팩터 모두 표본 257~461건으로 즉시 채워짐 확인 (2026-08-07) |
| 개선 검증 트래커의 자동 롤백 킬스위치가 개선 로직의 품질이 아니라 포지션 사이징 레짐을 측정하고 있었고, 그 위에 절대 0 기준까지 겹쳐 있어 정상 개선(RSI 낙폭방어)이 도입 3일 만에 자동 롤백됨 | `routers/checklist.py` (`_calc_metrics_expectancy`/`_verify_status`/`compute_improvement_status`) | (1) 킬스위치가 `profit_amt`(달러) 합산 Expectancy($E)를 썼는데, `paper_history` 276건 전수 분석 결과 포지션 $3,000+ 구간(88건) 승률이 3.4%·합계 -$11,332로 계좌 총손실(-$11,024)의 103%를 차지 — 승리 거래 평균 포지션 $1,123 vs 패배 거래 $2,412로 "이기는 거래에 작게, 지는 거래에 크게" 걸고 있었다(2026-07-30 MAX_BUY_BUDGET $5,000→$1,000 하향 전후로 승률은 20.0%로 동일한데 거래당 손익만 -$47.5→-$10.4로 개선된 게 직접 증거). $E가 채택일과 완벽히 단조 정렬(atr_stop 7/18 -31.52→...→watchlist_expansion 8/4 +2.54)됐던 것도 이 교란 때문. (2) `expectancy <= 0` 절대 기준은 전략 전체 기준 %E가 이미 음수(-3.00%, 7/30 이전 178포지션)인 상황에서 어떤 개선을 넣어도 무조건 걸리는 조건이었음 — rsi_falling_knife_fix가 채택 전 -3.05%→활성 중 -1.10%로 뚜렷이 개선됐는데도 "-1.10%<=0"에 걸려 3일 만에 자동 롤백됨. (3) "채택 후 전체"를 성과 모집단으로 삼아, 이미 자동 롤백으로 꺼진 뒤의 거래까지 그 개선의 실적으로 오집계 — atr_stop은 7/18 채택→7/23 롤백(활성 7건)인데 종전 계산은 7/18 이후 62포지션 전부(대부분 비활성 기간, 7/30 예산수정 이후 다수 포함)를 실적으로 잡아 REGRESSED를 VERIFIED로 뒤집을 뻔했음 | `_calc_metrics_expectancy()`를 `pnl_pct` 기반 투입원금 대비 수익률(%E, 포지션≥10건이면 5~95백분위 윈저화)로 교체, 참고용으로 구 $E도 별도 표시. `_verify_status()`의 절대 0 기준을 `expectancy_baseline`(채택 전 같은 모집단 %E) 대비로 교체. 성과 모집단을 `_active_window()`로 교체해 항목별 최초 자동 롤백 시각(`improvement_rollback_log.action_taken=True`) 이후 거래를 제외. 재계산 결과 atr_stop/extension_guard_tighten/pullback_entry/whipsaw_fix 4건은 REGRESSED 재확인(활성 표본이 3~9건으로 너무 얕아 판단 근거 자체가 부족했을 뿐 오판정은 아니었음), rsi_falling_knife_fix만 ON_TRACK으로 정정 — `system_settings.rsi_mean_reversion_mode`를 False로 되돌려 복원(Railway 재배포 시 반영). 이 수정과 별개로 `scripts/run_feature_significance.py`(n=1,914, 2026-08-01 이후)로 재확인한 DNA_Score의 forward_return_30m 상관은 r=-0.008·p=0.713으로 여전히 무상관 — 사이징·킬스위치를 고쳐도 진입 신호 자체의 예측력 부재는 근본 원인으로 남아있음 (2026-08-08) |

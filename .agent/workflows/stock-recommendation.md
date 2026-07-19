---
description: 오늘의 추천 종목 생성 워크플로우 (Quant Hybrid Pipeline)
---

# 🧬 퀀트 하이브리드 추천 종목 워크플로우

## 개요

MuzeBIZ.Lab의 "오늘의 추천 종목"은 단순한 기술적 지표를 넘어, **파이썬 퀀트
엔진의 자동 백테스팅(Simulation)**을 통해 검증된 종목만을 선별합니다.

---

## 1단계: 전략별 종목 발굴 (Discovery)

**파일**: `python_engine/scraper.py`

1. 파이썬 엔진이 매일 정해진 전략(예: RSI 과매도, 골든크로스 등)에 맞는 종목을
   전 세계 시장에서 사냥합니다.
2. 수집 대상: 가격, 등락률, 거래량 등 기본 데이터 수집.

---

## 2단계: 자동 시뮬레이션 검증 (Verify)

**함수**: `scraper.py` 내 `run_backtest_for_ticker`

1. 발굴된 모든 종목에 대해 즉시 **과거 1년 RSI 전략 백테스트**를 실행합니다.
2. 결과 데이터: `backtest_return` (전략 수익률), `benchmark_return` (시장
   수익률).
3. 검증 기준: 전략 수익률이 시장 수익률(Buy & Hold)을 상회하는지 확인.

---

## 3단계: 데이터베이스 저장 및 랭킹 (Rank)

**테이블**: `daily_discovery` (Supabase)

1. 검증된 수익률 데이터를 포함하여 DB에 저장합니다.
2. 프론트엔드에서는 `sort_by=performance` 파라미터를 통해 **수익률이 높은
   순서**대로 정렬합니다.

---

## 4단계: 최종 검증 및 관리 (Pipeline)

1. **Discovery**: 사용자가 실시간 수익률 순위 확인.
2. **Simulation**: 사용자가 직접 타임머신 시뮬레이터를 통해 디테일한 차트 및 RSI
   지표 재확인.
3. **Watchlist**: 검증 완료된 종목을 최종 리스트에 등록하고 투자
   단계(관찰/보유/종료) 관리.

---

## 데이터 흐름도

```
[Python Engine] ─(발굴)→ [Target Stocks]
       ↓
[Auto Simulator] ─(1Y Backtest)→ [Performance Data]
       ↓
[Supabase DB] ─(API)→ [UI: Discovery Dashboard]
       ↓
[User Action] ─(Manual Simulation)→ [Watchlist Management]
```

---

## 관련 파일

- `python_engine/scripts/scraper.py`: 수집 및 자동 검증 엔진
- `python_engine/app/main.py`: 백테스트 및 데이터 제공 API
- `src/services/pythonApiService.ts`: 프론트엔드 API 연동
- `src/components/dashboard/DailyDiscoveries.tsx`: 추천 종목 대시보드 UI

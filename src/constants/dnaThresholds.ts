/**
 * DNA 점수 컷오프 — 백엔드 python_engine/services/quant_engine.py의
 * calculate_advanced_signals() tier1/tier2/tier_penny 및
 * python_engine/engine/paper_engine.py의 dna_gate와 정합시킨 단일 소스.
 * 프론트엔드 표시(뱃지·색상·추천 문구)는 전부 이 상수를 참조해야 하며,
 * 매직 넘버로 별도 컷오프를 두지 않는다.
 */

// 일반 종목(가격 > $1) STRONG BUY — quant_engine.py tier1
export const DNA_STRONG_BUY = 80;

// 일반 종목 BUY(2차 매수 조건) — quant_engine.py tier2
export const DNA_BUY = 75;

// 페니 종목(가격 ≤ $1) STRONG BUY — quant_engine.py tier_penny / paper_engine.py dna_gate(penny)
export const DNA_PENNY_STRONG_BUY = 65;

// STRONG SELL — quant_engine.py Strong_Sell
export const DNA_SELL = 40;

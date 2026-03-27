/**
 * DisplaySignal
 * UI에서 일관되게 사용할 수 있는 통합 시그널 인터페이스
 */
export interface DisplaySignal {
  ticker: string;
  dnaScore: number;
  bullPoints: string[];
  bearPoints: string[];
  reasoning: string;
  tags: string[];
  price?: number;
  changePercent?: number;
  rsi?: number;
  strength?: 'STRONG' | 'NORMAL';
  status?: string;
  rrRatio?: number;
  targetPrice?: number;
  stopPrice?: number;
}

/**
 * processSignal
 * 다양한 데이터 형식을 DisplaySignal 포맷으로 변환하는 통합 프로세서
 */
export const processSignal = (data: any): DisplaySignal => {
  // 1. WebSocket PulseData 형식 (ai_metadata 또는 ai_report 존재 시)
  if (data.ai_metadata || data.ai_report) {
    return {
      ticker: data.ticker,
      dnaScore: data.ai_metadata?.dna_score || 50,
      bullPoints: data.ai_metadata?.bull_case ? [data.ai_metadata.bull_case] : ["데이터 분석 중..."],
      bearPoints: data.ai_metadata?.bear_case ? [data.ai_metadata.bear_case] : ["데이터 분석 중..."],
      reasoning: data.ai_metadata?.reasoning_ko || data.ai_report || "상세 분석 내용이 없습니다.",
      tags: data.ai_metadata?.tags || [data.ticker, data.signal],
      price: data.price,
      rsi: data.rsi,
      strength: data.strength,
      status: data.signal
    };
  }

  // 2. DB Stock 형식 (ScannerPage 등에서 사용)
  if (data.dnaScore !== undefined) {
    const cache = data.stock_analysis_cache?.[0]?.analysis;
    const rawSummary = data.rawAiSummary || "";

    let bullPoints = ["No details available"];
    let bearPoints = ["No details available"];
    let reasoning = "해당 자산에 대한 최신 시장 Narrative를 분석 중입니다...";

    // JSON 형식 (신규 퀀트 엔진 결과)
    if (rawSummary && rawSummary.trim().startsWith('{')) {
      try {
        const quantData = JSON.parse(rawSummary);
        reasoning = "순수 퀀트(수학적) 알고리즘 분석 결과가 적용되었습니다.";
        bullPoints = [
          `이동평균선(20일) 이격도: ${quantData.ma20_distance_pct ?? 'N/A'}%`,
          `RSI (14일): ${quantData.rsi_14 ?? 'N/A'}`
        ];
        bearPoints = [
          `최근 20일 변동성: ${quantData.volatility_20d_pct ?? 'N/A'}%`,
          `거래량 급증 배수: ${quantData.volume_surge_multiplier ?? 'N/A'}x`
        ];
      } catch (e) {
        console.warn(`Failed to parse raw summary for ${data.ticker}:`, e);
      }
    } 
    // Cache 형식 (기존 분석 아카이브)
    else if (cache && Object.keys(cache).length > 0) {
      bullPoints = Array.isArray(cache.bullCase) ? cache.bullCase : [cache.bullCase || "N/A"];
      bearPoints = Array.isArray(cache.bearCase) ? cache.bearCase : [cache.bearCase || "N/A"];
      reasoning = cache.aiSummary || reasoning;
    } 
    // 문자열 파싱 (레거시 텍스트 포맷)
    else if (rawSummary) {
      const bullMatch = rawSummary.match(/🐂 Bull: (.*)/);
      const bearMatch = rawSummary.match(/🐻 Bear: (.*)/);
      const reasoningMatch = rawSummary.match(/💡\s*([\s\S]*)/); 

      if (bullMatch) bullPoints = [bullMatch[1]];
      if (bearMatch) bearPoints = [bearMatch[1]];
      if (reasoningMatch) reasoning = reasoningMatch[1].trim();
    }

    return {
      ticker: data.ticker,
      dnaScore: data.dnaScore,
      bullPoints,
      bearPoints,
      reasoning,
      tags: [data.sector || 'Unknown'],
      price: data.price,
      changePercent: data.changePercent,
      rrRatio: data.rrRatio,
      targetPrice: data.targetPrice,
      stopPrice: data.stopPrice
    };
  }

  // 3. 알 수 없는 형식 Fallback
  return {
    ticker: data.ticker || 'Unknown',
    dnaScore: 0,
    bullPoints: [],
    bearPoints: [],
    reasoning: "알 수 없는 데이터 형식입니다.",
    tags: []
  };
};

# 🚀 MuzeBIZ.Lab

AI 기반 페니 스탁(Penny Stock) 분석 플랫폼

## 주요 기능

- 🔍 **자동 종목 발굴**: Finviz 스크래핑으로 매일 아침 잠재력 있는 종목 발굴
- 🤖 **AI 심층 분석**: GPT-4o-mini + RAG로 역사적 패턴 기반 분석
- 📊 **DNA 스코어링**: 알고리즘 + AI 하이브리드 평가 시스템
- 📈 **백테스팅**: AI 예측 정확도 자동 검증

## 기술 스택

- **Frontend**: React + TypeScript + Vite + TailwindCSS
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL + pgvector
- **AI**: OpenAI GPT-4o-mini, text-embedding-3-small
- **APIs**: Alpha Vantage, Finnhub

## 시작하기

### 1. 환경 설정

```bash
cp .env.example .env.local
# .env.local 파일에 API 키 입력
```

### 2. 설치 및 실행

#### 전체 시스템 실행 (추천)
프론트엔드와 부품 검색용 Python 백엔드를 동시에 실행합니다:
```bash
npm run dev:all
```

#### 개별 실행
```bash
# 프론트엔드만 실행
npm run dev

# Python 백엔드만 실행
npm run dev:python
```

### 3. Supabase 설정

```bash
# Supabase CLI 설치
npm install -g supabase

# 프로젝트 연결
npx supabase link --project-ref drnxydtrsjumjksqmdgi
```

## 배포

```bash
./deploy.sh
```

## 워크플로우

1. **Discovery**: Finviz Hunter Bot이 발굴한 종목 확인
2. **Watchlist**: 관심 종목 추가 및 모니터링
3. **Analysis**: AI 심층 분석 및 투자 판단

## 프로젝트 구조

```
MuzeBIZ.Lab/
├── src/
│   ├── components/       # React 컴포넌트
│   │   ├── analysis/     # AI 분석 관련
│   │   ├── dashboard/    # 대시보드 뷰
│   │   ├── layout/       # 레이아웃 컴포넌트
│   │   └── ui/           # 재사용 UI 컴포넌트
│   ├── hooks/            # Custom React hooks
│   ├── services/         # API 서비스 레이어
│   ├── utils/            # 유틸리티 함수
│   └── types/            # TypeScript 타입 정의
├── supabase/
│   ├── functions/        # Edge Functions
│   │   ├── analyze-stock/
│   │   ├── get-stock-quote/
│   │   └── get-market-scanner/
│   └── migrations/       # 데이터베이스 마이그레이션
└── scripts/              # 자동화 스크립트
    └── finviz-hunter.ts  # 종목 발굴 봇
```

## 개발

### 로컬 개발 서버

```bash
npm run dev
```

### Edge Functions 로컬 테스트

```bash
npx supabase functions serve
```

### Finviz Hunter 수동 실행

```bash
SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx npx ts-node scripts/finviz-hunter.ts
```

## 환경 변수

필수 환경 변수는 `.env.example` 파일을 참고하세요.

## 라이선스

MIT

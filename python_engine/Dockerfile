# 베이스 이미지
FROM python:3.11-slim

# 시스템 의존성 설치 (Pandas, TA 빌드용)
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    wget \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리
WORKDIR /app

# 파이썬 환경 변수 설정
ENV PYTHONUNBUFFERED=1
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# 의존성 설치 및 Playwright Chromium 설치 (--with-deps로 OS 의존성 포함)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    playwright install --with-deps chromium

# 소스 코드 복사
COPY . .

EXPOSE 8080

# Railway injects $PORT at runtime; fall back to 8080 for local docker-compose
CMD sh -c "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"

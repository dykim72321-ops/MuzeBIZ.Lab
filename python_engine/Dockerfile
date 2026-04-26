# 베이스 이미지
FROM python:3.11-slim

# 시스템 의존성 설치 (Pandas, TA 빌드용)
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리
WORKDIR /app

# 파이썬 환경 변수 설정
ENV PYTHONUNBUFFERED=1

# 의존성 설치
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# 소스 코드 복사
COPY . .

EXPOSE 8080

CMD uvicorn main:app --host 0.0.0.0 --port 8080

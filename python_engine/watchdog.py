import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

ALPACA_API_KEY = os.getenv("APCA_API_KEY_ID") or os.getenv("ALPACA_API_KEY")
ALPACA_SECRET_KEY = os.getenv("APCA_API_SECRET_KEY") or os.getenv("ALPACA_SECRET_KEY")
ALPACA_BASE_URL = os.getenv("APCA_API_BASE_URL", "https://paper-api.alpaca.markets")
DISCORD_WEBHOOK_URL = os.getenv("DISCORD_WEBHOOK_URL")

# 생존 최우선: 일간 손실 -5% 도달 시 즉각 모든 포지션 강제 시장가 청산
MAX_DAILY_LOSS_PCT = -5.0


def send_alert(message: str):
    print(message)
    if DISCORD_WEBHOOK_URL:
        try:
            requests.post(DISCORD_WEBHOOK_URL, json={"content": message})
        except Exception as e:
            print("Webhook Error:", e)


def get_account():
    headers = {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }
    resp = requests.get(f"{ALPACA_BASE_URL}/v2/account", headers=headers)
    resp.raise_for_status()
    return resp.json()


def liquidate_all():
    headers = {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }
    # Alpaca API: DELETE /v2/positions (모든 포지션 강제 시장가 청산)
    resp = requests.delete(f"{ALPACA_BASE_URL}/v2/positions", headers=headers)
    resp.raise_for_status()
    return resp.json()


def cancel_all_orders():
    headers = {
        "APCA-API-KEY-ID": ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET_KEY,
    }
    resp = requests.delete(f"{ALPACA_BASE_URL}/v2/orders", headers=headers)
    resp.raise_for_status()
    return resp.json()


def run_watchdog():
    send_alert(
        f"🐕 [Watchdog] 생존 방어 봇 가동 완료. (Max Loss Trigger: {MAX_DAILY_LOSS_PCT}%)"
    )
    while True:
        try:
            acc = get_account()
            equity = float(acc["equity"])
            last_equity = float(acc["last_equity"])

            if last_equity > 0:
                daily_pnl_pct = (equity / last_equity - 1) * 100

                # 심장박동 로깅 (5분마다 터미널에만, 5 * 60 = 300초 / 60초 루프 = 5번)
                # 여기서는 단순히 감시 중임을 표시하지 않고 조용히 백그라운드 구동.

                if daily_pnl_pct <= MAX_DAILY_LOSS_PCT:
                    send_alert(
                        f"🚨 [FATAL ERROR] 엣지 붕괴 감지! 일간 손실 한도 초과 ({daily_pnl_pct:.2f}% <= {MAX_DAILY_LOSS_PCT}%)."
                    )
                    send_alert(
                        f"💀 [Watchdog] 모든 대기 주문 취소 및 전량 시장가 청산(Liquidate)을 즉시 집행합니다."
                    )

                    cancel_all_orders()
                    liquidate_all()

                    send_alert(
                        "🛡️ [Watchdog] 청산 완료. 계좌 깡통을 방어했습니다. 시장 안정화 및 파라미터 점검을 위해 24시간 셧다운 모드에 진입합니다."
                    )
                    time.sleep(86400)  # 24시간 정지 (다음 날까지 트레이딩 중지)

            # 60초 주기로 무한 반복 감시
            time.sleep(60)

        except requests.exceptions.RequestException as e:
            # 일시적인 네트워크 오류는 무시하고 계속 감시
            print(f"⚠️ [Watchdog Network Error] {e}")
            time.sleep(60)
        except Exception as e:
            print(f"⚠️ [Watchdog Unexpected Error] {e}")
            time.sleep(60)


if __name__ == "__main__":
    if not ALPACA_API_KEY or not ALPACA_SECRET_KEY:
        print("❌ Alpaca API 키가 설정되지 않아 Watchdog을 실행할 수 없습니다.")
    else:
        run_watchdog()

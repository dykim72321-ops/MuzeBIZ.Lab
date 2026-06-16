"""
webhook_manager.py — MuzeStock.Lab Discord 알림 시스템
Mean Reversion 전략 전용 Super Oversold 알림 & 일반 발굴 알림 포함
"""

import os
import aiohttp
from datetime import datetime


class WebhookManager:
    def __init__(self):
        self.webhook_url = os.getenv("DISCORD_WEBHOOK_URL", "")
        self.supabase = None
        self.has_warned = False

    def set_supabase_client(self, supabase_client) -> None:
        """Supabase 클라이언트를 연결하여 DB에서 webhook_url을 동적으로 조회 가능하게 함"""
        self.supabase = supabase_client
        # 클라이언트가 설정되면 경고 플래그 초기화
        self.has_warned = False

    async def _post(self, payload: dict) -> None:
        """내부 공통 Webhook 전송 헬퍼"""
        # webhook_url이 비어있고 supabase 클라이언트가 설정되어 있으면 DB에서 동적으로 로드 시도
        if not self.webhook_url and self.supabase:
            try:
                import asyncio
                res = await asyncio.to_thread(
                    self.supabase.table("system_settings").select("webhook_url").limit(1).execute
                )
                if res.data and res.data[0].get("webhook_url"):
                    self.webhook_url = res.data[0]["webhook_url"]
                    print("🔗 [Webhook] Dynamically loaded Discord Webhook URL from system_settings DB.")
            except Exception as db_err:
                if not self.has_warned:
                    print(f"⚠️ [Webhook] Failed to dynamic-load webhook from DB: {db_err}")

        if not self.webhook_url:
            if not self.has_warned:
                print("⚠️ DISCORD_WEBHOOK_URL이 설정되지 않았습니다. (알림 건너뜀 - 이후 알림 무시)")
                self.has_warned = True
            return
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(self.webhook_url, json=payload) as resp:
                    if resp.status not in (200, 204):
                        print(f"❌ Webhook Error {resp.status}: {await resp.text()}")
                    else:
                        print(f"📨 Discord 알림 전송 완료 (status: {resp.status})")
        except Exception as e:
            print(f"❌ Webhook 전송 실패: {e}")

    async def send_discovery_alert(
        self,
        ticker: str,
        price: float,
        rsi2: float,
        deviation_pct: float,
        rvol: float,
        target_price: float,
        stop_price: float,
        atr: float,
        is_super_oversold: bool = False,
    ) -> None:
        """
        개별 종목 발굴 알림
        - is_super_oversold=True  → 🚨 빨간 embed (RSI2<10 + RVOL>3.0)
        - is_super_oversold=False → 🟢 초록 embed (일반 낙폭과대 발굴)
        """
        # 슈퍼 낙폭과대: 빨간색 강조
        if is_super_oversold:
            color = 0xFF4444
            title = f"🚨 SUPER OVERSOLD — ${ticker}"
            description = (
                f"**RSI(2)={rsi2:.1f} + RVOL={rvol:.1f}x** 조건을 충족하는\n"
                f"초단기 스냅백 타겟이 발굴되었습니다.\n\n"
                f"> Mean Reversion 5.0 ATR 목표, 3일 Time Stop 적용"
            )
        else:
            color = 0x00B347
            title = f"📡 MEAN REVERSION — ${ticker}"
            description = (
                f"낙폭과대 후보 종목이 발굴되었습니다.\n"
                f"RSI(2)={rsi2:.1f} / 이격도={deviation_pct:.1f}%"
            )

        fields = [
            {
                "name": "💰 현재가",
                "value": f"`${price:.4f}`",
                "inline": True,
            },
            {
                "name": "🎯 목표가 (5.0 ATR)",
                "value": f"`${target_price:.4f}`",
                "inline": True,
            },
            {
                "name": "🛡️ 손절가",
                "value": f"`${stop_price:.4f}`",
                "inline": True,
            },
            {
                "name": "📉 RSI(2)",
                "value": f"`{rsi2:.1f}` {'🔴 극심한 과매도' if rsi2 < 5 else '🟡 과매도'}",
                "inline": True,
            },
            {
                "name": "📊 이격도 (MA5)",
                "value": f"`{deviation_pct:+.1f}%`",
                "inline": True,
            },
            {
                "name": "🔥 상대거래량 (RVOL)",
                "value": f"`{rvol:.1f}x` {'🚨 투매!' if rvol > 5 else ''}",
                "inline": True,
            },
            {
                "name": "📏 ATR(5)",
                "value": f"`${atr:.4f}`",
                "inline": True,
            },
            {
                "name": "📐 예상 수익률",
                "value": f"`+{((target_price - price) / price * 100):.1f}%`",
                "inline": True,
            },
        ]

        payload = {
            "embeds": [
                {
                    "title": title,
                    "description": description,
                    "color": color,
                    "fields": fields,
                    "thumbnail": {
                        "url": f"https://finviz.com/chart.ashx?t={ticker}&ty=c&ta=1&p=d"
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                    "footer": {
                        "text": "MuzeStock.Lab | Mean Reversion Engine v2.0",
                        "icon_url": "https://cdn.discordapp.com/emojis/🔬",
                    },
                }
            ]
        }

        await self._post(payload)

    async def send_daily_summary(
        self, discovered: int, validated: int, super_oversold: int
    ) -> None:
        """하루 스캔 종료 후 요약 알림"""
        color = 0x0176D3  # MuzeStock 브랜드 블루
        payload = {
            "embeds": [
                {
                    "title": "📋 일일 스캔 완료 — MuzeStock Hunter",
                    "description": "오늘의 Mean Reversion 자동 스캔이 완료되었습니다.",
                    "color": color,
                    "fields": [
                        {
                            "name": "🔭 총 발굴 후보",
                            "value": f"`{discovered}` 종목",
                            "inline": True,
                        },
                        {
                            "name": "✅ 퀀트 검증 통과",
                            "value": f"`{validated}` 종목",
                            "inline": True,
                        },
                        {
                            "name": "🚨 Super Oversold",
                            "value": f"`{super_oversold}` 종목",
                            "inline": True,
                        },
                    ],
                    "timestamp": datetime.utcnow().isoformat(),
                    "footer": {"text": "MuzeStock.Lab GitHub Actions Cron"},
                }
            ]
        }
        await self._post(payload)

    async def send_alert(
        self, title: str, description: str, color: int = 0x3498DB, fields: list = None
    ):
        """범용 알림 (하위 호환 유지)"""
        payload = {
            "embeds": [
                {
                    "title": title,
                    "description": description,
                    "color": color,
                    "timestamp": datetime.utcnow().isoformat(),
                    "footer": {"text": "MuzeStock.Lab Quant Engine"},
                }
            ]
        }
        if fields:
            payload["embeds"][0]["fields"] = fields
        await self._post(payload)

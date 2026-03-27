import React from 'react';
import {
    X, HelpCircle, LayoutDashboard, Search,
    Target, Zap, ArrowRight
} from 'lucide-react';
import { Card } from './Card';
import clsx from 'clsx';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const steps = [
        {
            title: '1. 핵심 시그널 포착 (Quant Pulse)',
            description: '[퀀트 펄스] 메뉴에서 "🚀 딥 헌팅 실행" 버튼을 누르세요. 시스템이 실시간으로 추세 하단 및 변동성 이상 종목을 스캔하고 강력 매수(STRONG BUY) 시그널을 찾아냅니다.',
            icon: Zap,
            color: 'text-indigo-400',
            bg: 'bg-indigo-500/10'
        },
        {
            title: '2. 종목 검증 및 보관 (Backtest & Watchlist)',
            description: '스캔된 유망 종목의 1년 수익률을 [백테스팅]에서 검증하거나, [관심 종목] 보드에 추가하여 실시간 가격 변동을 디테일하게 모니터링하세요.',
            icon: Target,
            color: 'text-sky-400',
            bg: 'bg-sky-500/10'
        },
        {
            title: '3. 가상 포트폴리오 운용 (Alpha Fund)',
            description: '[알파 펀드] 메뉴는 STRONG BUY 시그널에 따라 자동으로 매수/매도(부분 익절)를 진행하는 가상 매매 현황판입니다. 나의 자산 추이를 감시하세요.',
            icon: LayoutDashboard,
            color: 'text-emerald-400',
            bg: 'bg-emerald-500/10'
        },
        {
            title: '4. 시장 흐름 읽기 (Command & Scanner)',
            description: '[작전 지휘소]에서 거시적 시스템 상태를 요약해 보고, [마켓 스캐너]에서 과거 누적된 우량 퀀트 분석 데이터의 패턴을 확인하여 트레이딩 뷰를 넓히세요.',
            icon: Search,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10'
        }
    ];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <Card className="relative w-full max-w-2xl bg-slate-900 border-white/5 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 rounded-lg">
                            <HelpCircle className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">MuzeBIZ.Lab 터미널 가이드</h2>
                            <p className="text-xs text-slate-500 font-medium">실전 퀀트 시스템 핵심 활용 4단계 튜토리얼</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-white"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* 1. Quick Tutorial Steps */}
                    <div className="grid gap-4">
                        {steps.map((step, idx) => (
                            <div key={idx} className="group relative flex gap-4 p-4 rounded-xl bg-white/5 border border-transparent hover:border-white/10 transition-all">
                                <div className={clsx("shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", step.bg)}>
                                    <step.icon className={clsx("w-6 h-6", step.color)} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white mb-1">{step.title}</h3>
                                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                                        {step.description}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 2. Dashboard Glossary (NEW) */}
                    <div className="border-t border-white/5 pt-6">
                        <h3 className="text-sm font-black text-indigo-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                            <LayoutDashboard className="w-4 h-4" />
                            대시보드 지표 가이드 (Glossary)
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <p className="text-[10px] font-black text-white uppercase mb-1">Win Rate (승률)</p>
                                <p className="text-[10px] text-slate-400 font-medium leading-normal">
                                    전체 종료된 매매 중 수익으로 마감된 비율입니다. 50% 이상을 유지하는 것이 전략의 기본 목표입니다.
                                </p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <p className="text-[10px] font-black text-white uppercase mb-1">Profit Factor</p>
                                <p className="text-[10px] text-slate-400 font-medium leading-normal">
                                    총 이익을 총 손실로 나눈 값입니다. 1.5x 이상이면 매우 효율적인 전략으로 간주됩니다.
                                </p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <p className="text-[10px] font-black text-rose-400 uppercase mb-1">Drawdown (낙폭)</p>
                                <p className="text-[10px] text-slate-400 font-medium leading-normal">
                                    자산 최고점 대비 현재 하락률입니다. -10%를 넘지 않도록 리스크 슬라이더를 조절하세요.
                                </p>
                            </div>
                            <div className="bg-white/5 p-3 rounded-lg border border-white/5">
                                <p className="text-[10px] font-black text-amber-400 uppercase mb-1">Panic Liquidate</p>
                                <p className="text-[10px] text-slate-400 font-medium leading-normal">
                                    시장 급변 시 모든 포지션을 즉시 정리하는 마스터 킬스위치입니다. 위급 상황에서만 사용하세요.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-xl p-4 flex items-center gap-4">
                        <div className="p-2 bg-indigo-500/20 rounded-lg shrink-0">
                            <Zap className="w-5 h-5 text-indigo-400 animate-pulse" />
                        </div>
                        <div className="flex-1">
                            <p className="text-xs font-bold text-indigo-300">💡 핵심 활용 루틴</p>
                            <p className="text-[11px] text-slate-400 mt-1">
                            장 시작 시 [퀀트 펄스] 우상단의 **"🚀 딥 헌팅 실행"** 버튼을 눌러 스캔 루프를 동작시키는 것이 오퍼레이션의 시작입니다.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-800/50 border-t border-white/5 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all active:scale-95 flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                    >
                        시작하기
                        <ArrowRight className="w-4 h-4" />
                    </button>
                </div>
            </Card>
        </div>
    );
};

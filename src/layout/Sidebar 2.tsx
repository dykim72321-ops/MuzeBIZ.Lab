import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Search,
    Zap,
    History,
    List,
    Settings,
    Dna,
    LifeBuoy,
    Folder,
    Server,
    Briefcase,
    Users,
    KanbanSquare
} from 'lucide-react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface NavItem {
    name: string;
    icon: LucideIcon;
    path: string;
    isHot?: boolean;
}
import { motion, AnimatePresence } from 'framer-motion';
import { HelpModal } from '../components/ui/HelpModal';

// 1. 라우팅 데이터 구조 단순화 및 명확화
const NAVIGATION: { section: string; items: NavItem[] }[] = [
    {
        section: 'MAIN OPERATION',
        items: [
            { name: '작전 지휘소 (Command)', icon: LayoutDashboard, path: '/' },
            { name: '퀀트 펄스 (Live Feed)', icon: Zap, path: '/pulse', isHot: true },
            { name: '마켓 스캐너 (Scanner)', icon: Search, path: '/scanner' },
            { name: '부품 조회 (Parts)', icon: Server, path: '/parts-search' },
        ]
    },
    {
        section: 'ANALYSIS & FUND',
        items: [
            { name: '알파 펀드 (Alpha Fund)', icon: Folder, path: '/portfolio' },
            { name: '백테스팅 (Backtest)', icon: History, path: '/backtesting' },
        ]
    },
    {
        section: 'ASSETS',
        items: [
            { name: '관심 종목 (Watchlist)', icon: List, path: '/watchlist' },
        ]
    },
    {
        section: 'B2B INTELLIGENCE',
        items: [
            { name: 'CRM 허브 (Hub)', icon: Briefcase, path: '/crm' },
            { name: '고객/담당자 (Contacts)', icon: Users, path: '/crm/contacts' },
            { name: '프로젝트 파이프라인', icon: KanbanSquare, path: '/crm/projects' },
        ]
    },
    {
        section: 'SYSTEM',
        items: [
            { name: '환경 설정 (Settings)', icon: Settings, path: '/settings' },
        ]
    }
];

export const Sidebar = () => {
    const [isHelpOpen, setIsHelpOpen] = useState(false);

    return (
        <>
            <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: "circOut" }}
                // 글래스모피즘 베이스 레이어 최적화
                className="flex flex-col w-64 h-screen shrink-0 bg-[#020617]/60 backdrop-blur-2xl border-r border-slate-800/80 shadow-2xl z-50"
            >
                {/* Brand Header */}
                <div className="p-6 pb-8 border-b border-slate-800/50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="relative group flex items-center justify-center w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 shadow-inner overflow-hidden">
                            {/* 날카로운 네온 백라이트 효과 */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 to-cyan-400/20 group-hover:opacity-100 opacity-50 transition-opacity"></div>
                            <Dna className="w-6 h-6 text-blue-400 relative z-10" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black tracking-tighter text-slate-100">
                                MuzeStock<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">.Lab</span>
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 pl-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse"></span>
                        <p className="text-[10px] text-slate-400 font-mono font-bold tracking-widest">TERMINAL V3.0 LIVE</p>
                    </div>
                </div>

                {/* Navigation Menu */}
                <nav className="flex-1 px-4 py-6 space-y-8 overflow-y-auto no-scrollbar">
                    {NAVIGATION.map((group) => (
                        <div key={group.section}>
                            {/* Section Title */}
                            <h3 className="px-3 mb-3 text-[10px] font-black text-slate-500 uppercase tracking-widest border-l-2 border-blue-500/30">
                                {group.section}
                            </h3>

                            {/* Nav Items */}
                            <div className="space-y-1">
                                {group.items.map((item) => (
                                    <NavLink
                                        key={item.path}
                                        to={item.path}
                                        end={item.path === '/'}
                                        className={({ isActive }) => clsx(
                                            "relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 font-medium text-sm group overflow-hidden",
                                            isActive
                                                ? "text-blue-50"
                                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                                        )}
                                    >
                                        {({ isActive }) => (
                                            <>
                                                {/* 활성 상태 백그라운드 효과 (Border-left 인디케이터) */}
                                                <AnimatePresence>
                                                    {isActive && (
                                                        <motion.div
                                                            layoutId="sidebar-active-indicator"
                                                            className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-transparent border-l-2 border-blue-400 rounded-xl"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            exit={{ opacity: 0 }}
                                                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                                        />
                                                    )}
                                                </AnimatePresence>

                                                {/* Icon */}
                                                <item.icon className={clsx(
                                                    "w-5 h-5 relative z-10 transition-colors",
                                                    isActive ? "text-blue-400" : "text-slate-500 group-hover:text-slate-400"
                                                )} />

                                                {/* Label */}
                                                <span className={clsx(
                                                    "relative z-10 flex-1 text-[13px] font-semibold tracking-tight transition-colors",
                                                    isActive ? "text-slate-50" : "text-slate-400 group-hover:text-slate-200"
                                                )}>
                                                    {item.name}
                                                </span>

                                                {/* Hot Badge (알파 펀드 등 특정 항목 강조) */}
                                                {item.isHot && (
                                                    <div className="relative z-10 flex items-center justify-center w-2 h-2">
                                                        <span className="absolute w-full h-full rounded-full bg-orange-400 opacity-75 animate-ping"></span>
                                                        <span className="relative w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </NavLink>
                                ))}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Bottom Actions (Guide & Profile) */}
                <div className="p-4 mt-auto border-t border-slate-800/50 bg-slate-900/30">
                    <button
                        onClick={() => setIsHelpOpen(true)}
                        className="flex items-center gap-3 w-full px-3 py-2.5 mb-4 rounded-xl text-slate-400 hover:text-blue-400 hover:bg-slate-800/50 transition-colors"
                    >
                        <LifeBuoy className="w-5 h-5" />
                        <span className="text-sm font-semibold tracking-tight">System Guide</span>
                    </button>

                    <div className="flex items-center gap-3 px-2">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 p-[2px] shadow-[0_0_10px_rgba(59,130,246,0.3)]">
                            <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center">
                                <span className="text-xs font-black text-slate-200">OP</span>
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-200 leading-tight">Quant Operator</span>
                            <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1.5 mt-0.5">
                                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                SECURE LINK
                            </span>
                        </div>
                    </div>
                </div>
            </motion.div>

            <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
        </>
    );
};

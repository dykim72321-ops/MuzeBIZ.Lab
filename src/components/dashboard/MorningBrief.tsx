import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { getTopStocks } from '../../services/stockService';
import { MOCK_STOCKS } from '../../data/mockData';
import type { Stock } from '../../types';
import clsx from 'clsx';

export const MorningBrief = () => {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const data = await getTopStocks();
        if (data.length > 0) {
          setStocks(data.slice(0, 8)); // Increase to 8 for better visibility
        } else {
          setStocks(MOCK_STOCKS.slice(0, 8));
        }
      } catch (err) {
        console.error('Failed to fetch stocks:', err);
        setStocks(MOCK_STOCKS.slice(0, 8));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <Card className="p-5 bg-gradient-to-r from-indigo-900/20 to-slate-900/40">
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  return (
    <Card className="p-5 bg-gradient-to-r from-indigo-900/20 to-slate-900/40 border-indigo-500/20 overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <p className="text-white font-medium text-sm">DNA 알고리즘 스캔 결과, 현재 시장에서 기술적 모멘텀이 가장 강력한 종목들이 포착되었습니다.</p>
        </div>

        {/* 요약된 티커 리스트 */}
        <div className="flex flex-wrap gap-2">
          {stocks.map(stock => (
            <Link
              key={stock.ticker}
              to={`/analysis/${stock.ticker}`}
              className="px-3 py-1.5 bg-white/5 rounded-full border border-white/10 flex items-center gap-2 hover:bg-white/10 hover:border-indigo-500/30 transition-all group"
            >
              <span className="font-mono font-bold text-white text-xs">{stock.ticker}</span>
              <span className={clsx(
                "text-[10px] font-bold font-mono",
                stock.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"
              )}>
                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(1)}%
              </span>
            </Link>
          ))}
          <Link
            to="/scanner"
            className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all"
          >
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </Card>
  );
};

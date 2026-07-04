import React from 'react';
import clsx from 'clsx';

interface GradeBadgeProps {
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | string;
  className?: string;
  showLabel?: boolean;
}

export const GradeBadge: React.FC<GradeBadgeProps> = ({ grade, className, showLabel = true }) => {
  const getGradeStyles = (g: string) => {
    switch (g.toUpperCase()) {
      case 'A':
      case 'B':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'C':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'D':
      case 'F':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
  };

  return (
    <div className={clsx("text-center inline-flex flex-col items-center", className)}>
      <div className={clsx(
        "font-black font-mono px-3 py-1 rounded-lg border leading-none transition-all",
        "text-2xl min-w-[2.5rem] flex items-center justify-center",
        getGradeStyles(grade)
      )}>
        {grade.toUpperCase()}
      </div>
      {showLabel && (
        <div className="text-[9px] text-blue-500 font-bold uppercase mt-1 tracking-tighter">Grade</div>
      )}
    </div>
  );
};

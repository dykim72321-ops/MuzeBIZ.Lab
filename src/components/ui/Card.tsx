// src/components/ui/Card.tsx
import React from 'react';
import clsx from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className={clsx(
        // 반투명 유리 질감 베이스 - bg-blue-900/60으로 소폭 어둡게 조정
        "relative overflow-hidden rounded-2xl border border-white/10",
        "bg-blue-900/60 backdrop-blur-md shadow-2xl",
        "hover:border-indigo-500/50 transition-all duration-300 group",
        className
      )}
    >
      {/* 장식용 은은한 내부 글로우 효과 */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      
      {/* 상단 하이라이트 라인 */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

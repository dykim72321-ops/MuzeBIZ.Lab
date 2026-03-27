import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

interface AnimatedNumberProps {
  value: number;
  currency?: boolean;   // '$' 표시 여부
  percent?: boolean;    // '%' 표시 여부 (양수에 '+' 자동 추가)
  decimals?: number;    // 소수점 자릿수 (기본 2)
  className?: string;   // 추가 Tailwind 클래스
}

/**
 * Bloomberg 스타일 숫자 롤링 컴포넌트
 * - Framer Motion useSpring으로 값 변화 시 부드럽게 보간
 * - currency / percent / 일반 숫자 포맷 지원
 */
export default function AnimatedNumber({
  value,
  currency = false,
  percent = false,
  decimals = 2,
  className = "",
}: AnimatedNumberProps) {
  // 스프링 물리 설정: mass ↑ → 더 무겁게, stiffness ↑ → 더 빠르게
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });

  // value prop이 바뀔 때마다 스프링 목표값 업데이트
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  // 스프링 현재값을 포맷팅된 문자열로 변환
  const displayValue = useTransform(spring, (current) => {
    const formatted = current.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    if (currency) return `$${formatted}`;
    if (percent) {
      const sign = current > 0 ? "+" : "";
      return `${sign}${formatted}%`;
    }
    return formatted;
  });

  return (
    <motion.span className={`tabular-nums font-mono ${className}`}>
      {displayValue}
    </motion.span>
  );
}

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface TooltipProps {
  content: string | React.ReactNode;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ 
  content, 
  children, 
  position = 'top' 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = rect.top + window.scrollY - 8;
          left = rect.left + window.scrollX + rect.width / 2;
          break;
        case 'bottom':
          top = rect.bottom + window.scrollY + 8;
          left = rect.left + window.scrollX + rect.width / 2;
          break;
        case 'left':
          top = rect.top + window.scrollY + rect.height / 2;
          left = rect.left + window.scrollX - 8;
          break;
        case 'right':
          top = rect.top + window.scrollY + rect.height / 2;
          left = rect.left + window.scrollX + rect.width + 8;
          break;
      }
      setCoords({ top, left });
    }
  };

  useEffect(() => {
    if (isVisible) {
      updateCoords();
      window.addEventListener('scroll', updateCoords);
      window.addEventListener('resize', updateCoords);
    }
    return () => {
      window.removeEventListener('scroll', updateCoords);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isVisible]);

  const positionClasses = {
    top: '-translate-x-1/2 -translate-y-full',
    bottom: '-translate-x-1/2',
    left: '-translate-x-full -translate-y-1/2',
    right: '-translate-y-1/2'
  };

  const arrowStyles = {
    top: 'top-full left-1/2 -translate-x-1/2 -mt-1 border-t-slate-800 border-x-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 -mb-1 border-b-slate-800 border-x-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 -ml-1 border-l-slate-800 border-y-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 -mr-1 border-r-slate-800 border-y-transparent border-l-transparent'
  };

  return (
    <div 
      ref={triggerRef}
      className="inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {isVisible && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1, ease: "easeOut" }}
              style={{ top: coords.top, left: coords.left }}
              className={`fixed z-[9999] pointer-events-none ${positionClasses[position]}`}
            >
              <div className="bg-slate-900/95 backdrop-blur-md border border-slate-700/50 text-white text-[10px] font-bold px-3 py-2 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(99,102,241,0.2)] whitespace-normal min-w-[140px] max-w-[280px] leading-relaxed break-keep relative">
                {content}
                <div className={`absolute border-4 ${arrowStyles[position]}`} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

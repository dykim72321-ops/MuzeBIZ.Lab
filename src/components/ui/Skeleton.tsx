import clsx from 'clsx';

interface Props {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
}

export const Skeleton = ({ className, variant = 'rectangular' }: Props) => {
  return (
    <div
      className={clsx(
        'animate-pulse bg-blue-800/50',
        {
          'rounded': variant === 'rectangular',
          'rounded-full': variant === 'circular',
          'rounded-md': variant === 'text',
        },
        className
      )}
    />
  );
};

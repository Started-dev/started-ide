import { cn } from '@/lib/utils';

type PulseState = 'idle' | 'processing' | 'agent' | 'error';

interface SystemPulseProps {
  state: PulseState;
  className?: string;
}

export function SystemPulse({ state, className }: SystemPulseProps) {
  const isAnimating = state === 'processing' || state === 'agent';
  const barColor = state === 'error'
    ? 'fill-ide-error'
    : state === 'agent'
    ? 'fill-primary'
    : 'fill-muted-foreground';

  return (
    <svg
      width="16"
      height="12"
      viewBox="0 0 16 12"
      className={cn('shrink-0', className)}
    >
      <rect
        x="1" y="1" width="3" height="10" rx="1"
        className={cn(
          barColor,
          'origin-bottom transition-opacity duration-150',
          isAnimating ? 'animate-pulse-bar-1 opacity-80' : 'opacity-30'
        )}
      />
      <rect
        x="6" y="1" width="3" height="10" rx="1"
        className={cn(
          barColor,
          'origin-bottom transition-opacity duration-150',
          isAnimating ? 'animate-pulse-bar-2 opacity-80' : 'opacity-30'
        )}
      />
      <rect
        x="11" y="1" width="3" height="10" rx="1"
        className={cn(
          barColor,
          'origin-bottom transition-opacity duration-150',
          isAnimating ? 'animate-pulse-bar-3 opacity-80' : 'opacity-30'
        )}
      />
    </svg>
  );
}

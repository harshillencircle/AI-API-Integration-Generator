import * as React from 'react';
import { cn } from '@/lib/utils';

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'glass rounded-3xl border border-[var(--border)] p-6 shadow-[0_1px_2px_rgba(30,25,60,0.04),0_12px_32px_-12px_rgba(30,25,60,0.12)] transition-[box-shadow,border-color] focus-within:border-[var(--primary)]/35',
        className
      )}
      {...props}
    />
  );
}

function CardLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'mb-3 font-mono text-[11px] uppercase tracking-wider text-[var(--muted-foreground)]',
        className
      )}
      {...props}
    />
  );
}

export { Card, CardLabel };

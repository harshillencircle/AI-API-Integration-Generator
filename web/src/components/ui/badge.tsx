import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] font-medium',
  {
    variants: {
      variant: {
        neutral: 'border-[var(--border-strong)] bg-[var(--card-solid)] text-[var(--muted-foreground)]',
        success: 'border-[var(--color-green)]/25 bg-[var(--color-green)]/10 text-[var(--color-green)]',
        warning: 'border-[var(--color-amber)]/28 bg-[var(--color-amber)]/12 text-[var(--color-amber)]',
        danger: 'border-[var(--color-red)]/25 bg-[var(--color-red)]/10 text-[var(--color-red)]',
      },
    },
    defaultVariants: { variant: 'neutral' },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}

export { Badge, badgeVariants };

import * as React from 'react';
import { cn } from '@/lib/utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-xl border border-[var(--border-strong)] bg-[var(--card-solid)] px-3.5 py-2.5 text-sm text-[var(--foreground)] transition-[border-color,box-shadow] outline-none placeholder:text-[var(--muted-foreground)]',
        'hover:border-[var(--foreground-2)]/30 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--glow)]',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };

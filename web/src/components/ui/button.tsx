import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--glow)]",
  {
    variants: {
      variant: {
        default:
          'border border-[var(--border-strong)] bg-[var(--card-solid)] text-[var(--foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] hover:-translate-y-px',
        primary:
          'bg-brand-grad text-white font-semibold shadow-[0_4px_16px_rgba(124,58,237,0.35)] hover:brightness-110 hover:-translate-y-0.5',
        ghost: 'hover:bg-[var(--border)] text-[var(--foreground)]',
        outline: 'border border-[var(--border-strong)] bg-transparent hover:border-[var(--primary)] hover:text-[var(--primary)]',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-13 px-5 text-[15px] w-full rounded-2xl',
        icon: 'h-9 w-9 shrink-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };

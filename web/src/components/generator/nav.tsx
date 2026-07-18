import { ThemeToggle } from '@/components/theme-toggle';

export function Nav() {
  return (
    <nav className="sticky top-0 z-100 border-b border-[var(--border)] bg-[var(--background)]/70 py-4.5 backdrop-blur-2xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-[960px] items-center justify-between px-6">
        <div className="flex items-center gap-2.5 font-mono text-sm font-bold text-[var(--foreground)]">
          <span
            className="size-2.5 rounded-full bg-brand-grad shadow-[0_0_12px_var(--glow)]"
            aria-hidden="true"
          />
          api-gen
        </div>
        <ThemeToggle />
      </div>
    </nav>
  );
}

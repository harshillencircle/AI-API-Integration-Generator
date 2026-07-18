'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <span className="sr-only">Toggle dark mode</span>
      <Sun className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        aria-label="Toggle dark mode"
      />
      <Moon className="size-3.5 text-[var(--muted-foreground)]" aria-hidden="true" />
    </label>
  );
}

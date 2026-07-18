'use client';

import { useMemo, useState } from 'react';
import { Check, Copy, Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { CodeBlock } from '@/components/generator/code-block';
import { cn } from '@/lib/utils';

interface GeneratedFile {
  path: string;
  content: string;
}

interface GenerateResponse {
  files: GeneratedFile[];
  duration: number;
  warnings?: string[];
}

const CATEGORIES = [
  { prefix: 'api/', color: 'var(--color-amber)', label: 'API infrastructure' },
  { prefix: 'types/', color: 'var(--color-green)', label: 'TypeScript types' },
  { prefix: 'validators/', color: 'var(--color-orange)', label: 'Zod validators' },
  { prefix: 'services/', color: 'var(--color-blue)', label: 'Service layer' },
  { prefix: 'hooks/', color: 'var(--color-purple)', label: 'React Query hooks' },
  { prefix: 'mocks/', color: 'var(--color-pink)', label: 'MSW mocks' },
  { prefix: 'docs/', color: 'var(--muted-foreground)', label: 'Docs' },
];

function categoryOf(path: string) {
  return CATEGORIES.find((c) => path.startsWith(c.prefix));
}

export function OutputBrowser({
  result,
  onDownloadZip,
}: {
  result: GenerateResponse;
  onDownloadZip: () => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState('');

  const filtered = useMemo(() => {
    if (!filter.trim()) return result.files.map((f, i) => ({ file: f, index: i }));
    const q = filter.toLowerCase();
    return result.files
      .map((f, i) => ({ file: f, index: i }))
      .filter(({ file }) => file.path.toLowerCase().includes(q));
  }, [result.files, filter]);

  const active = result.files[activeTab];

  async function handleCopy() {
    if (!active) return;
    await navigator.clipboard.writeText(active.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="animate-fade-up mt-8">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-mono text-[12.5px] text-[var(--muted-foreground)]">
          <Badge variant="success">✓ {result.files.length} files</Badge>
          <span>generated in {result.duration} ms</span>
          {result.warnings && result.warnings.length > 0 && (
            <Badge variant="warning">
              ⚠ {result.warnings.length} warning{result.warnings.length === 1 ? '' : 's'}
            </Badge>
          )}
        </div>
        <div className="flex gap-2.5">
          <Button variant="primary" onClick={onDownloadZip}>
            <Download aria-hidden="true" />
            Download ZIP
          </Button>
        </div>
      </div>

      {result.warnings && result.warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--color-amber)]/30 bg-amber-50 px-4 py-3 font-mono text-[13px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Normalization warnings</strong>
          <ul className="mt-2 list-disc pl-5">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="glass overflow-hidden rounded-3xl border border-[var(--border)] shadow-[0_1px_2px_rgba(30,25,60,0.04),0_16px_40px_-16px_rgba(30,25,60,0.16)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[#FF5F57] opacity-85" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-[#FEBC2E] opacity-85" aria-hidden="true" />
          <span className="size-2.5 rounded-full bg-[#28C840] opacity-85" aria-hidden="true" />
          <span className="ml-1.5 font-mono text-[11.5px] text-[var(--muted-foreground)]">
            generated output
          </span>
          <div className="relative ml-auto w-44">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]"
              aria-hidden="true"
            />
            <Input
              aria-label="Filter generated files by name"
              placeholder="Filter files…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="relative flex items-stretch bg-[var(--border)]/10">
          <div
            role="tablist"
            aria-label="Generated files"
            className="scrollx flex flex-1 gap-0.5 border-b border-[var(--border)] py-2 pr-10 pl-2"
          >
            {filtered.length === 0 && (
              <span className="px-3 py-2 font-mono text-[11.5px] text-[var(--muted-foreground)]">
                No files match &ldquo;{filter}&rdquo;
              </span>
            )}
            {filtered.map(({ file, index }) => {
              const cat = categoryOf(file.path);
              const isActive = index === activeTab;
              return (
                <button
                  key={file.path}
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(index)}
                  style={{ color: isActive ? 'var(--primary)' : cat?.color }}
                  className={cn(
                    'rounded-t-lg px-3.5 py-2 font-mono text-[11.5px] font-medium whitespace-nowrap transition-colors',
                    isActive
                      ? 'mb-[-1px] border border-b-0 border-[var(--border)] bg-[var(--card-solid)] opacity-100'
                      : 'opacity-60 hover:bg-[var(--border)]/20'
                  )}
                >
                  {file.path}
                </button>
              );
            })}
          </div>
          <button
            onClick={handleCopy}
            aria-label={`Copy ${active?.path ?? 'file'}`}
            className="absolute top-0 right-0 bottom-px flex w-10 items-center justify-center border-b border-l border-[var(--border)] bg-gradient-to-r from-transparent to-[var(--background)]/90 text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)]"
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </button>
        </div>

        {active ? <CodeBlock content={active.content} /> : (
          <p className="p-6 text-sm text-[var(--muted-foreground)]">Select a file to preview.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3.5">
        {CATEGORIES.map((c) => (
          <div
            key={c.prefix}
            className="flex items-center gap-1.5 font-mono text-[11.5px] text-[var(--muted-foreground)]"
          >
            <span
              className="size-1.75 rounded-full"
              style={{ background: c.color }}
              aria-hidden="true"
            />
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

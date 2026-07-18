'use client';

import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Loader2, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export type InputMode = 'paste' | 'upload' | 'url';

const STAGES = ['Parsing spec', 'Normalizing schema', 'Generating files'];

function useFakeProgress(active: boolean) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) {
      setStage(0);
      return;
    }
    const id = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 500);
    return () => clearInterval(id);
  }, [active]);
  return stage;
}

interface Props {
  mode: InputMode;
  setMode: (m: InputMode) => void;
  specText: string;
  setSpecText: (v: string) => void;
  specUrl: string;
  setSpecUrl: (v: string) => void;
  filename: string;
  setFilename: (v: string) => void;
  baseUrl: string;
  setBaseUrl: (v: string) => void;
  loading: boolean;
  error: string | null;
  canGenerate: boolean;
  onGenerate: () => void;
}

export function SpecInputPanel({
  mode,
  setMode,
  specText,
  setSpecText,
  specUrl,
  setSpecUrl,
  filename,
  setFilename,
  baseUrl,
  setBaseUrl,
  loading,
  error,
  canGenerate,
  onGenerate,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stage = useFakeProgress(loading);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSpecText(text);
    setFilename(file.name);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSpecText(text);
    setFilename(file.name);
  }

  return (
    <>
      <Card className="mb-4">
        <div
          role="tablist"
          aria-label="Spec input method"
          className="mb-4 flex gap-1 rounded-full border border-[var(--border)] bg-[var(--border)]/40 p-1"
        >
          {(['paste', 'upload', 'url'] as InputMode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 rounded-full px-3 py-2 font-mono text-[12.5px] font-medium text-[var(--muted-foreground)] transition-colors',
                mode === m &&
                  'bg-[var(--card-solid)] text-[var(--primary)] shadow-[0_2px_8px_rgba(30,25,60,0.12)]'
              )}
            >
              {m === 'paste' ? 'Paste spec' : m === 'upload' ? 'Upload file' : 'From URL'}
            </button>
          ))}
        </div>

        {mode === 'paste' && (
          <div>
            <label htmlFor="spec-paste" className="sr-only">
              Paste OpenAPI, Postman, or GraphQL spec
            </label>
            <Textarea
              id="spec-paste"
              className="min-h-[230px] resize-y font-mono text-[13px] leading-relaxed"
              placeholder="Paste your OpenAPI / Swagger spec, Postman Collection, or GraphQL schema here…"
              value={specText}
              onChange={(e) => setSpecText(e.target.value)}
            />
          </div>
        )}

        {mode === 'upload' && (
          <div>
            <label htmlFor="spec-file" className="sr-only">
              Upload spec file
            </label>
            <input
              id="spec-file"
              ref={fileInputRef}
              type="file"
              accept=".json,.yaml,.yml,.graphql,.gql"
              onChange={handleFileChange}
              className="hidden"
            />
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose a spec file or drag and drop it here"
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                'relative cursor-pointer rounded-3xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--primary)]/[0.03] p-10 text-center transition-colors',
                dragging && 'border-[var(--primary)] bg-[var(--glow)]'
              )}
            >
              <FolderOpen
                className="mx-auto mb-2.5 size-8 text-[var(--foreground-2)]"
                aria-hidden="true"
              />
              <p className="mb-1 text-sm font-medium text-[var(--foreground-2)]">
                {dragging ? 'Drop it here!' : 'Click to choose a file, or drag & drop'}
              </p>
              <p className="font-mono text-[11px] text-[var(--muted-foreground)]">
                .json · .yaml · .yml · .graphql · .gql
              </p>
            </div>
            {specText && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-[var(--color-green)]/25 bg-[var(--color-green)]/8 px-3.5 py-2.5 font-mono text-[12.5px] text-[var(--color-green)]">
                <span aria-hidden="true">✓</span>
                <span>
                  {filename} — {(specText.length / 1024).toFixed(1)} KB loaded
                </span>
              </div>
            )}
          </div>
        )}

        {mode === 'url' && (
          <div>
            <label htmlFor="spec-url" className="sr-only">
              Spec URL
            </label>
            <Input
              id="spec-url"
              placeholder="https://api.example.com/openapi.json"
              value={specUrl}
              onChange={(e) => setSpecUrl(e.target.value)}
            />
          </div>
        )}

        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <label
            htmlFor="base-url"
            className="mb-1.5 block font-mono text-[11px] text-[var(--muted-foreground)]"
          >
            Base URL <span className="opacity-70">(optional)</span>
          </label>
          <Input
            id="base-url"
            placeholder="https://api.example.com"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <p className="mt-1.5 text-[11.5px] text-[var(--muted-foreground)]">
            Used as the default fallback in the generated Axios client config.
          </p>
        </div>
      </Card>

      <Button
        variant="primary"
        size="lg"
        disabled={!canGenerate}
        onClick={onGenerate}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {STAGES[stage]}…
          </>
        ) : (
          <>
            <Zap aria-hidden="true" />
            Generate Integration
          </>
        )}
      </Button>

      {loading && (
        <div className="mt-3 flex gap-1.5" role="status" aria-live="polite">
          {STAGES.map((s, i) => (
            <div key={s} className="flex-1">
              <div
                className={cn(
                  'h-1 rounded-full transition-colors',
                  i <= stage ? 'bg-brand-grad' : 'bg-[var(--border)]'
                )}
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-[var(--color-red)]/25 bg-[var(--color-red)]/6 px-4 py-3 font-mono text-[13px] whitespace-pre-wrap text-[var(--color-red)]"
        >
          {error}
        </div>
      )}
    </>
  );
}

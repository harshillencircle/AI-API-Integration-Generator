'use client';

import { useState } from 'react';
import { ArrowLeftRight, Loader2, X } from 'lucide-react';
import { Card, CardLabel } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { SectionTitle } from '@/components/generator/hero';

type ChangeSeverity = 'breaking' | 'safe' | 'warning';

interface FieldChange {
  kind: 'added' | 'removed' | 'changed' | 'possible-rename';
  property: string;
  renamedTo?: string;
  severity: ChangeSeverity;
  detail: string;
}

interface SchemaChange {
  kind: 'added' | 'removed' | 'changed';
  name: string;
  severity: ChangeSeverity;
  fields: FieldChange[];
}

interface EndpointChange {
  kind: 'added' | 'removed' | 'changed';
  operationId: string;
  method?: string;
  path?: string;
  severity: ChangeSeverity;
  details: string[];
}

interface DiffResponse {
  endpoints: EndpointChange[];
  schemas: SchemaChange[];
  summary: { breaking: number; warning: number; safe: number };
  duration: number;
}

const SEVERITY_LABEL: Record<ChangeSeverity, string> = {
  breaking: '⚠ Breaking',
  warning: '● Check',
  safe: '✓ Safe',
};

const SEVERITY_BADGE: Record<ChangeSeverity, 'danger' | 'warning' | 'success'> = {
  breaking: 'danger',
  warning: 'warning',
  safe: 'success',
};

export function DiffPanel() {
  const [show, setShow] = useState(false);
  const [oldSpecText, setOldSpecText] = useState('');
  const [newSpecText, setNewSpecText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DiffResponse | null>(null);

  const canCompare = !loading && oldSpecText.trim().length > 0 && newSpecText.trim().length > 0;

  async function handleCompare() {
    setError(null);
    setReport(null);
    setLoading(true);
    try {
      const res = await fetch('/api/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldSpecContent: oldSpecText, newSpecContent: newSpecText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setReport(data as DiffResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mt-5">
        <Button onClick={() => setShow((v) => !v)}>
          {show ? <X aria-hidden="true" /> : <ArrowLeftRight aria-hidden="true" />}
          {show ? 'Close compare' : 'Compare with previous version'}
        </Button>
      </div>

      {show && (
        <div className="mt-4">
          <SectionTitle>Compare versions</SectionTitle>
          <Card className="mb-4">
            <div className="flex flex-col gap-3.5 sm:flex-row">
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="old-spec" className="font-mono text-[11px] text-[var(--muted-foreground)]">
                  Old spec
                </label>
                <Textarea
                  id="old-spec"
                  className="min-h-[160px] font-mono text-[13px]"
                  placeholder="Paste the previous version of the spec…"
                  value={oldSpecText}
                  onChange={(e) => setOldSpecText(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <label htmlFor="new-spec" className="font-mono text-[11px] text-[var(--muted-foreground)]">
                  New spec
                </label>
                <Textarea
                  id="new-spec"
                  className="min-h-[160px] font-mono text-[13px]"
                  placeholder="Paste the new version of the spec…"
                  value={newSpecText}
                  onChange={(e) => setNewSpecText(e.target.value)}
                />
              </div>
            </div>
            <div className="my-4.5 h-px bg-[var(--border)]" />
            <Button variant="primary" size="lg" disabled={!canCompare} onClick={handleCompare} aria-busy={loading}>
              {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ArrowLeftRight aria-hidden="true" />}
              {loading ? 'Comparing…' : 'Compare'}
            </Button>
          </Card>

          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-[var(--color-red)]/25 bg-[var(--color-red)]/6 px-4 py-3 font-mono text-[13px] text-[var(--color-red)]">
              {error}
            </div>
          )}

          {report && (
            <div className="animate-fade-up">
              <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="danger">⚠ {report.summary.breaking} breaking</Badge>
                  <Badge variant="warning">● {report.summary.warning} to check</Badge>
                  <Badge variant="success">✓ {report.summary.safe} safe</Badge>
                </div>
                <span className="text-[12.5px] text-[var(--muted-foreground)]">compared in {report.duration} ms</span>
              </div>

              {report.endpoints.length === 0 && report.schemas.length === 0 && (
                <p className="text-[12.5px] text-[var(--muted-foreground)]">No changes detected between the two versions.</p>
              )}

              {report.endpoints.length > 0 && (
                <Card className="mb-4">
                  <CardLabel>Endpoints</CardLabel>
                  {report.endpoints.map((e) => (
                    <div key={e.operationId} className="border-b border-[var(--border)] py-3 last:border-none">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Badge variant={SEVERITY_BADGE[e.severity]}>{SEVERITY_LABEL[e.severity]}</Badge>
                        <span className="font-mono text-[13px] font-semibold text-[var(--foreground)]">
                          {e.method?.toUpperCase()} {e.path || e.operationId}
                        </span>
                      </div>
                      <ul className="mt-1.5 flex flex-col gap-1 pl-5">
                        {e.details.map((d, i) => (
                          <li key={i} className="relative text-[12.5px] text-[var(--foreground-2)] before:absolute before:-left-4 before:text-[var(--muted-foreground)] before:content-['—']">
                            {d}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Card>
              )}

              {report.schemas.length > 0 && (
                <Card>
                  <CardLabel>Schemas</CardLabel>
                  {report.schemas.map((s) => (
                    <div key={s.name} className="border-b border-[var(--border)] py-3 last:border-none">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Badge variant={SEVERITY_BADGE[s.severity]}>{SEVERITY_LABEL[s.severity]}</Badge>
                        <span className="font-mono text-[13px] font-semibold text-[var(--foreground)]">
                          {s.name} {s.kind !== 'changed' ? `(${s.kind})` : ''}
                        </span>
                      </div>
                      {s.fields.length > 0 && (
                        <ul className="mt-1.5 flex flex-col gap-1 pl-5">
                          {s.fields.map((f, i) => (
                            <li key={i} className="relative text-[12.5px] text-[var(--foreground-2)] before:absolute before:-left-4 before:text-[var(--muted-foreground)] before:content-['—']">
                              <strong>{f.property}</strong>
                              {f.renamedTo ? ` → ${f.renamedTo}` : ''}: {f.detail}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

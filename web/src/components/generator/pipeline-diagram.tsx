import { ArrowRight } from 'lucide-react';

const STEPS = [
  {
    label: 'Input',
    note: 'OpenAPI 3.x / Swagger 2.0, Postman Collection, or GraphQL schema — paste, upload, or link',
    accent: false,
  },
  {
    label: 'Template engine',
    note: 'Spec is parsed into a schema model then walked by deterministic codegen — no network call',
    accent: true,
  },
  {
    label: 'Output',
    note: 'Types, validators, services, hooks, mocks, docs — preview or download as ZIP',
    accent: false,
  },
];

export function PipelineDiagram() {
  return (
    <div className="flex flex-col items-stretch gap-3 md:flex-row">
      {STEPS.map((step, i) => (
        <div className="contents" key={step.label}>
          <div
            className={
              step.accent
                ? 'glass min-w-0 flex-1 rounded-xl border border-[var(--primary)]/25 bg-[var(--primary)]/5 p-4.5'
                : 'glass min-w-0 flex-1 rounded-xl border border-[var(--border)] p-4.5'
            }
          >
            <div className="mb-2 font-mono text-[11px] font-semibold tracking-[0.06em] text-[var(--foreground)] uppercase">
              {step.label}
            </div>
            <div className="text-xs leading-relaxed text-[var(--muted-foreground)]">{step.note}</div>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className="flex shrink-0 items-center justify-center px-0.5 text-[var(--muted-foreground)] md:rotate-0"
              aria-hidden="true"
            >
              <ArrowRight className="size-4.5 rotate-90 md:rotate-0" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

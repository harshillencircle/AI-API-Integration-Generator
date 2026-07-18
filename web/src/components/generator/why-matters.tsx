import { Card } from '@/components/ui/card';

const BEFORE = [
  <><code>users.ts</code>, <code>orders.ts</code> — hand-rolled per resource</>,
  <><code>hooks.ts</code> — wired up manually per endpoint</>,
  <><code>types.ts</code> — kept in sync by hand</>,
  'Error handling and validation re-invented per resource',
  'Re-done from scratch every time the API changes',
];

const AFTER = [
  'Axios services, generated per resource/tag',
  'React Query hooks (useQuery / useMutation) out of the box',
  <>Strict TypeScript types for every request &amp; response</>,
  'Built-in error handling and Zod validation',
  'Consistent folder structure, plus generated API docs',
];

function CompareList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="relative pl-4 text-[12.5px] leading-relaxed text-[var(--foreground-2)] before:absolute before:left-0 before:text-[var(--muted-foreground)] before:content-['—'] [&_code]:rounded [&_code]:bg-[var(--border)] [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-[11.5px]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

export function WhyMatters() {
  return (
    <Card className="mb-14">
      <p className="mb-6 text-[14.5px] leading-relaxed text-[var(--foreground-2)] [&_code]:rounded [&_code]:border [&_code]:border-[var(--border)] [&_code]:bg-[var(--border)]/60 [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-[var(--foreground)]">
        This is the part of every frontend project nobody wants to redo by hand. The developer pastes
        a Swagger / OpenAPI spec, a Postman Collection, or a GraphQL schema — and instead of manually
        writing <code>users.ts</code>, <code>orders.ts</code>, <code>hooks.ts</code>, and{' '}
        <code>types.ts</code> for every resource, the generator produces the whole integration layer
        in seconds: Axios services, React Query hooks, TypeScript types, error handling, validation,
        a clean folder structure, and API documentation — all in one pass, and reproducible every
        time the spec changes.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-red)]/18 bg-[var(--color-red)]/4 p-4.5">
          <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.04em] text-[var(--color-red)] uppercase">
            Without this — written by hand
          </div>
          <CompareList items={BEFORE} />
        </div>
        <div className="rounded-xl border border-[var(--color-green)]/20 bg-[var(--color-green)]/5 p-4.5">
          <div className="mb-3 font-mono text-[11px] font-semibold tracking-[0.04em] text-[var(--color-green)] uppercase">
            Paste a spec — get all of this
          </div>
          <CompareList items={AFTER} />
        </div>
      </div>
    </Card>
  );
}

import { Braces, Code2, Cog, FileText, FlaskConical, Layers, ShieldCheck } from 'lucide-react';

const FEATURES = [
  {
    icon: Cog,
    tag: 'CLIENT',
    color: 'var(--color-cyan)',
    title: 'API Client',
    desc: 'Axios client with typed ApiError mapping, 401 refresh hook, exponential retry on 5xx, and bearer-token injection.',
  },
  {
    icon: Layers,
    tag: 'SERVICE',
    color: 'var(--color-blue)',
    title: 'Service Layer',
    desc: 'Typed static classes, one per resource/tag, that validate every response against its Zod schema before returning it.',
  },
  {
    icon: Code2,
    tag: 'HOOKS',
    color: 'var(--color-purple)',
    title: 'React Query Hooks',
    desc: 'useQuery / useMutation hooks per endpoint, plus a shared query-key factory.',
  },
  {
    icon: Braces,
    tag: 'TYPES',
    color: 'var(--color-green)',
    title: 'TypeScript Types',
    desc: 'Interfaces for every request and response shape in the spec — strict, no `any`.',
  },
  {
    icon: ShieldCheck,
    tag: 'VALID',
    color: 'var(--color-amber)',
    title: 'Zod Validators',
    desc: 'Runtime validation schemas mirroring the generated types, automatically applied to every service response.',
  },
  {
    icon: FlaskConical,
    tag: 'MOCKS',
    color: 'var(--color-pink)',
    title: 'MSW Mocks',
    desc: 'Mock data and request handlers so the frontend can be built before the backend is ready.',
  },
  {
    icon: FileText,
    tag: 'DOCS',
    color: 'var(--muted-foreground)',
    title: 'Docs',
    desc: 'A generated README describing the output and how to wire it into your app.',
  },
];

export function FeaturesGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((f) => (
        <div
          key={f.title}
          className="glass rounded-xl border border-[var(--border)] p-5 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-[var(--border-strong)]"
        >
          <div
            className="mb-3.5 inline-flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.07em]"
            style={{ color: f.color, borderColor: `color-mix(in srgb, ${f.color} 35%, transparent)`, background: `color-mix(in srgb, ${f.color} 8%, transparent)` }}
          >
            <f.icon className="size-3" aria-hidden="true" />
            {f.tag}
          </div>
          <h3 className="mb-1.5 text-sm font-bold text-[var(--foreground)]">{f.title}</h3>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{f.desc}</p>
        </div>
      ))}
    </div>
  );
}

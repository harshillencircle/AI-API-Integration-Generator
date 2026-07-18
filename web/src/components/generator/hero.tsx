export function Hero() {
  return (
    <section className="pt-16 pb-11">
      <div className="mx-auto max-w-[960px] px-6">
        <div className="mb-4.5 flex items-center gap-2.5 font-mono text-[11px] font-semibold tracking-[0.14em] text-[var(--primary)] uppercase after:h-px after:w-7 after:bg-[var(--primary)] after:opacity-50">
          Run it yourself
        </div>
        <h1 className="mb-4.5 text-balance text-[clamp(32px,5vw,46px)] font-extrabold leading-[1.15] tracking-[-0.03em] text-[var(--foreground)]">
          Paste a spec.
          <br />
          <em className="text-grad not-italic">Get a typed integration layer.</em>
        </h1>
        <p className="max-w-[560px] text-[16.5px] leading-relaxed text-[var(--muted-foreground)]">
          Drop in an OpenAPI / Swagger spec, a Postman Collection, or a GraphQL schema — get
          Axios services, Zod validators, React Query hooks, MSW mocks, and docs generated
          instantly. Deterministic template-based codegen: no AI model, no API key, nothing
          sent to a third party.
        </p>
      </div>
    </section>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
      {children}
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-5 border-t border-[var(--border)] py-11 text-center font-mono text-[11.5px] text-[var(--muted-foreground)]">
      api-gen
    </footer>
  );
}

import type { ReactNode } from "react";
export function Legal({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="container-page max-w-3xl py-12">
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">Last updated {updated}. Template — have counsel review before launch.</p>
      <div className="mt-8 space-y-5 text-[15px] leading-relaxed text-navy [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p]:text-muted [&_li]:text-muted">
        {children}
      </div>
    </article>
  );
}

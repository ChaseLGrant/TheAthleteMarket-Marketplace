import type { Metadata } from "next";
import Link from "next/link";
import { inboundEmailEnabled, paymentsOff, smsEnabled } from "@/lib/env";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sent — Coach Line", robots: { index: false } };

export default async function SentPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order: ref } = await searchParams;
  const deps = await getDeps();
  const settings = await deps.store.getSettings();
  const order = ref ? await deps.store.getOrderByRef(ref) : null;
  const reqs = order ? await deps.store.listRequests({ order_id: order.id, limit: 10 }) : [];
  return (
    <div className="container-page max-w-xl py-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success-50 text-3xl" aria-hidden>✓</div>
      <h1 className="mt-5 text-3xl font-bold tracking-tight">Your message is on its way</h1>
      <p className="mt-2 text-muted">
        {reqs.length ? <>Sent to <strong>{reqs.map((r) => r.target_school).filter(Boolean).join(", ")}</strong>. </> : null}
        We&apos;ll email you{smsEnabled() ? " (and text you, if you added a number)" : ""} the moment a coach opens it and the moment they answer.
      </p>
      <ol className="mx-auto mt-8 max-w-sm space-y-3 text-left text-sm">
        <Step n={1}>The right coach on each staff gets your message with one-tap answers.</Step>
        <Step n={2}>No answer in {settings.escalate_after_hours} hours? It moves to the next coach on staff.</Step>
        <Step n={3}>{paymentsOff() ? (inboundEmailEnabled() ? "Reply to the answer email to keep the conversation going." : "The answer lands in your inbox.") : `You're only charged for schools that answer.${inboundEmailEnabled() ? " Reply to the answer email to keep talking." : ""}`}</Step>
      </ol>
      <Link href="/ask" className="btn-primary mt-10">Ask more schools</Link>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return <li className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue text-xs font-bold text-white">{n}</span><span className="pt-1">{children}</span></li>;
}

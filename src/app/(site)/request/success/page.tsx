import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Request confirmed", robots: { index: false } };

export default async function Success({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  return (
    <div className="container-page max-w-xl py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-3xl text-success">✓</div>
      <h1 className="mt-5 text-3xl font-bold tracking-tight">You&apos;re all set</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-muted">
        Your card is authorized{ref && <> for <strong className="text-navy">{ref.replace(/[^A-Z0-9-]/g, "")}</strong></>} — you&apos;ll only be charged when your video is delivered. We&apos;re emailing your coach now, and
        a receipt is on its way to you.
      </p>
      <ol className="card mt-8 space-y-4 p-6 text-left text-sm">
        <li><strong>Now</strong> — your coach gets your film and details.</li>
        <li><strong>Within 5 days</strong> — we email you a private link to their video, and only then charge your card.</li>
        <li><strong>If they decline or run out of time</strong> — the hold is released. You&apos;re never charged.</li>
      </ol>
      <Link href="/coaches" className="btn-ghost mt-8">Browse more coaches</Link>
    </div>
  );
}

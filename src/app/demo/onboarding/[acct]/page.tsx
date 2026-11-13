import { notFound, redirect } from "next/navigation";
import { getDemo } from "@/lib/deps";
import { isDemoMode } from "@/lib/env";
import { handleAccountUpdated } from "@/lib/services/lifecycle";

export const dynamic = "force-dynamic";

export default async function DemoOnboarding({ params, searchParams }: { params: Promise<{ acct: string }>; searchParams: Promise<{ return?: string }> }) {
  if (!isDemoMode()) notFound();
  const { acct } = await params;
  const { return: ret } = await searchParams;
  async function complete() {
    "use server";
    const d = await getDemo();
    d.payments.completeOnboarding(acct);
    await handleAccountUpdated(d, acct);
    redirect((ret ?? "/").replace(/^https?:\/\/[^/]+/, ""));
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <div className="card w-full max-w-md p-6">
        <p className="pill bg-warn-50 text-warn">Simulated Stripe Connect onboarding</p>
        <h1 className="mt-4 text-lg font-semibold">Verify identity &amp; add bank</h1>
        <p className="mt-1 text-sm text-muted">In production this is Stripe&apos;s hosted page; The Athlete Market never sees bank details.</p>
        <form action={complete} className="mt-5"><button className="btn-primary w-full">Complete onboarding</button></form>
      </div>
    </main>
  );
}

import { notFound } from "next/navigation";
import { resolveUnsubscribe } from "@/lib/services/access";
import { unsubscribeEmail } from "@/lib/services/lifecycle";
import { getDeps } from "@/lib/server";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const email = resolveUnsubscribe(token);
  if (!email) notFound();

  async function confirm() {
    "use server";
    const e = resolveUnsubscribe(token);
    if (e) await unsubscribeEmail(await getDeps(), e);
    const { redirect } = await import("next/navigation");
    redirect(`/unsubscribe/${token}?done=1`);
  }

  return (
    <div className="card p-6 text-center">
      {done ? (
        <>
          <h1 className="text-xl font-bold">You won&apos;t hear from us again</h1>
          <p className="mt-2 text-sm text-muted">{email} has been removed. Any open requests were declined and the families refunded.</p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-bold">Stop all evaluation emails?</h1>
          <p className="mt-2 text-sm text-muted">We&apos;ll never email <strong>{email}</strong> about evaluation requests again. Open requests will be declined and refunded.</p>
          <form action={confirm} className="mt-5"><button className="btn-navy w-full">Yes, unsubscribe me</button></form>
        </>
      )}
    </div>
  );
}

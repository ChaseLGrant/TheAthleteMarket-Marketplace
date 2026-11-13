import Link from "next/link";
export default function NotFound() {
  return (
    <main className="flex min-h-[70dvh] flex-col items-center justify-center px-4 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-2xl font-bold">This link isn&apos;t valid</h1>
      <p className="mt-2 max-w-md text-muted">It may have expired or been replaced by a newer email. If you think this is a mistake, reply to the email you received.</p>
      <Link href="/" className="btn-primary mt-6">Go to The Athlete Market</Link>
    </main>
  );
}

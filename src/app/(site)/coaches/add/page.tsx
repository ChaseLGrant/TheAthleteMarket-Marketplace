import type { Metadata } from "next";
import Link from "next/link";
import { AddCoachForm } from "@/components/add-coach-form";

export const metadata: Metadata = { title: "Request any coach", robots: { index: false } };

export default function AddCoachPage() {
  return (
    <div className="container-page max-w-xl py-10">
      <Link href="/coaches" className="text-sm font-medium text-muted hover:text-navy">← Find a coach</Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Request any coach</h1>
      <p className="mt-2 text-muted">Tell us who you&apos;d like feedback from. Next you&apos;ll add your athlete&apos;s details and choose your offer.</p>
      <div className="card mt-6 p-5 sm:p-8"><AddCoachForm /></div>
    </div>
  );
}

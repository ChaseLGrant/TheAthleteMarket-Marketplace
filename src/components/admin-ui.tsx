"use client";
import { useActionState, type ReactNode } from "react";
import { cx } from "@/lib/format";

type Result = { ok?: string; error?: string };
type Action = (prev: Result, fd: FormData) => Promise<Result>;

/** Small form that runs an admin server action and shows the result inline. */
export function ActionForm({ action, fields, label, tone = "ghost", confirm, children }: {
  action: Action; fields: Record<string, string>; label: string; tone?: "ghost" | "primary" | "danger"; confirm?: string; children?: ReactNode;
}) {
  const [state, run, pending] = useActionState<Result, FormData>(action, {});
  return (
    <form
      action={run}
      onSubmit={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
      className="inline-flex flex-col gap-1"
    >
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      <button disabled={pending} className={cx("btn-sm", tone === "primary" ? "btn-primary" : tone === "danger" ? "btn-danger" : "btn-ghost")}>
        {pending ? "Working…" : label}
      </button>
      {state.ok && <span className="text-xs font-medium text-success">{state.ok}</span>}
      {state.error && <span className="max-w-xs text-xs font-medium text-danger">{state.error}</span>}
    </form>
  );
}

/** Full form wrapper for larger admin forms (coach editor, settings). */
export function AdminForm({ action, children, submit = "Save", className }: { action: Action; children: ReactNode; submit?: string; className?: string }) {
  const [state, run, pending] = useActionState<Result, FormData>(action, {});
  return (
    <form action={run} className={cx("space-y-4", className)}>
      {children}
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : submit}</button>
        {state.ok && <span className="text-sm font-medium text-success">{state.ok}</span>}
        {state.error && <span className="text-sm font-medium text-danger">{state.error}</span>}
      </div>
    </form>
  );
}

"use client";
import { useActionState } from "react";
import { login } from "../actions";
import { Logo } from "@/components/ui";

export default function AdminLogin() {
  const [state, action, pending] = useActionState(login, {});
  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface p-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <Logo />
        <h1 className="text-lg font-semibold">Admin sign in</h1>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" autoFocus />
        </div>
        {state.error && <p className="field-error">{state.error}</p>}
        <button className="btn-navy w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}

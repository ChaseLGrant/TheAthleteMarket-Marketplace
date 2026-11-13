"use client";
import type { ReactNode } from "react";

/** A GET form whose selects/checkboxes submit on change (works without JS too, via the button). */
export function AutoSubmitForm({ children, action, className }: { children: ReactNode; action: string; className?: string }) {
  return (
    <form
      action={action}
      className={className}
      onChange={(e) => {
        const t = e.target as HTMLElement;
        if (t.tagName === "SELECT" || (t as HTMLInputElement).type === "checkbox") (e.currentTarget as HTMLFormElement).requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

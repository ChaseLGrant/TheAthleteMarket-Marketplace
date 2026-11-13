"use client";
import { useState } from "react";
import { cx } from "@/lib/format";

export function RatingForm({ token, coachFirstName, alreadyRated }: { token: string; coachFirstName: string; alreadyRated: number | null }) {
  const [rating, setRating] = useState(0);
  const [again, setAgain] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(alreadyRated ? "done" : "idle");
  if (state === "done")
    return <p className="text-center text-sm font-medium text-success">Thanks for rating {coachFirstName}{alreadyRated ? ` (${alreadyRated}/5)` : ""}! Your feedback helps other families.</p>;
  return (
    <div className="space-y-4">
      <p className="text-center font-semibold">How helpful was {coachFirstName}&apos;s evaluation?</p>
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={cx("h-12 w-12 rounded-xl text-3xl transition", n <= rating ? "text-[#F5A524]" : "text-line hover:text-[#F5A524]/60")}>
            ★
          </button>
        ))}
      </div>
      {rating > 0 && (
        <>
          <div>
            <p className="label text-center">Would you get another evaluation?</p>
            <div className="grid grid-cols-2 gap-2">
              {([[true, "Yes"], [false, "Not right now"]] as const).map(([v, l]) => (
                <button key={l} type="button" onClick={() => setAgain(v)}
                  className={cx("min-h-11 rounded-xl border text-sm font-semibold", again === v ? "border-blue bg-blue-50 text-blue" : "border-line")}>{l}</button>
              ))}
            </div>
          </div>
          <textarea className="field" rows={2} maxLength={500} placeholder="Anything else? (optional, private)" value={comment} onChange={(e) => setComment(e.target.value)} />
          {state === "error" && <p className="field-error">Something went wrong. Please try again.</p>}
          <button className="btn-navy w-full" disabled={state === "busy"}
            onClick={async () => {
              setState("busy");
              const res = await fetch(`/api/delivery/${token}/rate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating, wouldBuyAgain: again, comment }) }).catch(() => null);
              setState(res?.ok ? "done" : "error");
            }}>
            {state === "busy" ? "Sending…" : "Send rating"}
          </button>
        </>
      )}
    </div>
  );
}

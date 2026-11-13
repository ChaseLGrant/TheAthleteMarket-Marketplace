import { NextResponse } from "next/server";
import { UserFacingError } from "./services/lifecycle";
import { log } from "./log";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function handleApiError(e: unknown) {
  if (e instanceof UserFacingError) {
    const status = e.code === "rate_limited" ? 429 : e.code === "not_found" ? 404 : e.code === "closed" || e.code === "expired" ? 409 : 400;
    return json({ error: e.message, code: e.code }, status);
  }
  log("error", "api error", { error: e instanceof Error ? e.stack ?? e.message : String(e) });
  return json({ error: "Something went wrong on our side. Please try again." }, 500);
}

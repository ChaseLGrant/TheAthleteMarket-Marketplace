"use client";

/** Host-specific "make sure the coach can open it" tip, shown as the family types. */
export function FilmTip({ url }: { url: string }) {
  let host = "";
  try { host = new URL(url).hostname; } catch { /* typing */ }
  const tip = host.includes("hudl")
    ? "Hudl: open your highlight → Share → copy the public link. Private team film can't be opened by coaches."
    : host.includes("drive.google") || host.includes("docs.google")
      ? "Google Drive: Share → General access → “Anyone with the link”."
      : host.includes("youtu")
        ? "YouTube: Unlisted or Public both work. Private won't."
        : host.includes("vimeo")
          ? "Vimeo: privacy must be “Anyone with the link”."
          : null;
  if (!tip) return <p className="hint">Hudl, YouTube, Vimeo or Google Drive. Make sure anyone with the link can view it.</p>;
  return <p className="mt-1 rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-navy">💡 {tip}</p>;
}

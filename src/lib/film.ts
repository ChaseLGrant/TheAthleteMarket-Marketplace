/** Returns a privacy-friendly embed URL for YouTube/Vimeo, or null (we then show a link). */
export function filmEmbedUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") return yt(u.pathname.slice(1));
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") return yt(u.searchParams.get("v"));
      const m = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{6,})/);
      if (m) return yt(m[2]!);
    }
    if (host === "vimeo.com") {
      const m = u.pathname.match(/^\/(\d+)/);
      if (m) return `https://player.vimeo.com/video/${m[1]}?dnt=1`;
    }
    return null;
  } catch {
    return null;
  }
}
function yt(id: string | null | undefined) {
  return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1` : null;
}
export function filmHost(raw: string): string {
  try { return new URL(raw).hostname.replace(/^www\./, ""); } catch { return "link"; }
}

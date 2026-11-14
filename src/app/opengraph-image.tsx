import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Coach Line by The Athlete Market — the direct line to college coaches";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  const logo = `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/brand/logo-white.png"))).toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", padding: 72, background: "radial-gradient(900px 500px at 100% 0%, rgba(31,95,255,.55), transparent 60%), #0A0D14", color: "white", fontFamily: "sans-serif" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} width={560} height={459} alt="" style={{ position: "absolute", right: -40, bottom: -60, opacity: 0.08 }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} width={98} height={80} alt="" />
            <div style={{ width: 2, height: 56, background: "rgba(255,255,255,.25)" }} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 5 }}>COACH LINE</div>
              <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: 4, color: "rgba(255,255,255,.55)" }}>BY THE ATHLETE MARKET</div>
            </div>
          </div>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, maxWidth: 900 }}>The direct line to college coaches.</div>
          <div style={{ fontSize: 30, color: "#C9D3EA" }}>Camp dates · events · what level you fit — answered or it&apos;s free</div>
        </div>
      </div>
    ),
    size,
  );
}

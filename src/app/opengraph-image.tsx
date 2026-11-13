import { ImageResponse } from "next/og";

export const alt = "The Athlete Market — college coach video evaluations";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg,#0B1B3F 0%,#13285a 60%,#1F5FFF 140%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ fontSize: 30, fontWeight: 700, display: "flex", gap: 12 }}>The Athlete Market <span style={{ color: "#8FB0FF", fontWeight: 500 }}>Evaluations</span></div>
        <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.08, maxWidth: 980 }}>Honest feedback on your film from a college-level coach.</div>
        <div style={{ fontSize: 30, color: "#C9D3EA" }}>30–60s personal video · Delivered in 7 days or a full refund</div>
      </div>
    ),
    size,
  );
}

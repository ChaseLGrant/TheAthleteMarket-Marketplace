import { NextResponse } from "next/server";
import { getDemo } from "@/lib/deps";
import { isDemoMode } from "@/lib/env";

const nope = () => new NextResponse("Not found", { status: 404 });

export async function PUT(req: Request) {
  if (!isDemoMode()) return nope();
  const u = new URL(req.url);
  const path = u.searchParams.get("path") ?? "";
  const demo = await getDemo();
  if (u.searchParams.get("sig") !== demo.storage.sig("up:" + path)) return new NextResponse("bad signature", { status: 403 });
  const data = Buffer.from(await req.arrayBuffer());
  demo.storage.files.set(path, { data, mime: (req.headers.get("content-type") ?? "video/mp4").split(";")[0]! });
  return NextResponse.json({ Key: path });
}

export async function GET(req: Request) {
  if (!isDemoMode()) return nope();
  const u = new URL(req.url);
  const path = u.searchParams.get("path") ?? "";
  const demo = await getDemo();
  if (u.searchParams.get("sig") !== demo.storage.sig("get:" + path)) return new NextResponse("bad signature", { status: 403 });
  const f = demo.storage.files.get(path);
  if (!f) return nope();
  // Range support: iOS Safari will not play video without it.
  const range = req.headers.get("range");
  const total = f.data.length;
  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    const start = m?.[1] ? Number(m[1]) : 0;
    const end = m?.[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    return new NextResponse(new Uint8Array(f.data.subarray(start, end + 1)), {
      status: 206,
      headers: { "Content-Type": f.mime, "Content-Range": `bytes ${start}-${end}/${total}`, "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Accept-Ranges": "bytes", "Content-Length": String(total) } });
}

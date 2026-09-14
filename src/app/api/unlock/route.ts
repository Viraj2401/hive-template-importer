import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, sha256Hex } from "@/proxy";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const given = String(form.get("password") ?? "");
  const next = String(form.get("next") ?? "/");
  const expected = process.env.DEMO_PASSWORD;
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!expected) return NextResponse.redirect(new URL(target, req.url), 303);
  if (given !== expected) {
    const url = new URL("/unlock", req.url);
    url.searchParams.set("next", target);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, 303);
  }
  const res = NextResponse.redirect(new URL(target, req.url), 303);
  res.cookies.set(COOKIE, await sha256Hex(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

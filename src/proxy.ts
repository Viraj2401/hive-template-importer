/**
 * Optional demo gate. When DEMO_PASSWORD is set, every page and API route
 * requires a cookie holding the SHA-256 of that password. When it is unset
 * the app is open. This keeps the public Vercel URL from being edited or
 * deleted by strangers without adding user accounts to a take-home.
 */
import { NextResponse, type NextRequest } from "next/server";

export const COOKIE = "demo_unlock";

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function proxy(req: NextRequest) {
  const password = process.env.DEMO_PASSWORD;
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname === "/unlock" || pathname === "/api/unlock" || pathname === "/api/lock") return NextResponse.next();

  const expected = await sha256Hex(password);
  if (req.cookies.get(COOKIE)?.value === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Locked. Unlock the demo at /unlock first." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

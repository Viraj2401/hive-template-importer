import { NextResponse, type NextRequest } from "next/server";
import { COOKIE } from "@/proxy";

/** Clears the demo cookie and returns to the unlock screen. */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/unlock", req.url), 303);
  res.cookies.set(COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

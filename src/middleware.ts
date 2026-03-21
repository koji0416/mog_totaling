import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "meta-dash-session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "default-secret-change-me-in-production"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ログインページと認証APIはスキップ
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  const isApi = pathname.startsWith("/api/");

  if (!token) {
    if (isApi) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, SECRET);
    return NextResponse.next();
  } catch {
    if (isApi) {
      return NextResponse.json({ error: "セッションが切れました" }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  }
}

export const config = {
  matcher: [
    // 静的ファイル・favicon・_next を除外
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

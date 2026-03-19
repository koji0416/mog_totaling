import { NextRequest, NextResponse } from "next/server";
import { createSession, validateCredentials, COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { username, password } = await request.json();

  if (!validateCredentials(username, password)) {
    return NextResponse.json(
      { error: "ユーザー名またはパスワードが正しくありません" },
      { status: 401 }
    );
  }

  const token = await createSession(username);

  const response = NextResponse.json({ success: true });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7日
    path: "/",
  });

  return response;
}

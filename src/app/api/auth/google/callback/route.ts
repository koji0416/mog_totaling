import { type NextRequest } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return new Response("認証コードがありません", { status: 400 });
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    || "http://localhost:3000/api/auth/google/callback";

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // トークンをHTTPOnly cookieに保存
    const cookieStore = await cookies();
    cookieStore.set("google_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30日
      path: "/",
    });

    // 認証完了後、メインページにリダイレクト
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || "http://localhost:3000";
    return Response.redirect(`${baseUrl}/?google_auth=success`);
  } catch (error) {
    console.error("Google OAuth error:", error);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
      || "http://localhost:3000";
    return Response.redirect(`${baseUrl}/?google_auth=error`);
  }
}

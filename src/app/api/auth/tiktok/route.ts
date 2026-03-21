import { NextResponse } from "next/server";

// MOGに送る認可URLを生成する
export async function GET() {
  const appId = process.env.TIKTOK_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { error: "TIKTOK_APP_ID が設定されていません" },
      { status: 500 }
    );
  }

  // TikTok Marketing API の認可URL
  const authUrl = new URL("https://business-api.tiktok.com/portal/auth");
  authUrl.searchParams.set("app_id", appId);
  authUrl.searchParams.set("state", "mog_tiktok_auth");
  authUrl.searchParams.set("redirect_uri", getRedirectUri());

  return NextResponse.json({ authUrl: authUrl.toString() });
}

function getRedirectUri(): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (base) {
    const origin = base.startsWith("http") ? base : `https://${base}`;
    return `${origin}/api/auth/tiktok/callback`;
  }
  return "http://localhost:3000/api/auth/tiktok/callback";
}

import { NextResponse } from "next/server";
import { fetchTikTokAdAccounts } from "@/lib/tiktok-api";

export async function GET() {
  try {
    const accounts = await fetchTikTokAdAccounts();
    return NextResponse.json({ accounts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TikTokアカウント取得に失敗しました" },
      { status: 500 }
    );
  }
}

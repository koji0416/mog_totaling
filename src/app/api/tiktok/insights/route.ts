import { NextRequest, NextResponse } from "next/server";
import {
  fetchTikTokCampaignReport,
  fetchTikTokCampaignDailyReport,
  fetchTikTokDailyReport,
} from "@/lib/tiktok-api";
import type { TikTokDailyMetrics, TikTokCampaignDailyMetrics } from "@/lib/tiktok-api";

// 30日超の場合、30日ごとにチャンクに分割
function splitInto30DayChunks(startDate: string, endDate: string): { startDate: string; endDate: string }[] {
  const chunks: { startDate: string; endDate: string }[] = [];
  const end = new Date(endDate + "T00:00:00");
  let current = new Date(startDate + "T00:00:00");

  while (current <= end) {
    const chunkEnd = new Date(current);
    chunkEnd.setDate(chunkEnd.getDate() + 29);
    const actualEnd = chunkEnd > end ? end : chunkEnd;

    const fmt = (d: Date) => d.toISOString().split("T")[0];
    chunks.push({ startDate: fmt(current), endDate: fmt(actualEnd) });

    current = new Date(actualEnd);
    current.setDate(current.getDate() + 1);
  }

  return chunks;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const advertiserId = params.get("advertiserId");
  const mode = params.get("mode") || "campaign";
  const since = params.get("since");
  const until = params.get("until");

  if (!advertiserId || !since || !until) {
    return NextResponse.json(
      { error: "advertiserId, since, until が必要です" },
      { status: 400 }
    );
  }

  try {
    if (mode === "campaign_daily") {
      const chunks = splitInto30DayChunks(since, until);
      const results = await Promise.all(
        chunks.map((c) => fetchTikTokCampaignDailyReport(advertiserId, c.startDate, c.endDate))
      );
      const campaignDaily: TikTokCampaignDailyMetrics[] = results.flat();
      return NextResponse.json({ campaignDaily });
    } else if (mode === "daily") {
      const chunks = splitInto30DayChunks(since, until);
      const results = await Promise.all(
        chunks.map((c) => fetchTikTokDailyReport(advertiserId, c.startDate, c.endDate))
      );
      const daily: TikTokDailyMetrics[] = results.flat();
      return NextResponse.json({ daily });
    } else {
      const insights = await fetchTikTokCampaignReport(
        advertiserId,
        since,
        until
      );
      return NextResponse.json({ insights });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "TikTokデータ取得に失敗しました" },
      { status: 500 }
    );
  }
}

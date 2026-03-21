import { type NextRequest } from "next/server";
import { fetchAccountInsights, fetchCampaignDailyInsights, fetchDailyInsights } from "@/lib/meta-api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accountId = searchParams.get("accountId");
  const mode = searchParams.get("mode") || "campaign";
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  if (!accountId || !since || !until) {
    return Response.json(
      { error: "accountId, since, until パラメータが必要です" },
      { status: 400 }
    );
  }

  try {
    if (mode === "campaign_daily") {
      const campaignDaily = await fetchCampaignDailyInsights(accountId, since, until);
      return Response.json({ campaignDaily });
    } else if (mode === "daily") {
      const daily = await fetchDailyInsights(accountId, since, until);
      return Response.json({ daily });
    } else {
      const insights = await fetchAccountInsights(accountId, since, until);
      return Response.json({ insights });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return Response.json({ error: message }, { status: 500 });
  }
}

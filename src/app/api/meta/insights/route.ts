import { type NextRequest } from "next/server";
import { fetchAccountInsights, fetchDailyInsights } from "@/lib/meta-api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const accountId = searchParams.get("accountId");
  const datePreset = searchParams.get("datePreset") || "last_7d";
  const mode = searchParams.get("mode") || "campaign"; // "campaign" or "daily"

  if (!accountId) {
    return Response.json(
      { error: "accountId パラメータが必要です" },
      { status: 400 }
    );
  }

  try {
    if (mode === "daily") {
      const daily = await fetchDailyInsights(accountId, datePreset);
      return Response.json({ daily });
    } else {
      const insights = await fetchAccountInsights(accountId, datePreset);
      return Response.json({ insights });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return Response.json({ error: message }, { status: 500 });
  }
}

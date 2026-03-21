import { type NextRequest } from "next/server";
import { fetchCampaignDailyInsights } from "@/lib/meta-api";
import { fetchCatsMediaDaily } from "@/lib/cats-api";

// Vercelのタイムアウトを300秒に延長（CATS日別取得は日数分のHTTPリクエストが必要）
export const maxDuration = 300;
import {
  parseCodeFromCampaignName,
  parseCatsMediaName,
} from "@/lib/project-matcher";
import { createServerSupabase } from "@/lib/supabase";

// GET: Supabaseからキャッシュ済みデータを読み込み
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("projectId");
  const since = sp.get("since");
  const until = sp.get("until");
  const codeFilter = sp.get("code"); // null=全コード合計, 数値=特定コードのみ

  if (!projectId || !since || !until) {
    return Response.json(
      { error: "projectId, since, until は必須です" },
      { status: 400 }
    );
  }

  const supabase = createServerSupabase();

  // daily_ad_data と daily_cats_data を並行取得
  let adQuery = supabase
    .from("daily_ad_data")
    .select("date, code, spend, impressions, clicks")
    .eq("project_id", projectId)
    .gte("date", since)
    .lte("date", until)
    .order("date");

  let catsQuery = supabase
    .from("daily_cats_data")
    .select("date, code, mcv, cv")
    .eq("project_id", projectId)
    .gte("date", since)
    .lte("date", until)
    .order("date");

  // コードフィルター適用
  if (codeFilter !== null) {
    const code = parseInt(codeFilter, 10);
    if (!isNaN(code)) {
      adQuery = adQuery.eq("code", code);
      catsQuery = catsQuery.eq("code", code);
    }
  }

  const overrideQuery = supabase
    .from("daily_revenue_overrides")
    .select("date, revenue")
    .eq("project_id", projectId)
    .gte("date", since)
    .lte("date", until);

  const [adRes, catsRes, overrideRes] = await Promise.all([adQuery, catsQuery, overrideQuery]);

  if (adRes.error) {
    return Response.json({ error: adRes.error.message }, { status: 500 });
  }
  if (catsRes.error) {
    return Response.json({ error: catsRes.error.message }, { status: 500 });
  }

  // 売上オーバーライドマップ
  const revenueOverrides = new Map<string, number>();
  for (const row of overrideRes.data || []) {
    revenueOverrides.set(row.date, Number(row.revenue));
  }

  // 日別に集計
  const byDate = new Map<
    string,
    {
      codes: Set<number>;
      spend: number;
      impressions: number;
      clicks: number;
      mcv: number;
      cv: number;
    }
  >();

  for (const row of adRes.data || []) {
    const d = byDate.get(row.date) || {
      codes: new Set(),
      spend: 0,
      impressions: 0,
      clicks: 0,
      mcv: 0,
      cv: 0,
    };
    d.codes.add(row.code);
    d.spend += Number(row.spend) || 0;
    d.impressions += row.impressions || 0;
    d.clicks += row.clicks || 0;
    byDate.set(row.date, d);
  }

  for (const row of catsRes.data || []) {
    const d = byDate.get(row.date) || {
      codes: new Set(),
      spend: 0,
      impressions: 0,
      clicks: 0,
      mcv: 0,
      cv: 0,
    };
    d.codes.add(row.code);
    d.mcv += row.mcv || 0;
    d.cv += row.cv || 0;
    byDate.set(row.date, d);
  }

  // 期間内の全日を生成
  const rows = generateDateRange(since, until).map((date) => {
    const d = byDate.get(date);
    const revenueOverride = revenueOverrides.get(date);
    return {
      date,
      codes: d ? [...d.codes].sort((a, b) => a - b) : [],
      spend: d?.spend || 0,
      impressions: d?.impressions || 0,
      clicks: d?.clicks || 0,
      mcv: d?.mcv || 0,
      cv: d?.cv || 0,
      revenueOverride: revenueOverride ?? null,
    };
  });

  return Response.json({ rows });
}

// PATCH: 売上オーバーライドを保存/削除
export async function PATCH(request: NextRequest) {
  try {
    const { projectId, date, revenue } = await request.json();
    if (!projectId || !date) {
      return Response.json({ error: "projectId, date は必須です" }, { status: 400 });
    }

    const supabase = createServerSupabase();

    if (revenue === null || revenue === undefined || revenue === "") {
      // 削除
      await supabase
        .from("daily_revenue_overrides")
        .delete()
        .eq("project_id", projectId)
        .eq("date", date);
      return Response.json({ deleted: true });
    }

    // upsert
    const { error } = await supabase
      .from("daily_revenue_overrides")
      .upsert(
        { project_id: projectId, date, revenue: Number(revenue) },
        { onConflict: "project_id,date" }
      );
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ saved: true, revenue: Number(revenue) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Meta/CATS APIからデータ取得 → Supabaseに保存 → 返却
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      projectId,
      metaAccountId,
      metaAccountIds,
      codes,
      catsMediaNames,
      since,
      until,
    } = body as {
      projectId: string;
      metaAccountId?: string;       // 後方互換
      metaAccountIds?: string[];    // 新: 複数アカウント
      codes: number[];
      catsMediaNames: string[];
      since: string;
      until: string;
    };

    if (!projectId || !since || !until) {
      return Response.json(
        { error: "projectId, since, until は必須です" },
        { status: 400 }
      );
    }

    // 使用するMetaアカウントIDリスト（新旧互換）
    const accountIds: string[] = metaAccountIds && metaAccountIds.length > 0
      ? metaAccountIds
      : metaAccountId ? [metaAccountId] : [];

    // CATS媒体名→コード番号マップ
    const catsNameToCode = new Map<string, number>();
    for (const name of catsMediaNames) {
      const parsed = parseCatsMediaName(name);
      if (parsed) catsNameToCode.set(name, parsed.code);
    }
    const catsMediaSet = new Set(catsMediaNames);

    // Meta API（複数アカウント並行取得） + CATS API を並行取得
    const [metaCampaignDailyArrays, catsDailyAll] = await Promise.all([
      accountIds.length > 0
        ? Promise.all(accountIds.map((id) => fetchCampaignDailyInsights(id, since, until)))
        : Promise.resolve([]),
      catsMediaNames.length > 0
        ? fetchCatsMediaDaily(since, until)
        : Promise.resolve([]),
    ]);
    const metaCampaignDaily = metaCampaignDailyArrays.flat();

    const supabase = createServerSupabase();

    // --- daily_ad_data に保存 ---
    // Metaデータを コード×日別 で合算（同じコードに複数キャンペーンがある場合がある）
    const adAggMap = new Map<
      string,
      { spend: number; impressions: number; clicks: number; campaignNames: string[] }
    >();

    for (const row of metaCampaignDaily) {
      const code = parseCodeFromCampaignName(row.campaignName);
      if (code === null || !codes.includes(code)) continue;
      const key = `${row.date}__${code}`;
      const existing = adAggMap.get(key) || {
        spend: 0,
        impressions: 0,
        clicks: 0,
        campaignNames: [],
      };
      existing.spend += row.spend;
      existing.impressions += row.impressions;
      existing.clicks += row.clicks;
      existing.campaignNames.push(row.campaignName);
      adAggMap.set(key, existing);
    }

    const adRows = [...adAggMap.entries()].map(([key, val]) => {
      const [date, codeStr] = key.split("__");
      return {
        project_id: projectId,
        date,
        code: parseInt(codeStr, 10),
        spend: val.spend,
        impressions: val.impressions,
        clicks: val.clicks,
        campaign_name: val.campaignNames.join(" / "),
      };
    });

    // 取得できた日付だけ削除→再insert（取得できなかった日は既存データを維持）
    const adDates = [...new Set(adRows.map((r) => r.date))];
    for (const date of adDates) {
      await supabase
        .from("daily_ad_data")
        .delete()
        .eq("project_id", projectId)
        .eq("date", date);
    }

    for (let i = 0; i < adRows.length; i += 50) {
      const batch = adRows.slice(i, i + 50);
      const { error } = await supabase.from("daily_ad_data").insert(batch);
      if (error) console.error("daily_ad_data insert error:", error.message);
    }

    // --- daily_cats_data に保存 ---
    // コード×日別で合算
    const catsAggMap = new Map<
      string,
      { mcv: number; cv: number; mediaNames: string[] }
    >();

    for (const row of catsDailyAll) {
      if (!catsMediaSet.has(row.mediaName)) continue;
      const code = catsNameToCode.get(row.mediaName);
      if (code === undefined) continue;
      const key = `${row.date}__${code}`;
      const existing = catsAggMap.get(key) || { mcv: 0, cv: 0, mediaNames: [] };
      existing.mcv += row.clicks;  // CATSの「クリック数」= ExcelのMCV
      existing.cv += row.cv;
      existing.mediaNames.push(row.mediaName);
      catsAggMap.set(key, existing);
    }

    const catsRows = [...catsAggMap.entries()].map(([key, val]) => {
      const [date, codeStr] = key.split("__");
      return {
        project_id: projectId,
        date,
        code: parseInt(codeStr, 10),
        mcv: val.mcv,
        cv: val.cv,
        media_name: val.mediaNames.join(" / "),
      };
    });

    // 取得できた日付だけ削除→再insert
    const catsDates = [...new Set(catsRows.map((r) => r.date))];
    for (const date of catsDates) {
      await supabase
        .from("daily_cats_data")
        .delete()
        .eq("project_id", projectId)
        .eq("date", date);
    }

    for (let i = 0; i < catsRows.length; i += 50) {
      const batch = catsRows.slice(i, i + 50);
      const { error } = await supabase.from("daily_cats_data").insert(batch);
      if (error) console.error("daily_cats_data insert error:", error.message);
    }

    // 保存したデータを日別集計して返却
    const byDate = new Map<
      string,
      {
        codes: Set<number>;
        spend: number;
        impressions: number;
        clicks: number;
        mcv: number;
        cv: number;
      }
    >();

    for (const r of adRows) {
      const d = byDate.get(r.date) || {
        codes: new Set(),
        spend: 0,
        impressions: 0,
        clicks: 0,
        mcv: 0,
        cv: 0,
      };
      d.codes.add(r.code);
      d.spend += r.spend;
      d.impressions += r.impressions;
      d.clicks += r.clicks;
      byDate.set(r.date, d);
    }

    for (const r of catsRows) {
      const d = byDate.get(r.date) || {
        codes: new Set(),
        spend: 0,
        impressions: 0,
        clicks: 0,
        mcv: 0,
        cv: 0,
      };
      d.codes.add(r.code);
      d.mcv += r.mcv;
      d.cv += r.cv;
      byDate.set(r.date, d);
    }

    const rows = generateDateRange(since, until).map((date) => {
      const d = byDate.get(date);
      return {
        date,
        codes: d ? [...d.codes].sort((a, b) => a - b) : [],
        spend: d?.spend || 0,
        impressions: d?.impressions || 0,
        clicks: d?.clicks || 0,
        mcv: d?.mcv || 0,
        cv: d?.cv || 0,
      };
    });

    return Response.json({
      rows,
      synced: { adRows: adRows.length, catsRows: catsRows.length },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return Response.json({ error: message }, { status: 500 });
  }
}

function generateDateRange(since: string, until: string): string[] {
  const dates: string[] = [];
  const start = new Date(since + "T00:00:00");
  const end = new Date(until + "T00:00:00");
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

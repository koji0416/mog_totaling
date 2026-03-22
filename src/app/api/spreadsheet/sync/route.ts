import { type NextRequest } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase";
import { fetchCampaignDailyInsights } from "@/lib/meta-api";
import { fetchCatsMediaDaily } from "@/lib/cats-api";
import {
  parseCodeFromCampaignName,
  parseCatsMediaName,
  discoverProjects,
  type DiscoveredProject,
} from "@/lib/project-matcher";
import { fetchAdAccounts } from "@/lib/meta-api";
import { fetchCatsMediaNames } from "@/lib/cats-api";
import {
  createOAuth2Client,
  extractSpreadsheetId,
  getSheetList,
  shouldSkipSheet,
  parseSheetName,
  getCodeColumnMap,
  getDateRowMap,
  CODE_SECTION_OFFSETS,
  colToLetter,
  batchUpdateValues,
  type CellUpdate,
} from "@/lib/google-sheets";

export const maxDuration = 300;

// GET: Google認証状態の確認
export async function GET() {
  const cookieStore = await cookies();
  const tokensCookie = cookieStore.get("google_tokens");
  return Response.json({ authenticated: !!tokensCookie });
}

// POST: 全案件同期 → スプレッドシート書き込み
export async function POST(request: NextRequest) {
  try {
    const { spreadsheetUrl, since, until } = await request.json();

    if (!spreadsheetUrl || !since || !until) {
      return Response.json(
        { error: "spreadsheetUrl, since, until は必須です" },
        { status: 400 }
      );
    }

    // Google認証トークン取得
    const cookieStore = await cookies();
    const tokensCookie = cookieStore.get("google_tokens");
    if (!tokensCookie) {
      return Response.json(
        { error: "Google認証が必要です", needsAuth: true },
        { status: 401 }
      );
    }

    const tokens = JSON.parse(tokensCookie.value);
    const oauth2Client = createOAuth2Client(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    // スプレッドシートID抽出
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return Response.json(
        { error: "無効なスプレッドシートURLです" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // ===== Step 1: 案件自動検出 =====
    const [metaAccounts, catsMediaNamesList] = await Promise.all([
      fetchAdAccounts(),
      fetchCatsMediaNames(since, until),
    ]);
    const discoveredProjects = discoverProjects(metaAccounts, catsMediaNamesList);

    // Supabaseの保存済みプロジェクトを取得
    const { data: savedProjects, error: projError } = await supabase
      .from("projects")
      .select("*");

    if (projError) {
      return Response.json({ error: projError.message }, { status: 500 });
    }

    // discoveredProject → savedProject のマッピングを作成
    function findSavedProject(dp: DiscoveredProject) {
      const expectedClientMenu = dp.clientMenu;
      return (savedProjects || []).find((s) => {
        const savedCM = s.menu_name && s.menu_name !== "-"
          ? s.client_name + "_" + s.menu_name
          : s.client_name;
        return (
          savedCM === expectedClientMenu &&
          (s.bizmanager_name || "").toLowerCase() === dp.bizmanager.toLowerCase() &&
          s.platform === dp.platform
        );
      });
    }

    // ===== Step 2: 全案件のMeta/CATSデータ同期 =====
    // CATSは日付範囲に対して1回だけ取得（全媒体分が返る）
    const catsDailyAll = await fetchCatsMediaDaily(since, until);

    let syncedCount = 0;
    let syncErrors: string[] = [];

    for (const dp of discoveredProjects) {
      const saved = findSavedProject(dp);
      if (!saved) continue;

      try {
        // Meta API取得
        const accountIds = dp.metaAccountIds;
        const metaCampaignDailyArrays = accountIds.length > 0
          ? await Promise.all(accountIds.map((id) => fetchCampaignDailyInsights(id, since, until)))
          : [];
        const metaCampaignDaily = metaCampaignDailyArrays.flat();

        // CATS媒体名→コード番号マップ
        const catsNameToCode = new Map<string, number>();
        for (const name of dp.catsMediaNames) {
          const parsed = parseCatsMediaName(name);
          if (parsed) catsNameToCode.set(name, parsed.code);
        }
        const catsMediaSet = new Set(dp.catsMediaNames);

        // --- daily_ad_data に保存 ---
        const adAggMap = new Map<
          string,
          { spend: number; impressions: number; clicks: number; campaignNames: string[] }
        >();

        for (const row of metaCampaignDaily) {
          const code = parseCodeFromCampaignName(row.campaignName);
          if (code === null || !dp.codes.includes(code)) continue;
          const key = `${row.date}__${code}`;
          const existing = adAggMap.get(key) || { spend: 0, impressions: 0, clicks: 0, campaignNames: [] };
          existing.spend += row.spend;
          existing.impressions += row.impressions;
          existing.clicks += row.clicks;
          existing.campaignNames.push(row.campaignName);
          adAggMap.set(key, existing);
        }

        const adRows = [...adAggMap.entries()].map(([key, val]) => {
          const [date, codeStr] = key.split("__");
          return {
            project_id: saved.id,
            date,
            code: parseInt(codeStr, 10),
            spend: val.spend,
            impressions: val.impressions,
            clicks: val.clicks,
            campaign_name: val.campaignNames.join(" / "),
          };
        });

        const adDates = [...new Set(adRows.map((r) => r.date))];
        for (const date of adDates) {
          await supabase.from("daily_ad_data").delete()
            .eq("project_id", saved.id).eq("date", date);
        }
        for (let i = 0; i < adRows.length; i += 50) {
          await supabase.from("daily_ad_data").insert(adRows.slice(i, i + 50));
        }

        // --- daily_cats_data に保存 ---
        const catsAggMap = new Map<string, { mcv: number; cv: number; mediaNames: string[] }>();
        for (const row of catsDailyAll) {
          if (!catsMediaSet.has(row.mediaName)) continue;
          const code = catsNameToCode.get(row.mediaName);
          if (code === undefined) continue;
          const key = `${row.date}__${code}`;
          const existing = catsAggMap.get(key) || { mcv: 0, cv: 0, mediaNames: [] };
          existing.mcv += row.clicks; // CATSの「クリック数」= MCV
          existing.cv += row.cv;
          existing.mediaNames.push(row.mediaName);
          catsAggMap.set(key, existing);
        }

        const catsRows = [...catsAggMap.entries()].map(([key, val]) => {
          const [date, codeStr] = key.split("__");
          return {
            project_id: saved.id,
            date,
            code: parseInt(codeStr, 10),
            mcv: val.mcv,
            cv: val.cv,
            media_name: val.mediaNames.join(" / "),
          };
        });

        const catsDates = [...new Set(catsRows.map((r) => r.date))];
        for (const date of catsDates) {
          await supabase.from("daily_cats_data").delete()
            .eq("project_id", saved.id).eq("date", date);
        }
        for (let i = 0; i < catsRows.length; i += 50) {
          await supabase.from("daily_cats_data").insert(catsRows.slice(i, i + 50));
        }

        syncedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "不明なエラー";
        syncErrors.push(`${dp.clientMenu}: ${msg}`);
      }
    }

    // ===== Step 3: スプレッドシートに書き込み =====
    const sheetList = await getSheetList(sheets, spreadsheetId);
    const sheetNames = sheetList.map((s) => s.title);
    const sheetIdMap = new Map(sheetList.map((s) => [s.title, s.sheetId]));

    // プロジェクト一覧を再取得（同期後の最新データを使うため）
    const { data: freshProjects } = await supabase.from("projects").select("*");

    const results: {
      sheetName: string;
      status: "matched" | "skipped" | "no_match" | "no_data" | "error";
      projectName?: string;
      cellsWritten?: number;
      error?: string;
    }[] = [];

    for (const sheetName of sheetNames) {
      if (shouldSkipSheet(sheetName)) {
        results.push({ sheetName, status: "skipped" });
        continue;
      }

      const parsed = parseSheetName(sheetName);
      if (!parsed) {
        results.push({ sheetName, status: "no_match" });
        continue;
      }

      const matchedProject = findMatchingProject(
        freshProjects || [],
        parsed.clientName,
        parsed.menuName,
        parsed.bizmanagerName,
        parsed.platform
      );

      if (!matchedProject) {
        results.push({ sheetName, status: "no_match" });
        continue;
      }

      try {
        const codeColMap = await getCodeColumnMap(sheets, spreadsheetId, sheetName);
        if (codeColMap.size === 0) {
          results.push({
            sheetName, status: "no_data",
            projectName: `${matchedProject.client_name}_${matchedProject.menu_name}`,
          });
          continue;
        }

        const dateRowMap = await getDateRowMap(sheets, spreadsheetId, sheetName);
        const codes = [...codeColMap.keys()];

        const [adRes, catsRes] = await Promise.all([
          supabase
            .from("daily_ad_data")
            .select("date, code, spend, impressions, clicks")
            .eq("project_id", matchedProject.id)
            .gte("date", since)
            .lte("date", until)
            .in("code", codes),
          supabase
            .from("daily_cats_data")
            .select("date, code, mcv, cv")
            .eq("project_id", matchedProject.id)
            .gte("date", since)
            .lte("date", until)
            .in("code", codes),
        ]);

        if (adRes.error || catsRes.error) {
          results.push({
            sheetName, status: "error",
            error: adRes.error?.message || catsRes.error?.message,
          });
          continue;
        }

        const updates: CellUpdate[] = [];
        const sid = sheetIdMap.get(sheetName) || 0;

        function addUpdate(col: number, dateRow: number, value: number) {
          updates.push({
            range: `'${sheetName}'!${colToLetter(col)}${dateRow}`,
            value,
            sheetId: sid,
            row: dateRow - 1,
            col,
          });
        }

        for (const row of adRes.data || []) {
          const dateRow = dateRowMap.get(row.date);
          const codeCol = codeColMap.get(row.code);
          if (dateRow === undefined || codeCol === undefined) continue;
          addUpdate(codeCol + CODE_SECTION_OFFSETS.adSpend, dateRow, Math.round(row.spend));
          addUpdate(codeCol + CODE_SECTION_OFFSETS.imp, dateRow, row.impressions);
          addUpdate(codeCol + CODE_SECTION_OFFSETS.clicks, dateRow, row.clicks);
        }

        for (const row of catsRes.data || []) {
          const dateRow = dateRowMap.get(row.date);
          const codeCol = codeColMap.get(row.code);
          if (dateRow === undefined || codeCol === undefined) continue;
          addUpdate(codeCol + CODE_SECTION_OFFSETS.mcv, dateRow, row.mcv);
          addUpdate(codeCol + CODE_SECTION_OFFSETS.cv, dateRow, row.cv);
        }

        if (updates.length > 0) {
          await batchUpdateValues(sheets, spreadsheetId, updates);
        }

        results.push({
          sheetName,
          status: "matched",
          projectName: `${matchedProject.client_name}_${matchedProject.menu_name}`,
          cellsWritten: updates.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "不明なエラー";
        results.push({ sheetName, status: "error", error: msg });
      }
    }

    const matched = results.filter((r) => r.status === "matched");

    return Response.json({
      success: true,
      summary: {
        total: sheetNames.length,
        matched: matched.length,
        skipped: results.filter((r) => r.status === "skipped").length,
        noMatch: results.filter((r) => r.status === "no_match").length,
        errors: results.filter((r) => r.status === "error").length,
        totalCells: matched.reduce((sum, r) => sum + (r.cellsWritten || 0), 0),
        syncedProjects: syncedCount,
        syncErrors: syncErrors.length,
      },
      syncErrors: syncErrors.length > 0 ? syncErrors : undefined,
      results,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    console.error("Spreadsheet sync error:", error);
    return Response.json({ error: message }, { status: 500 });
  }
}

// プロジェクトマッチング
function findMatchingProject(
  projects: Array<{
    id: string;
    client_name: string;
    menu_name: string;
    platform: string;
    bizmanager_name: string | null;
  }>,
  clientName: string,
  menuName: string | null,
  bizmanagerName: string | null,
  platform: string
) {
  const normalize = (s: string | null | undefined) =>
    (s || "").toLowerCase().replace(/\d+$/, "").trim();

  const suffixes = ["クリニック", "サロン", "ラボ", "エステ", "美容外科", "皮膚科"];
  const removeSuffix = (s: string) => {
    const lower = s.toLowerCase();
    for (const sf of suffixes) {
      if (lower.endsWith(sf.toLowerCase())) return lower.slice(0, -sf.length);
    }
    return lower;
  };

  for (const p of projects) {
    if (p.platform !== platform) continue;

    const pBiz = normalize(p.bizmanager_name);
    const sBiz = normalize(bizmanagerName);
    const bizMatch =
      (!pBiz && !sBiz) ||
      pBiz === sBiz ||
      pBiz.includes(sBiz) ||
      sBiz.includes(pBiz);
    if (!bizMatch) continue;

    const pClient = p.client_name.toLowerCase();
    const sClient = clientName.toLowerCase();
    const clientMatch =
      pClient === sClient ||
      pClient.includes(sClient) ||
      sClient.includes(pClient) ||
      removeSuffix(pClient) === removeSuffix(sClient) ||
      (removeSuffix(pClient).length >= 2 &&
        removeSuffix(sClient).length >= 2 &&
        (removeSuffix(pClient).includes(removeSuffix(sClient)) ||
          removeSuffix(sClient).includes(removeSuffix(pClient))));
    if (!clientMatch) continue;

    const pMenu = (p.menu_name || "-").toLowerCase();
    const sMenu = (menuName || "").toLowerCase();
    if (!sMenu || sMenu === "-" || !pMenu || pMenu === "-") return p;

    const menuMatch =
      pMenu === sMenu ||
      pMenu.includes(sMenu) ||
      sMenu.includes(pMenu) ||
      normalize(pMenu) === normalize(sMenu);
    if (menuMatch) return p;
  }

  return null;
}

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

export const maxDuration = 60; // 無料プラン上限

// GET: Google認証状態の確認
export async function GET() {
  const cookieStore = await cookies();
  const tokensCookie = cookieStore.get("google_tokens");
  return Response.json({ authenticated: !!tokensCookie });
}

// POST: マッチ案件のみ同期 → スプレッドシート書き込み
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
    const sheetsApi = google.sheets({ version: "v4", auth: oauth2Client });

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    if (!spreadsheetId) {
      return Response.json(
        { error: "無効なスプレッドシートURLです" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();

    // ===== Step 1: シート名取得 + 案件検出を並列実行 =====
    const [sheetList, metaAccounts, catsMediaNamesList, projRes] = await Promise.all([
      getSheetList(sheetsApi, spreadsheetId),
      fetchAdAccounts(),
      fetchCatsMediaNames(since, until),
      supabase.from("projects").select("*"),
    ]);

    if (projRes.error) {
      return Response.json({ error: projRes.error.message }, { status: 500 });
    }

    const sheetNames = sheetList.map((s) => s.title);
    const sheetIdMap = new Map(sheetList.map((s) => [s.title, s.sheetId]));
    const discoveredProjects = discoverProjects(metaAccounts, catsMediaNamesList);
    const savedProjects = projRes.data || [];

    // discoveredProject → savedProject のマッピング
    function findSavedProject(dp: DiscoveredProject) {
      return savedProjects.find((s) => {
        const savedCM = s.menu_name && s.menu_name !== "-"
          ? s.client_name + "_" + s.menu_name
          : s.client_name;
        return (
          savedCM === dp.clientMenu &&
          (s.bizmanager_name || "").toLowerCase() === dp.bizmanager.toLowerCase() &&
          s.platform === dp.platform
        );
      });
    }

    // ===== Step 2: シート名→プロジェクトマッチング（同期対象の特定）=====
    // まずどの案件が必要か特定し、必要な案件だけ同期する
    const sheetsToProcess: {
      sheetName: string;
      parsed: ReturnType<typeof parseSheetName>;
      matchedSaved: typeof savedProjects[number];
      matchedDiscovered: DiscoveredProject | undefined;
    }[] = [];

    const neededProjectIds = new Set<string>();

    for (const sheetName of sheetNames) {
      if (shouldSkipSheet(sheetName)) continue;
      const parsed = parseSheetName(sheetName);
      if (!parsed) continue;

      const matchedSaved = findMatchingProject(
        savedProjects,
        parsed.clientName,
        parsed.menuName,
        parsed.bizmanagerName,
        parsed.platform
      );
      if (!matchedSaved) continue;

      // 対応するdiscoveredProjectを探す（同期に必要な情報を持つ）
      const matchedDiscovered = discoveredProjects.find((dp) => {
        const saved = findSavedProject(dp);
        return saved && saved.id === matchedSaved.id;
      });

      sheetsToProcess.push({ sheetName, parsed, matchedSaved, matchedDiscovered });
      neededProjectIds.add(matchedSaved.id);
    }

    // ===== Step 3: 必要な案件のみMeta/CATS同期（並列）=====
    const catsDailyAll = await fetchCatsMediaDaily(since, until);

    let syncedCount = 0;
    const syncErrors: string[] = [];

    // 同期対象のdiscoveredProjectsを特定（重複排除）
    const projectsToSync = new Map<string, { saved: typeof savedProjects[number]; discovered: DiscoveredProject }>();
    for (const s of sheetsToProcess) {
      if (s.matchedDiscovered && !projectsToSync.has(s.matchedSaved.id)) {
        projectsToSync.set(s.matchedSaved.id, {
          saved: s.matchedSaved,
          discovered: s.matchedDiscovered,
        });
      }
    }

    // Meta APIを全案件並列で取得
    const syncPromises = [...projectsToSync.values()].map(async ({ saved, discovered }) => {
      try {
        const accountIds = discovered.metaAccountIds;
        const metaCampaignDailyArrays = accountIds.length > 0
          ? await Promise.all(accountIds.map((id) => fetchCampaignDailyInsights(id, since, until)))
          : [];
        const metaCampaignDaily = metaCampaignDailyArrays.flat();

        const catsNameToCode = new Map<string, number>();
        for (const name of discovered.catsMediaNames) {
          const parsed = parseCatsMediaName(name);
          if (parsed) catsNameToCode.set(name, parsed.code);
        }
        const catsMediaSet = new Set(discovered.catsMediaNames);

        // daily_ad_data
        const adAggMap = new Map<string, { spend: number; impressions: number; clicks: number; campaignNames: string[] }>();
        for (const row of metaCampaignDaily) {
          const code = parseCodeFromCampaignName(row.campaignName);
          if (code === null || !discovered.codes.includes(code)) continue;
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
            project_id: saved.id, date,
            code: parseInt(codeStr, 10),
            spend: val.spend, impressions: val.impressions, clicks: val.clicks,
            campaign_name: val.campaignNames.join(" / "),
          };
        });

        // daily_cats_data
        const catsAggMap = new Map<string, { mcv: number; cv: number; mediaNames: string[] }>();
        for (const row of catsDailyAll) {
          if (!catsMediaSet.has(row.mediaName)) continue;
          const code = catsNameToCode.get(row.mediaName);
          if (code === undefined) continue;
          const key = `${row.date}__${code}`;
          const existing = catsAggMap.get(key) || { mcv: 0, cv: 0, mediaNames: [] };
          existing.mcv += row.clicks;
          existing.cv += row.cv;
          existing.mediaNames.push(row.mediaName);
          catsAggMap.set(key, existing);
        }

        const catsRows = [...catsAggMap.entries()].map(([key, val]) => {
          const [date, codeStr] = key.split("__");
          return {
            project_id: saved.id, date,
            code: parseInt(codeStr, 10),
            mcv: val.mcv, cv: val.cv,
            media_name: val.mediaNames.join(" / "),
          };
        });

        // Supabaseに保存（日付ごとにdelete→insert）
        const allDates = new Set([...adRows.map((r) => r.date), ...catsRows.map((r) => r.date)]);
        await Promise.all([...allDates].map(async (date) => {
          await Promise.all([
            supabase.from("daily_ad_data").delete().eq("project_id", saved.id).eq("date", date),
            supabase.from("daily_cats_data").delete().eq("project_id", saved.id).eq("date", date),
          ]);
        }));

        if (adRows.length > 0) {
          for (let i = 0; i < adRows.length; i += 50) {
            await supabase.from("daily_ad_data").insert(adRows.slice(i, i + 50));
          }
        }
        if (catsRows.length > 0) {
          for (let i = 0; i < catsRows.length; i += 50) {
            await supabase.from("daily_cats_data").insert(catsRows.slice(i, i + 50));
          }
        }

        syncedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "不明なエラー";
        syncErrors.push(`${discovered.clientMenu}: ${msg}`);
      }
    });

    await Promise.all(syncPromises);

    // ===== Step 4: スプレッドシートに書き込み =====
    const results: {
      sheetName: string;
      status: "matched" | "skipped" | "no_match" | "no_data" | "error";
      projectName?: string;
      cellsWritten?: number;
      error?: string;
      debug?: string;
    }[] = [];

    for (const sheetName of sheetNames) {
      if (shouldSkipSheet(sheetName)) {
        results.push({ sheetName, status: "skipped" });
        continue;
      }

      const entry = sheetsToProcess.find((s) => s.sheetName === sheetName);
      if (!entry) {
        results.push({ sheetName, status: "no_match" });
        continue;
      }

      const { matchedSaved } = entry;

      try {
        const codeColMap = await getCodeColumnMap(sheetsApi, spreadsheetId, sheetName);
        if (codeColMap.size === 0) {
          results.push({
            sheetName, status: "no_data",
            projectName: `${matchedSaved.client_name}_${matchedSaved.menu_name}`,
          });
          continue;
        }

        const dateRowMap = await getDateRowMap(sheetsApi, spreadsheetId, sheetName);
        const codes = [...codeColMap.keys()];

        const [adRes, catsRes] = await Promise.all([
          supabase
            .from("daily_ad_data")
            .select("date, code, spend, impressions, clicks")
            .eq("project_id", matchedSaved.id)
            .gte("date", since).lte("date", until)
            .in("code", codes),
          supabase
            .from("daily_cats_data")
            .select("date, code, mcv, cv")
            .eq("project_id", matchedSaved.id)
            .gte("date", since).lte("date", until)
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
            value, sheetId: sid,
            row: dateRow - 1, col,
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
          await batchUpdateValues(sheetsApi, spreadsheetId, updates);
        }

        results.push({
          sheetName, status: "matched",
          projectName: `${matchedSaved.client_name}_${matchedSaved.menu_name}`,
          cellsWritten: updates.length,
          debug: updates.length === 0 ? `codes:[${codes}] dates:${dateRowMap.size} ad:${adRes.data?.length} cats:${catsRes.data?.length} sample:[${[...dateRowMap.keys()].slice(0,3)}]` : undefined,
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

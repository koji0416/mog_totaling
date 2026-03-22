import { type NextRequest } from "next/server";
import { google } from "googleapis";
import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase";
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

// POST: スプレッドシートにデータを書き込み
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

    // シート名一覧取得
    const sheetList = await getSheetList(sheets, spreadsheetId);
    const sheetNames = sheetList.map((s) => s.title);
    const sheetIdMap = new Map(sheetList.map((s) => [s.title, s.sheetId]));

    // Supabaseから全プロジェクト取得
    const supabase = createServerSupabase();
    const { data: projects, error: projError } = await supabase
      .from("projects")
      .select("*");

    if (projError) {
      return Response.json({ error: projError.message }, { status: 500 });
    }

    const results: {
      sheetName: string;
      status: "matched" | "skipped" | "no_match" | "no_data" | "error";
      projectId?: string;
      projectName?: string;
      cellsWritten?: number;
      error?: string;
      debug?: {
        biz: string;
        codesFound: number[];
        datesFound: number;
        adRows: number;
        catsRows: number;
        sampleDates: string[];
        adUpdates: number;
        catsUpdates: number;
        adCode2Dates: string[];
      };
    }[] = [];

    // 各シートを処理
    for (const sheetName of sheetNames) {
      // スキップ判定
      if (shouldSkipSheet(sheetName)) {
        results.push({ sheetName, status: "skipped" });
        continue;
      }

      // シート名パース
      const parsed = parseSheetName(sheetName);
      if (!parsed) {
        results.push({ sheetName, status: "no_match" });
        continue;
      }

      // プロジェクトマッチング
      const matchedProject = findMatchingProject(
        projects || [],
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
        // コード列マッピング取得
        const codeColMap = await getCodeColumnMap(
          sheets,
          spreadsheetId,
          sheetName
        );

        if (codeColMap.size === 0) {
          results.push({
            sheetName,
            status: "no_data",
            projectId: matchedProject.id,
            projectName: `${matchedProject.client_name}_${matchedProject.menu_name}`,
          });
          continue;
        }

        // 日付→行マッピング取得
        const dateRowMap = await getDateRowMap(
          sheets,
          spreadsheetId,
          sheetName
        );

        // Supabaseからコード別日別データ取得
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
            sheetName,
            status: "error",
            error: adRes.error?.message || catsRes.error?.message,
          });
          continue;
        }

        // セル更新リスト作成
        const updates: CellUpdate[] = [];
        const sid = sheetIdMap.get(sheetName) || 0;

        // ヘルパー: CellUpdateを作成
        function addUpdate(col: number, dateRow: number, value: number) {
          updates.push({
            range: `'${sheetName}'!${colToLetter(col)}${dateRow}`,
            value,
            sheetId: sid,
            row: dateRow - 1, // 0-based
            col,              // 0-based
          });
        }

        // 広告データ（コード×日別）
        for (const row of adRes.data || []) {
          const dateRow = dateRowMap.get(row.date);
          const codeCol = codeColMap.get(row.code);
          if (dateRow === undefined || codeCol === undefined) continue;

          addUpdate(codeCol + CODE_SECTION_OFFSETS.adSpend, dateRow, Math.round(row.spend));
          addUpdate(codeCol + CODE_SECTION_OFFSETS.imp, dateRow, row.impressions);
          addUpdate(codeCol + CODE_SECTION_OFFSETS.clicks, dateRow, row.clicks);
        }

        // CATSデータ（コード×日別）
        for (const row of catsRes.data || []) {
          const dateRow = dateRowMap.get(row.date);
          const codeCol = codeColMap.get(row.code);
          if (dateRow === undefined || codeCol === undefined) continue;

          addUpdate(codeCol + CODE_SECTION_OFFSETS.mcv, dateRow, row.mcv);
          addUpdate(codeCol + CODE_SECTION_OFFSETS.cv, dateRow, row.cv);
        }

        // バッチ書き込み
        if (updates.length > 0) {
          await batchUpdateValues(sheets, spreadsheetId, updates);
        }

        const adUpdates = updates.filter((u) => u.range.includes("ad") === false).length;
        results.push({
          sheetName,
          status: "matched",
          projectId: matchedProject.id,
          projectName: `${matchedProject.client_name}_${matchedProject.menu_name}`,
          cellsWritten: updates.length,
          debug: {
            biz: matchedProject.bizmanager_name || "",
            codesFound: [...codeColMap.keys()],
            datesFound: dateRowMap.size,
            adRows: adRes.data?.length || 0,
            catsRows: catsRes.data?.length || 0,
            sampleDates: [...dateRowMap.keys()].slice(0, 3),
            adUpdates: updates.filter((_, idx) => idx < updates.length - (catsRes.data?.length || 0) * 2).length,
            catsUpdates: (catsRes.data?.length || 0) * 2,
            // AD code2のdateRowマッチ状態
            adCode2Dates: (adRes.data || [])
              .filter((r) => r.code === 2)
              .map((r) => `${r.date}:row${dateRowMap.get(r.date) ?? "?"}`)
              .slice(0, 5),
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "不明なエラー";
        results.push({ sheetName, status: "error", error: msg });
      }
    }

    const matched = results.filter((r) => r.status === "matched");
    const noMatch = results.filter((r) => r.status === "no_match");

    return Response.json({
      success: true,
      summary: {
        total: sheetNames.length,
        matched: matched.length,
        skipped: results.filter((r) => r.status === "skipped").length,
        noMatch: noMatch.length,
        errors: results.filter((r) => r.status === "error").length,
        totalCells: matched.reduce((sum, r) => sum + (r.cellsWritten || 0), 0),
      },
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
// シート名から抽出した情報をSupabaseのprojectsと照合
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
  // 正規化関数
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
    // プラットフォーム一致チェック
    if (p.platform !== platform) continue;

    // ビジマネ名チェック
    const pBiz = normalize(p.bizmanager_name);
    const sBiz = normalize(bizmanagerName);

    // ビジマネ名が両方空 or 一致
    const bizMatch =
      (!pBiz && !sBiz) ||
      pBiz === sBiz ||
      pBiz.includes(sBiz) ||
      sBiz.includes(pBiz);
    if (!bizMatch) continue;

    // クライアント名チェック
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

    // メニュー名チェック
    const pMenu = (p.menu_name || "-").toLowerCase();
    const sMenu = (menuName || "").toLowerCase();

    // メニューなしのケース
    if (!sMenu || sMenu === "-" || !pMenu || pMenu === "-") {
      return p; // クライアント+ビジマネが一致すればOK
    }

    const menuMatch =
      pMenu === sMenu ||
      pMenu.includes(sMenu) ||
      sMenu.includes(pMenu) ||
      normalize(pMenu) === normalize(sMenu);
    if (menuMatch) return p;
  }

  return null;
}

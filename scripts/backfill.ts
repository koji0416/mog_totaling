/**
 * 過去データ一括同期スクリプト
 *
 * 使い方:
 *   npx tsx scripts/backfill.ts --since 2026-02-01 --until 2026-03-22
 *
 * ローカル実行なのでタイムアウトなし。
 * .env.local の環境変数を使用。
 */

import * as dotenv from "dotenv";
import * as path from "path";

// .env.local を読み込み
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchAdAccounts, fetchCampaignDailyInsights } from "../src/lib/meta-api";
import { fetchCatsMediaDaily, fetchCatsMediaNames, fetchMogMappings } from "../src/lib/cats-api";
import {
  discoverProjects,
  parseCodeFromCampaignName,
  parseCatsMediaName,
} from "../src/lib/project-matcher";
import { createServerSupabase } from "../src/lib/supabase";

async function main() {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf("--since");
  const untilIdx = args.indexOf("--until");

  if (sinceIdx === -1 || untilIdx === -1) {
    console.error("使い方: npx tsx scripts/backfill.ts --since 2026-02-01 --until 2026-03-22");
    process.exit(1);
  }

  const since = args[sinceIdx + 1];
  const until = args[untilIdx + 1];

  console.log(`=== バックフィル: ${since} 〜 ${until} ===\n`);

  // Step 1: 案件検出
  console.log("案件を検出中...");
  const [metaAccounts, catsMediaNamesList] = await Promise.all([
    fetchAdAccounts(),
    fetchCatsMediaNames(since, until),
  ]);

  const discovered = discoverProjects(metaAccounts, catsMediaNamesList);
  console.log(`  ${discovered.length} 案件を検出\n`);

  // Step 2: Supabaseの保存済みプロジェクト取得
  const supabase = createServerSupabase();
  const { data: savedProjects, error: projError } = await supabase
    .from("projects")
    .select("*");

  if (projError) {
    console.error("プロジェクト取得エラー:", projError.message);
    process.exit(1);
  }

  // マッチング
  function findSaved(dp: typeof discovered[number]) {
    return (savedProjects || []).find((s) => {
      const savedCM =
        s.menu_name && s.menu_name !== "-"
          ? s.client_name + "_" + s.menu_name
          : s.client_name;
      return (
        savedCM === dp.clientMenu &&
        (s.bizmanager_name || "").toLowerCase() === dp.bizmanager.toLowerCase() &&
        s.platform === dp.platform
      );
    });
  }

  // Step 3: CATSデータ一括取得（全媒体）+ MOGマッピング
  console.log("CATSデータを取得中...");
  const catsDailyAll = await fetchCatsMediaDaily(since, until);
  console.log(`  CATS: ${catsDailyAll.length} 行取得`);

  let mogMappings: Awaited<ReturnType<typeof fetchMogMappings>> = [];
  try {
    mogMappings = await fetchMogMappings(since, until);
    console.log(`  MOGマッピング: ${mogMappings.length} 件取得\n`);
  } catch {
    console.log("  MOGマッピング取得失敗（スキップ）\n");
  }

  // Step 4: 各案件を同期
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const dp of discovered) {
    const saved = findSaved(dp);
    if (!saved) {
      skipped++;
      continue;
    }

    const label = `${dp.clientMenu} [${dp.bizmanager}] (${dp.platform})`;
    process.stdout.write(`同期中: ${label} ... `);

    try {
      // Meta API取得
      const accountIds = dp.metaAccountIds;
      const metaCampaignDailyArrays = accountIds.length > 0
        ? await Promise.all(
            accountIds.map((id) => fetchCampaignDailyInsights(id, since, until))
          )
        : [];
      const metaCampaignDaily = metaCampaignDailyArrays.flat();

      // CATS媒体名→コード
      const catsNameToCode = new Map<string, number>();
      for (const name of dp.catsMediaNames) {
        const parsed = parseCatsMediaName(name);
        if (parsed) catsNameToCode.set(name, parsed.code);
      }
      const catsMediaSet = new Set(dp.catsMediaNames);

      // daily_ad_data
      const adAggMap = new Map<
        string,
        { spend: number; impressions: number; clicks: number; campaignNames: string[] }
      >();
      for (const row of metaCampaignDaily) {
        const code = parseCodeFromCampaignName(row.campaignName);
        if (code === null || !dp.codes.includes(code)) continue;
        const key = `${row.date}__${code}`;
        const existing = adAggMap.get(key) || {
          spend: 0, impressions: 0, clicks: 0, campaignNames: [],
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
          project_id: saved.id, date,
          code: parseInt(codeStr, 10),
          spend: val.spend, impressions: val.impressions, clicks: val.clicks,
          campaign_name: val.campaignNames.join(" / "),
        };
      });

      // daily_cats_data（通常 + MOG共有ピクセル）
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
        existing.mcv += row.clicks;
        existing.cv += row.cv;
        existing.mediaNames.push(row.mediaName);
        catsAggMap.set(key, existing);
      }

      // MOG共有ピクセル: 広告主名でマッチ
      const clientName = saved.client_name.toLowerCase();
      for (const mog of mogMappings) {
        if (mog.advertiserName.toLowerCase() !== clientName) continue;
        const mogCodeMatch = mog.mediaName.match(/^MOG_(\d+)$/);
        if (!mogCodeMatch) continue;
        const mogCode = parseInt(mogCodeMatch[1], 10);
        const today = new Date().toISOString().split("T")[0];
        if (today < since || today > until) continue;
        const key = `${today}__${mogCode}`;
        const existing = catsAggMap.get(key) || { mcv: 0, cv: 0, mediaNames: [] };
        existing.mcv += mog.clicks;
        existing.cv += mog.cv;
        existing.mediaNames.push(`${mog.mediaName}(${mog.advertiserName})`);
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

      // Supabaseに保存
      const allDates = new Set([
        ...adRows.map((r) => r.date),
        ...catsRows.map((r) => r.date),
      ]);

      for (const date of allDates) {
        await Promise.all([
          supabase.from("daily_ad_data").delete()
            .eq("project_id", saved.id).eq("date", date),
          supabase.from("daily_cats_data").delete()
            .eq("project_id", saved.id).eq("date", date),
        ]);
      }

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

      console.log(`AD:${adRows.length} CATS:${catsRows.length}`);
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "不明なエラー";
      console.log(`エラー: ${msg}`);
      errors++;
    }
  }

  console.log(`\n=== 完了 ===`);
  console.log(`  同期: ${synced} / スキップ: ${skipped} / エラー: ${errors}`);
  console.log(`\nスプレッドシートへの反映は、ダッシュボードの「スプレッドシート反映」から`);
  console.log(`日付範囲を ${since} 〜 ${until} に設定して実行してください。`);
}

main().catch((err) => {
  console.error("致命的エラー:", err);
  process.exit(1);
});

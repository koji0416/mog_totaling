import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { google } from "googleapis";
import { createServerSupabase } from "../src/lib/supabase";
import {
  getSheetList,
  getCodeColumnMap,
  getDateRowMap,
} from "../src/lib/google-sheets";
import * as fs from "fs";

async function main() {
  // Google認証（cookieからトークンは取れないので、直接テスト用にシートを読む）
  // まずシートのデータをGoogle Sheets APIで確認
  // ここではSupabaseのデータとシートの構造を確認

  const supabase = createServerSupabase();

  // IBクリニックの3/19データ
  const pid = "aa413995-9cb4-4919-baa2-33d7843b6ee9";
  const ad = await supabase
    .from("daily_ad_data")
    .select("*")
    .eq("project_id", pid)
    .gte("date", "2026-03-19")
    .lte("date", "2026-03-22");

  console.log("=== Supabase ADデータ ===");
  for (const r of ad.data || []) {
    console.log(`  ${r.date} code=${r.code} spend=${r.spend}`);
  }

  const cats = await supabase
    .from("daily_cats_data")
    .select("*")
    .eq("project_id", pid)
    .gte("date", "2026-03-19")
    .lte("date", "2026-03-22");

  console.log("\n=== Supabase CATSデータ ===");
  for (const r of cats.data || []) {
    console.log(`  ${r.date} code=${r.code} mcv=${r.mcv} cv=${r.cv}`);
  }

  // Supabaseの.in()フィルターのテスト
  // コード[1]でフィルター
  const adFiltered = await supabase
    .from("daily_ad_data")
    .select("date, code, spend")
    .eq("project_id", pid)
    .gte("date", "2026-03-19")
    .lte("date", "2026-03-22")
    .in("code", [1]);

  console.log("\n=== .in('code', [1]) フィルター結果 ===");
  console.log(`  ${adFiltered.data?.length}件`, adFiltered.data);
}

main().catch(console.error);

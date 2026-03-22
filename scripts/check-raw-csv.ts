import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchCatsMediaDaily } from "../src/lib/cats-api";

async function main() {
  console.log("3/22のCATSデータ取得中...\n");
  const rows = await fetchCatsMediaDaily("2026-03-22", "2026-03-22");

  console.log(`全${rows.length}行\n`);

  // MOG含む行を全フィールド表示
  console.log("=== MOG含む行（全フィールド） ===");
  for (const r of rows) {
    if (r.mediaName.includes("MOG")) {
      console.log(JSON.stringify({
        mediaName: r.mediaName,
        category1: r.category1,
        category2: r.category2,
        advertiserName: r.advertiserName,
        adName: r.adName,
        clicks: r.clicks,
        middleClicks: r.middleClicks,
        cv: r.cv,
      }, null, 2));
      console.log("---");
    }
  }

  // 広告名が空でない行のうち、媒体名にクライアント名がないものを表示
  console.log("\n=== 広告名が入っている全行サンプル ===");
  let ct = 0;
  for (const r of rows) {
    if (r.adName && r.adName.trim()) {
      console.log(`  媒体名:[${r.mediaName}] 広告名:[${r.adName}] clicks=${r.clicks} cv=${r.cv}`);
      ct++;
      if (ct >= 30) break;
    }
  }
  if (ct === 0) {
    console.log("  広告名が入っている行はありません");
  }
}

main().catch(console.error);

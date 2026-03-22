import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchCatsMediaDaily } from "../src/lib/cats-api";

async function main() {
  console.log("CATSデータ取得中（過去7日）...\n");
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - 7);
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  const rows = await fetchCatsMediaDaily(fmt(since), fmt(now));

  // ピラティスK関連
  console.log("=== ピラティス含む行 ===");
  for (const r of rows.filter(r => r.mediaName.includes("ピラティス") || r.adName.includes("ピラティス"))) {
    console.log(`  媒体名: [${r.mediaName}]  広告名: [${r.adName}]  clicks=${r.clicks} cv=${r.cv} date=${r.date}`);
  }

  // MOG媒体名（汎用パターン）
  console.log("\n=== MOG含む媒体名 ===");
  let ct = 0;
  for (const r of rows) {
    if (r.mediaName.includes("MOG") && !r.mediaName.includes("_API】")) {
      console.log(`  媒体名: [${r.mediaName}]  広告名: [${r.adName}]  clicks=${r.clicks} cv=${r.cv}`);
      ct++;
      if (ct >= 20) break;
    }
  }

  // 広告名にクライアント名が入ってるが媒体名にない行
  console.log("\n=== 媒体名が空 or 汎用で広告名にクライアント名がある行 ===");
  ct = 0;
  for (const r of rows) {
    if (!r.mediaName.startsWith("【") && r.adName.trim()) {
      console.log(`  媒体名: [${r.mediaName}]  広告名: [${r.adName}]  clicks=${r.clicks} cv=${r.cv}`);
      ct++;
      if (ct >= 20) break;
    }
  }

  console.log(`\n合計: ${rows.length} 行`);
}

main().catch(console.error);

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchCatsMediaDaily } from "../src/lib/cats-api";

async function main() {
  const rows = await fetchCatsMediaDaily("2026-03-22", "2026-03-22");
  console.log(`全${rows.length}行\n`);

  console.log("=== MOG_01行 ===");
  for (const r of rows.filter(r => r.mediaName === "MOG_01")) {
    console.log(`  媒体:[${r.mediaName}] 広告主:[${r.advertiserName}] 広告名:[${r.adName}] clicks=${r.clicks} cv=${r.cv}`);
  }

  console.log("\n=== ピラティス含む行 ===");
  for (const r of rows) {
    if (r.mediaName.includes("ピラティス") || r.adName.includes("ピラティス") || r.advertiserName.includes("ピラティス")) {
      console.log(`  媒体:[${r.mediaName}] 広告主:[${r.advertiserName}] 広告名:[${r.adName}] clicks=${r.clicks}`);
    }
  }
}

main().catch(console.error);

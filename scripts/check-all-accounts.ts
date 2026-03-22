import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchAdAccounts } from "../src/lib/meta-api";
import { fetchCatsMediaNames } from "../src/lib/cats-api";
import { discoverProjects } from "../src/lib/project-matcher";

async function main() {
  const [meta, cats] = await Promise.all([
    fetchAdAccounts(),
    fetchCatsMediaNames("2026-02-01", "2026-03-22"),
  ]);

  const projects = discoverProjects(meta, cats);

  // 複数Metaアカウントが紐づいている案件を表示
  console.log("=== 複数Metaアカウントが紐づいた案件 ===\n");
  let found = false;
  for (const p of projects) {
    if (p.metaAccountIds.length >= 2) {
      found = true;
      console.log(`${p.clientMenu} [${p.bizmanager}] (${p.platform})`);
      console.log(`  metaAccountIds: ${p.metaAccountIds.length}件`);
      for (const id of p.metaAccountIds) {
        const acc = meta.find((a) => a.id === id);
        console.log(`    ${id}: ${acc?.name || "?"} (biz: ${acc?.businessName || "?"})`);
      }
    }
  }
  if (!found) console.log("なし - 全案件1アカウントのみ");
}

main().catch(console.error);

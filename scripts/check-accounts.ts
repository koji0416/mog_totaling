import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchAdAccounts } from "../src/lib/meta-api";
import { fetchCatsMediaNames } from "../src/lib/cats-api";
import { discoverProjects } from "../src/lib/project-matcher";

async function main() {
  const [meta, cats] = await Promise.all([
    fetchAdAccounts(),
    fetchCatsMediaNames("2026-02-01", "2026-02-28"),
  ]);

  const projects = discoverProjects(meta, cats);

  // シーズ・ラボ関連を全部出す
  for (const p of projects.filter((p) => p.clientMenu.includes("シーズ"))) {
    console.log(`\n${p.clientMenu} [${p.bizmanager}] (${p.platform})`);
    console.log(`  metaAccountIds: ${JSON.stringify(p.metaAccountIds)}`);
    console.log(`  codes: ${p.codes}`);
    console.log(`  catsMediaNames: ${p.catsMediaNames}`);
  }

  // Metaアカウントでシーズ関連を確認
  console.log("\n=== Metaアカウント（シーズ関連） ===");
  for (const a of meta.filter((a) => a.name.includes("シーズ"))) {
    console.log(`  ${a.id}: ${a.name} (biz: ${a.businessName})`);
  }
}

main().catch(console.error);

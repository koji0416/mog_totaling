import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchCatsMediaNames } from "../src/lib/cats-api";
import { parseCatsMediaName, discoverProjects } from "../src/lib/project-matcher";
import { fetchAdAccounts } from "../src/lib/meta-api";

async function main() {
  const [meta, cats] = await Promise.all([
    fetchAdAccounts(),
    fetchCatsMediaNames("2026-02-01", "2026-03-22"),
  ]);

  console.log("=== ビューティス CATS媒体名 ===");
  for (const name of cats.filter((n) => n.includes("ビューティス"))) {
    const parsed = parseCatsMediaName(name);
    console.log(`  ${name} → body=${parsed?.body} code=${parsed?.code}`);
  }

  const projects = discoverProjects(meta, cats);
  console.log("\n=== ビューティス 検出案件 ===");
  for (const p of projects.filter((p) => p.clientMenu.includes("ビューティス"))) {
    console.log(`\n${p.clientMenu} [${p.bizmanager}] (${p.platform})`);
    console.log(`  accounts: ${p.metaAccountIds.length}件`);
    for (const id of p.metaAccountIds) {
      const acc = meta.find((a) => a.id === id);
      console.log(`    ${acc?.name} (${acc?.businessName})`);
    }
  }
}

main().catch(console.error);

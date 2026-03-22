import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchAdAccounts } from "../src/lib/meta-api";
import { fetchCatsMediaNames } from "../src/lib/cats-api";
import { discoverProjects } from "../src/lib/project-matcher";

async function main() {
  const [meta, cats] = await Promise.all([
    fetchAdAccounts(),
    fetchCatsMediaNames("2026-03-01", "2026-03-22"),
  ]);
  console.log("Metaアカウント数:", meta.length);
  console.log("CATS媒体名数:", cats.length);
  const projects = discoverProjects(meta, cats);
  console.log("検出案件数:", projects.length);
}

main().catch((e) => console.error(e.message));

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { fetchAdAccounts } from "../src/lib/meta-api";

async function main() {
  const meta = await fetchAdAccounts();
  console.log("ピラティス:");
  for (const a of meta.filter(a => a.name.includes("ピラティス"))) {
    console.log(`  ${a.id}: ${a.name} (${a.businessName})`);
  }
  console.log("\nPBP:");
  for (const a of meta.filter(a => a.name.includes("PBP"))) {
    console.log(`  ${a.id}: ${a.name} (${a.businessName})`);
  }
}

main().catch(console.error);

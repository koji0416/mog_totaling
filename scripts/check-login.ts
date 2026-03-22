import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { login } from "../src/lib/cats-api";

async function main() {
  const cookie = await login();
  console.log("login() returned:", cookie);

  // admin check
  const r1 = await fetch("https://ad.ad-mogra.com/admin/", {
    headers: { Cookie: cookie, "User-Agent": "Mozilla/5.0" },
    redirect: "manual",
  });
  console.log("/admin/ status:", r1.status);

  // CSV endpoint check (POST)
  const r2 = await fetch("https://ad.ad-mogra.com/admin/profilecontentmedia/list/csv", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      "User-Agent": "Mozilla/5.0",
    },
    body: "searchDate=2026%2F03%2F22%20-%202026%2F03%2F22&effectKey=1",
    redirect: "manual",
  });
  console.log("CSV POST status:", r2.status);
  console.log("CSV content-type:", r2.headers.get("content-type"));
}

main().catch(console.error);

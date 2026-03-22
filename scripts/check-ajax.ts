import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { login } from "../src/lib/cats-api";

const BASE_URL = "https://ad.ad-mogra.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

async function main() {
  const cookie = await login();
  console.log("ログイン成功\n");

  const partnerId = process.env.CATS_PARTNER_ID!;
  const date = "2026/03/22";
  const searchDate = `${date} - ${date}`;

  // レポートページを開く
  await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA },
  });

  // AJAX POSTで広告名を含むデータを取得
  const ajaxBody: Record<string, string> = {
    draw: "1",
    start: "0",
    length: "500",
    "search[value]": "",
    "search[regex]": "false",
    "order[0][column]": "5",
    "order[0][dir]": "desc",
    searchDate,
    effectKey: "1",
    searchPartnerId: partnerId,
    "profilecontentmedia::effectKeyPartner": "1",
    "profilecontentmedia::effectKeyPartnerCategory": "1",
    "profilecontentmedia::effectKeyPartnerCategory2": "1",
    "profilecontentmedia::effectKeyClient": "1",
    "profilecontentmedia::effectKeyContent": "1",
    "profilecontentmedia::effectKeyGroup": "0",
    "profilecontentmedia::clickCount": "1",
    "profilecontentmedia::middleClickCount": "1",
    "profilecontentmedia::ctr": "1",
    "profilecontentmedia::cvrCl": "1",
    "profilecontentmedia::cvrMcl": "1",
    "profilecontentmedia::actionCount": "1",
    "profilecontentmedia::amount": "1",
    "profilecontentmedia::actionReward": "1",
    "profilecontentmedia::graph": "1",
  };
  const bodyStr = Object.entries(ajaxBody)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(`${BASE_URL}/admin/profilecontentmedia/list?${bodyStr}`, {
    headers: {
      Cookie: cookie,
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
    },
  });

  const json = await res.json();

  // 構造を確認
  console.log("トップレベルキー:", Object.keys(json));
  console.log("recordsTotal:", json.recordsTotal);
  console.log("recordsFiltered:", json.recordsFiltered);
  console.log("data件数:", json.data?.length);

  // 最初の行の構造を確認
  if (json.data && json.data.length > 0) {
    console.log("\n=== 最初の行 ===");
    console.log(JSON.stringify(json.data[0], null, 2));

    // MOG行を探す
    console.log("\n=== MOG_01行 ===");
    for (const row of json.data) {
      const rowStr = JSON.stringify(row);
      if (rowStr.includes("MOG_01") && !rowStr.includes("_API】")) {
        console.log(JSON.stringify(row, null, 2));
        break;
      }
    }

    // ピラティスK行を探す
    console.log("\n=== ピラティスK行 ===");
    for (const row of json.data) {
      const rowStr = JSON.stringify(row);
      if (rowStr.includes("ピラティス")) {
        console.log(JSON.stringify(row, null, 2));
        break;
      }
    }
  }
}

main().catch(console.error);

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

  const date = "2026/03/22";
  const searchDate = `${date} - ${date}`;
  const partnerId = process.env.CATS_PARTNER_ID!;

  // Step 1: GETでレポートページを開く
  await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA },
  });

  // Step 2: AJAX POSTで表示設定をセット（ブラウザの動作を再現）
  const displayParams: Record<string, string> = {
    draw: "1",
    start: "0",
    length: "100",
    "search[value]": "",
    "search[regex]": "false",
    "order[0][column]": "5",
    "order[0][dir]": "desc",
    searchDate,
    effectKey: "1",
    searchPartnerId: partnerId,
    // 内訳キー（チェックボックス）
    "profilecontentmedia::effectKeyPartner": "1",
    "profilecontentmedia::effectKeyPartnerCategory": "1",
    "profilecontentmedia::effectKeyPartnerCategory2": "1",
    "profilecontentmedia::effectKeyClient": "1",
    "profilecontentmedia::effectKeyContent": "1",  // ← 広告名
    "profilecontentmedia::effectKeyGroup": "0",
    // 表示カラム
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

  const bodyStr = Object.entries(displayParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const ajaxRes = await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
    },
    body: bodyStr,
  });
  console.log("AJAX status:", ajaxRes.status);

  // AJAXレスポンスの一部を確認
  const ajaxText = await ajaxRes.text();
  console.log("AJAX response length:", ajaxText.length);
  if (ajaxText.includes("広告名") || ajaxText.includes("adName")) {
    console.log("→ AJAXレスポンスに広告名データあり");
  } else {
    console.log("→ AJAXレスポンスに広告名データなし");
  }
  // MOG_01がAJAXに含まれるか
  if (ajaxText.includes("MOG_01")) {
    const idx = ajaxText.indexOf("MOG_01");
    console.log("MOG_01周辺:", ajaxText.substring(Math.max(0, idx - 50), idx + 200));
  }

  // Step 3: CSV取得（DataTablesパラメータなし、表示設定のみ）
  const csvParams: Record<string, string> = {
    partnerDataCnt: "4902",
    partnerCategoryDataCnt: "10",
    contentDataCnt: "1858",
    clientDataCnt: "284",
    groupDataCnt: "141",
    searchDate,
    "order[0][column]": "5",
    "order[0][dir]": "desc",
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
  const csvBody = Object.entries(csvParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")
    + "&effectKey=1";

  const csvRes = await fetch(`${BASE_URL}/admin/profilecontentmedia/list/csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      "User-Agent": UA,
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
      Origin: BASE_URL,
    },
    body: csvBody,
  });

  console.log("\nCSV status:", csvRes.status);
  console.log("CSV content-type:", csvRes.headers.get("content-type"));

  const buffer = await csvRes.arrayBuffer();
  const text = new TextDecoder("shift-jis").decode(buffer);
  const lines = text.split("\n").filter(l => l.trim());

  console.log(`CSV行数: ${lines.length - 1}`);
  console.log("ヘッダー:", lines[0].substring(0, 200));

  // MOG行
  console.log("\n=== MOG行 ===");
  for (const l of lines.slice(1)) {
    if (l.includes("MOG_0") || l.includes("MOG_1") || l.includes("MOG_2")) {
      console.log(l.substring(0, 300));
    }
  }
}

main().catch(console.error);

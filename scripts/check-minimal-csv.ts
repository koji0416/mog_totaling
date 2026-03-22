import * as dotenv from "dotenv";
import * as path from "path";
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

  // === loadReportPageと同じ手順を踏む ===

  // Step 1: GETでレポートページを開く
  await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA, Referer: `${BASE_URL}/admin/` },
  });

  // Step 2: DataTables AJAX（loadReportPageと同じ）
  const ajaxBody: Record<string, string> = {
    draw: "1", start: "0", length: "100",
    "search[value]": "", "search[regex]": "false",
    "order[0][column]": "5", "order[0][dir]": "desc",
    searchDate, effectKey: "1", searchPartnerId: partnerId,
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
  const ajaxQs = Object.entries(ajaxBody)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
  await fetch(`${BASE_URL}/admin/profilecontentmedia/list?${ajaxQs}`, {
    headers: {
      Cookie: cookie, "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
    },
  });

  // === ここまでloadReportPageと同じ ===

  // Step 3: CSV取得（buildCsvPayloadと同じbody）
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
    .join("&") + "&effectKey=1";

  const csvRes = await fetch(`${BASE_URL}/admin/profilecontentmedia/list/csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie, "User-Agent": UA,
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
      Origin: BASE_URL,
    },
    body: csvBody,
  });

  console.log("CSV status:", csvRes.status);
  console.log("CSV content-type:", csvRes.headers.get("content-type"));

  const buf = await csvRes.arrayBuffer();
  const text = new TextDecoder("shift-jis").decode(buf);
  const lines = text.split("\n").filter(l => l.trim());
  console.log("行数:", lines.length - 1);
  console.log("ヘッダー:", lines[0]?.substring(0, 300));
  console.log();

  for (const l of lines.slice(1)) {
    if (l.includes("MOG_01") && !l.includes("_API】")) {
      console.log("MOG_01:", l.substring(0, 400));
    }
  }

  // === effectKeyContent を "0" に変更して比較 ===
  console.log("\n=== effectKeyContent=0 の場合 ===");
  const csvParams2 = { ...csvParams, "profilecontentmedia::effectKeyContent": "0" };
  const csvBody2 = Object.entries(csvParams2)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&") + "&effectKey=1";

  const csvRes2 = await fetch(`${BASE_URL}/admin/profilecontentmedia/list/csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie, "User-Agent": UA,
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
      Origin: BASE_URL,
    },
    body: csvBody2,
  });
  const buf2 = await csvRes2.arrayBuffer();
  const text2 = new TextDecoder("shift-jis").decode(buf2);
  const lines2 = text2.split("\n").filter(l => l.trim());
  console.log("行数:", lines2.length - 1);
  console.log("ヘッダー:", lines2[0]?.substring(0, 300));
}

main().catch(console.error);

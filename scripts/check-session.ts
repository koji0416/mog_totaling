import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { login } from "../src/lib/cats-api";

const BASE_URL = "https://ad.ad-mogra.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

async function main() {
  const cookie = await login();
  console.log("ログイン成功");

  const partnerId = process.env.CATS_PARTNER_ID!;
  const date = "2026/03/22";
  const searchDate = `${date} - ${date}`;

  // Step 1: ページをGETで開く（初期セッション確立）
  const pageRes = await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA, Referer: `${BASE_URL}/admin/` },
  });
  console.log("ページGET status:", pageRes.status);
  const pageHtml = await pageRes.text();
  // ページ内のフォームやhidden inputを確認
  const csrfMatch = pageHtml.match(/name="csrf[_-]?token"\s+value="([^"]+)"/i);
  const tokenMatch = pageHtml.match(/name="_?token"\s+value="([^"]+)"/i);
  console.log("CSRFトークン:", csrfMatch?.[1] || "なし");
  console.log("他トークン:", tokenMatch?.[1] || "なし");

  // Step 2: AJAXリクエスト（基本パラメータのみ）
  const ajaxParams: Record<string, string> = {
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
  };

  const qs = Object.entries(ajaxParams)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  // GETで試す
  const ajaxGetRes = await fetch(`${BASE_URL}/admin/profilecontentmedia/list?${qs}`, {
    headers: {
      Cookie: cookie, "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
    },
  });
  console.log("\nAJAX GET status:", ajaxGetRes.status);
  console.log("AJAX GET content-type:", ajaxGetRes.headers.get("content-type"));
  const ajaxGetText = await ajaxGetRes.text();
  console.log("AJAX GET length:", ajaxGetText.length);
  const isJson = ajaxGetText.trim().startsWith("{");
  console.log("Is JSON:", isJson);

  if (isJson) {
    const json = JSON.parse(ajaxGetText);
    console.log("recordsTotal:", json.recordsTotal);
    // MOG行を探す
    for (const row of json.data || []) {
      const s = JSON.stringify(row);
      if (s.includes("MOG_01") && !s.includes("_API】")) {
        console.log("\nMOG_01 AJAX row:", JSON.stringify(row, null, 2));
        break;
      }
    }
  }

  // Step 3: CSV取得
  const csvBody = Object.entries({
    ...ajaxParams,
    partnerDataCnt: "4902",
    partnerCategoryDataCnt: "10",
    contentDataCnt: "1858",
    clientDataCnt: "284",
    groupDataCnt: "141",
  }).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&") + "&effectKey=1";

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
  const csvBuf = await csvRes.arrayBuffer();
  const csvText = new TextDecoder("shift-jis").decode(csvBuf);
  const csvLines = csvText.split("\n").filter(l => l.trim());
  console.log("\nCSV行数:", csvLines.length - 1);
  console.log("CSVヘッダー:", csvLines[0]?.substring(0, 200));

  // MOG行
  for (const l of csvLines.slice(1)) {
    if (l.includes("MOG_01") && !l.includes("_API】")) {
      console.log("MOG_01 CSV行:", l.substring(0, 300));
    }
  }
}

main().catch(console.error);

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { login } from "../src/lib/cats-api";

const BASE_URL = "https://ad.ad-mogra.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

async function main() {
  const cookie = await login();

  // ページをGET（redirect: follow）で取得
  const pageRes = await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA },
  });
  const html = await pageRes.text();
  console.log("ページサイズ:", html.length);

  if (html.length < 10000) {
    console.log("ページが小さい（認証失敗の可能性）");
    return;
  }

  // HTMLテーブルからMOG行を抽出
  // <table id="dataTable"> 内の <tr> を探す
  const tableIdx = html.indexOf('id="dataTable"');
  if (tableIdx < 0) {
    console.log("dataTable not found");
    return;
  }

  const tbodyIdx = html.indexOf("<tbody", tableIdx);
  const tbodyEnd = html.indexOf("</tbody>", tbodyIdx);
  const tbodyHtml = html.substring(tbodyIdx, tbodyEnd);

  // 各行を抽出
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  console.log("\n=== MOG行（HTMLテーブルから） ===");
  let mogCount = 0;
  for (const rowMatch of tbodyHtml.matchAll(rowRegex)) {
    const rowHtml = rowMatch[1];
    const cells: string[] = [];
    for (const tdMatch of rowHtml.matchAll(tdRegex)) {
      // HTMLタグを除去してテキストのみ
      const text = tdMatch[1].replace(/<[^>]*>/g, "").trim();
      cells.push(text);
    }

    // MOG_を含む行を表示
    const rowText = cells.join(" | ");
    if (rowText.includes("MOG_") && !rowText.includes("_API】")) {
      console.log(cells.slice(0, 8).join(" | "));
      mogCount++;
    }
  }

  console.log(`\nMOG行: ${mogCount}件`);
}

main().catch(console.error);

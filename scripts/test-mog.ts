import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { login } from "../src/lib/cats-api";

const BASE_URL = "https://ad.ad-mogra.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

async function main() {
  const cookie = await login();

  // パラメータなしでページ取得
  const res = await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA },
  });
  const html = await res.text();
  console.log("ページ:", html.length, "bytes");

  const tableIdx = html.indexOf('id="dataTable"');
  if (tableIdx < 0) { console.log("テーブルなし"); return; }

  const tbodyIdx = html.indexOf("<tbody", tableIdx);
  const tbodyEnd = html.indexOf("</tbody>", tbodyIdx);
  const tbody = html.substring(tbodyIdx, tbodyEnd);

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const strip = (s: string) => s.replace(/<[^>]*>/g, "").trim();

  let mogCount = 0;
  for (const rm of tbody.matchAll(rowRegex)) {
    const cells: string[] = [];
    for (const tm of rm[1].matchAll(tdRegex)) cells.push(strip(tm[1]));
    if (cells[0]?.match(/^MOG_\d+$/)) {
      console.log(cells.slice(0, 8).join(" | "));
      mogCount++;
    }
  }
  console.log(`\nMOG行: ${mogCount}件`);
}

main().catch(console.error);

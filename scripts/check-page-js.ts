import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { login } from "../src/lib/cats-api";

const BASE_URL = "https://ad.ad-mogra.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

async function main() {
  const cookie = await login();

  // ページHTMLを取得
  const res = await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA },
  });
  const html = await res.text();

  // DataTablesの設定を探す（ajax URL, form action等）
  const patterns = [
    /ajax['":\s]*['"](\/[^'"]+)['"]/gi,
    /url['":\s]*['"](\/admin[^'"]+)['"]/gi,
    /action['"=\s]*['"](\/admin[^'"]+)['"]/gi,
    /\.DataTable\s*\(/gi,
    /dataTable/gi,
    /csv/gi,
    /form.*method/gi,
  ];

  for (const pat of patterns) {
    const matches = html.matchAll(pat);
    for (const m of matches) {
      const start = Math.max(0, m.index! - 50);
      const end = Math.min(html.length, m.index! + m[0].length + 100);
      console.log(`\n[${pat.source}] at ${m.index}:`);
      console.log(html.substring(start, end).replace(/\n/g, " "));
    }
  }

  // CSV生成ボタン周辺のHTMLを探す
  console.log("\n\n=== CSV関連HTML ===");
  const csvIdx = html.indexOf("csv");
  if (csvIdx >= 0) {
    let i = csvIdx;
    while (i > 0 && i < html.length) {
      const nextIdx = html.indexOf("csv", i + 3);
      if (nextIdx < 0) break;
      const context = html.substring(Math.max(0, nextIdx - 100), Math.min(html.length, nextIdx + 150));
      console.log(`\n[pos ${nextIdx}]:`, context.replace(/\n/g, " ").substring(0, 250));
      i = nextIdx;
      if (i - csvIdx > 50000) break; // 最大50KB分
    }
  }

  // formタグを探す
  console.log("\n\n=== form タグ ===");
  const formRegex = /<form[^>]*>/gi;
  for (const m of html.matchAll(formRegex)) {
    console.log(`[pos ${m.index}]:`, m[0]);
  }
}

main().catch(console.error);

import { google, type sheets_v4 } from "googleapis";

// Cookieに保存されたトークンからOAuth2クライアントを作成
export function createOAuth2Client(tokens: {
  access_token?: string | null;
  refresh_token?: string | null;
  expiry_date?: number | null;
}) {
  const redirectUri = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/auth/google/callback`
    : "http://localhost:3000/api/auth/google/callback";

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

// スプレッドシートURLからIDを抽出
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

// シート名一覧を取得
export async function getSheetNames(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<string[]> {
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties.title",
  });
  return (res.data.sheets || []).map((s) => s.properties?.title || "");
}

// スキップするシート名のパターン
const SKIP_PATTERNS = [
  "注意点",
  "売上・粗利",
  "記事管理表",
  "テンプレ",
  "のコピー",
];

export function shouldSkipSheet(name: string): boolean {
  return SKIP_PATTERNS.some((p) => name.includes(p));
}

// シート名から案件情報をパース
// 形式: "クライアント_メニュー_ビジマネ（媒体）" or "クライアント_メニュー（媒体）" or "クライアント（媒体）"
export function parseSheetName(sheetName: string): {
  clientName: string;
  menuName: string | null;
  bizmanagerName: string | null;
  platform: string;
} | null {
  // 媒体名を抽出: （Meta）（TikTok）など
  const platformMatch = sheetName.match(/（([^）]+)）\s*$/);
  if (!platformMatch) return null;

  const platformRaw = platformMatch[1];
  const platform = platformRaw.toLowerCase().includes("meta")
    ? "meta"
    : platformRaw.toLowerCase().includes("tiktok")
    ? "tiktok"
    : null;
  if (!platform) return null;

  // 媒体名部分を除去
  let body = sheetName.replace(/（[^）]+）\s*$/, "").trim();
  // 先頭の全角空白なども除去
  body = body.replace(/\s+$/, "");

  // _で分割
  const parts = body.split("_");

  if (parts.length === 1) {
    // クライアントのみ
    return { clientName: parts[0], menuName: null, bizmanagerName: null, platform };
  } else if (parts.length === 2) {
    // クライアント_メニュー（ビジマネなし）
    return { clientName: parts[0], menuName: parts[1], bizmanagerName: null, platform };
  } else {
    // 3パーツ以上: 最後がビジマネかメニューの一部か判定が必要
    // ビジマネの特徴: 英数字中心、ドット含む(beauty.oo, Cosmelabo, URBAN T等)
    // 戦略: 最後のパートがビジマネっぽいかチェック
    const lastPart = parts[parts.length - 1];
    if (looksLikeBizmanager(lastPart)) {
      return {
        clientName: parts[0],
        menuName: parts.slice(1, -1).join("_"),
        bizmanagerName: lastPart,
        platform,
      };
    } else {
      // 全部メニュー名の一部
      return {
        clientName: parts[0],
        menuName: parts.slice(1).join("_"),
        bizmanagerName: null,
        platform,
      };
    }
  }
}

// ビジマネ名っぽいか判定
// 既知のビジマネ名パターン: beauty.oo, Cosmelabo, URBAN T, 美容情報.com, 美容のススメ, Bigeight, ピアラ, おしゃれラボ, totop
function looksLikeBizmanager(s: string): boolean {
  const knownBizmanagers = [
    "beauty.oo",
    "cosmelabo",
    "urban t",
    "美容情報.com",
    "美容のススメ",
    "bigeight",
    "ピアラ",
    "おしゃれラボ",
    "totop",
    "美容情報",
    "tbz",
  ];
  return knownBizmanagers.some(
    (bm) => s.toLowerCase() === bm.toLowerCase()
  );
}

// シート内のコードセクション列マッピングを取得
// Row 2 を読んで "コードN" のラベル位置を特定
export async function getCodeColumnMap(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<Map<number, number>> {
  // Row 2 を広範囲に読む (A2:GY2)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A2:GY2`,
  });

  const row = res.data.values?.[0] || [];
  const codeToCol = new Map<number, number>(); // code番号 → 0-based column index

  for (let i = 0; i < row.length; i++) {
    const val = String(row[i] || "");
    const match = val.match(/^コード(\d+)$/);
    if (match) {
      codeToCol.set(parseInt(match[1], 10), i); // 0-based
    }
  }

  return codeToCol;
}

// シート内の日付→行番号マッピングを取得
// A列を読んで日付セルの行番号を特定
export async function getDateRowMap(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<Map<string, number>> {
  // A列を広範囲に読む (A1:A400)
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheetName}'!A1:A400`,
  });

  const rows = res.data.values || [];
  const dateToRow = new Map<string, number>(); // "2025-10-01" → 1-based row number

  for (let i = 0; i < rows.length; i++) {
    const val = rows[i]?.[0];
    if (!val) continue;

    // Google Sheets の日付はシリアル値または文字列
    // Date型として解釈を試みる
    const dateStr = parseDateValue(val);
    if (dateStr) {
      dateToRow.set(dateStr, i + 1); // 1-based row
    }
  }

  return dateToRow;
}

// Google Sheetsの日付値を "YYYY-MM-DD" に変換
function parseDateValue(val: unknown): string | null {
  if (typeof val === "number") {
    // Excelシリアル値（1900年基準）
    const date = serialToDate(val);
    return formatDate(date);
  }
  if (typeof val === "string") {
    // "2025/10/1" や "2025-10-01" 形式
    const match = val.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const d = parseInt(match[3], 10);
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
    // "10/1/2025" 形式（MM/DD/YYYY）
    const match2 = val.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (match2) {
      const m = parseInt(match2[1], 10);
      const d = parseInt(match2[2], 10);
      const y = parseInt(match2[3], 10);
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

function serialToDate(serial: number): Date {
  // Excel serial date (1900-01-01 = 1, but with the 1900 leap year bug)
  const utcDays = Math.floor(serial) - 25569; // 25569 = days from 1900-01-01 to 1970-01-01
  return new Date(utcDays * 86400000);
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// コードセクション内の入力列オフセット（"コードN"ラベルがある列からのオフセット）
// Row 2の"コードN"位置から:
// -1: ROAS(数式)  0: 粗利(数式)  +1: 広告費  +2: 売上(数式)  +3: CPC(数式)
// +4: CPM(数式)  +5: imp  +6: クリック  +7: MCV
// +8: CR:CTR(数式) +9: 記事:CTR(数式) +10: CVR(数式) +11: CV
// +12: MCPA(数式) +13: CPA(数式) +14: 時間 +15: 変更点 +16: メモ
export const CODE_SECTION_OFFSETS = {
  adSpend: 1,   // 広告費
  imp: 5,       // imp
  clicks: 6,    // クリック
  mcv: 7,       // MCV
  cv: 11,       // CV
} as const;

// 列番号(0-based)をA1表記の列文字に変換
export function colToLetter(col: number): string {
  let result = "";
  let c = col;
  while (c >= 0) {
    result = String.fromCharCode((c % 26) + 65) + result;
    c = Math.floor(c / 26) - 1;
  }
  return result;
}

// バッチ書き込み用のデータ構造
export interface CellUpdate {
  range: string; // "'シート名'!AB4"
  value: number;
}

// バッチで値を書き込み
export async function batchUpdateValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  updates: CellUpdate[]
): Promise<void> {
  if (updates.length === 0) return;

  // Google Sheets API のバッチ更新（最大で100,000セルまで）
  const data = updates.map((u) => ({
    range: u.range,
    values: [[u.value]],
  }));

  // 1000件ずつバッチ送信
  for (let i = 0; i < data.length; i += 1000) {
    const batch = data.slice(i, i + 1000);
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "RAW",
        data: batch,
      },
    });
  }
}

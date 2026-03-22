const BASE_URL = "https://ad.ad-mogra.com";

function getCredentials() {
  const loginId = process.env.CATS_LOGIN_ID;
  const password = process.env.CATS_PASSWORD;
  const partnerId = process.env.CATS_PARTNER_ID;
  if (!loginId || !password || !partnerId) {
    throw new Error("CATS_LOGIN_ID, CATS_PASSWORD, CATS_PARTNER_ID が設定されていません。");
  }
  return { loginId, password, partnerId };
}

// set-cookieヘッダーからfuelmidを抽出
function extractFuelmid(res: Response): string | null {
  // getSetCookie() が使える環境（Node 20+）
  if (typeof res.headers.getSetCookie === "function") {
    for (const cookie of res.headers.getSetCookie()) {
      const match = cookie.match(/fuelmid=([^;]+)/);
      if (match) return match[1];
    }
  }
  // fallback: get("set-cookie")
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/fuelmid=([^;]+)/);
    if (match) return match[1];
  }
  return null;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";

// ログインしてセッションCookieを取得
export async function login(): Promise<string> {
  const { loginId, password } = getCredentials();

  // Step 1: ログインページにGETして初期セッションCookieを取得
  const pageRes = await fetch(`${BASE_URL}/front/login/`, {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  let fuelmid = extractFuelmid(pageRes);

  if (!fuelmid) {
    throw new Error("CATSログイン失敗: 初期セッションCookieが取得できませんでした");
  }

  // Step 2: ログインPOST（初期Cookieを添付）
  const body = new URLSearchParams({ loginId, password });
  const loginRes = await fetch(`${BASE_URL}/front/login/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      Cookie: `fuelmid=${fuelmid}`,
      Referer: `${BASE_URL}/front/login/`,
      Origin: BASE_URL,
    },
    body: body.toString(),
    redirect: "manual",
  });

  // 302レスポンスから認証済みCookieを取得
  const authFuelmid = extractFuelmid(loginRes);
  if (authFuelmid) {
    fuelmid = authFuelmid;
  }

  // Step 3: /admin/ にアクセスして最終セッションCookieを取得
  const adminRes = await fetch(`${BASE_URL}/admin/`, {
    headers: {
      Cookie: `fuelmid=${fuelmid}`,
      "User-Agent": UA,
    },
    redirect: "manual",
  });
  const adminFuelmid = extractFuelmid(adminRes);
  if (adminFuelmid) {
    fuelmid = adminFuelmid;
  }

  // 認証確認: /admin/ が200で返るか確認
  const checkRes = await fetch(`${BASE_URL}/admin/`, {
    headers: {
      Cookie: `fuelmid=${fuelmid}`,
      "User-Agent": UA,
    },
    redirect: "manual",
  });

  // checkResで新しいcookieが発行されることがある
  const checkFuelmid = extractFuelmid(checkRes);
  if (checkFuelmid) {
    fuelmid = checkFuelmid;
  }

  if (checkRes.status === 302 || checkRes.status === 301) {
    throw new Error("CATSログイン失敗: 認証情報を確認してください");
  }

  return `fuelmid=${fuelmid}`;
}

// CSV取得用のPOSTボディを構築
function buildCsvPayload(date: string): string {
  const searchDate = `${date} - ${date}`;

  const params: Record<string, string> = {
    partnerDataCnt: "4902",
    partnerCategoryDataCnt: "10",
    contentDataCnt: "1858",
    clientDataCnt: "284",
    groupDataCnt: "141",
    searchDate,
    "order[0][column]": "5",
    "order[0][dir]": "desc",
    // 内訳の粒度（1=表示/分解する）
    "profilecontentmedia::effectKeyPartner": "1",
    "profilecontentmedia::effectKeyPartnerCategory": "1",
    "profilecontentmedia::effectKeyPartnerCategory2": "1",
    "profilecontentmedia::effectKeyClient": "1",
    "profilecontentmedia::effectKeyContent": "1",
    "profilecontentmedia::effectKeyGroup": "0",
    // 表示カラム設定（1=表示）
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

  // 0のフィールド（アクションポイント系）
  for (let i = 1; i <= 20; i++) {
    params[`profilecontentmedia::cvByActionPoint${i}`] = "0";
    params[`profilecontentmedia::cvrByActionPoint${i}`] = "0";
    params[`profilecontentmedia::cvrmclByActionPoint${i}`] = "0";
  }

  // 手動構築（:: がエンコードされないように）
  // effectKey=1 のみ（直接効果）→ 「媒体名」カラムが出力される
  const body = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")
    + "&effectKey=1";

  return body;
}

// CP932(Shift-JIS) のバイト列をデコード
function decodeCP932(buffer: ArrayBuffer): string {
  const decoder = new TextDecoder("shift-jis");
  return decoder.decode(buffer);
}

export interface CatsMediaRow {
  mediaName: string;        // 媒体名
  category1: string;        // 媒体カテゴリ名①
  category2: string;        // 媒体カテゴリ名②
  advertiserName: string;   // 広告主名
  adName: string;           // 広告名
  clicks: number;           // クリック数
  middleClicks: number;     // 中間クリック数
  cv: number;               // 登録完了CV
  cvrCl: number;            // 登録完了CVR(CL)
  totalConversions: number; // 合計成果数
  ctr: number;              // CTR
  cvr: number;              // CVR(CL)
  cvrMcl: number;           // CVR(MCL)
  totalRevenue: number;     // 合計売り上げ
  totalReward: number;      // 成果報酬合計
}

export interface CatsMediaDailyRow extends CatsMediaRow {
  date: string; // "2026-03-21" 形式
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function parseCsv(text: string): CatsMediaRow[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];

  // ヘッダーからカラム位置を動的に検出
  const headers = parseCsvLine(lines[0]);
  const colIndex = (name: string) => headers.indexOf(name);

  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const getStr = (name: string) => {
      const idx = colIndex(name);
      return idx >= 0 ? cols[idx] || "" : "";
    };
    const getInt = (name: string) => {
      const idx = colIndex(name);
      return idx >= 0 ? parseInt(cols[idx]) || 0 : 0;
    };
    const getFloat = (name: string) => {
      const idx = colIndex(name);
      return idx >= 0 ? parseFloat(cols[idx]) || 0 : 0;
    };

    return {
      mediaName: getStr("媒体名"),
      category1: getStr("媒体カテゴリ名①"),
      category2: getStr("媒体カテゴリ名②"),
      advertiserName: getStr("広告主名"),
      adName: getStr("広告名"),
      clicks: getInt("クリック数"),
      middleClicks: getInt("中間クリック数"),
      cv: getInt("合計成果数"),
      cvrCl: getFloat("CVR(CL)"),
      totalConversions: getInt("合計成果数"),
      ctr: getFloat("CTR"),
      cvr: getFloat("CVR(CL)"),
      cvrMcl: getFloat("CVR(MCL)"),
      totalRevenue: getInt("合計売り上げ"),
      totalReward: getInt("成果報酬合計"),
    };
  });
}

// レポートページを読み込んでセッション状態を準備
async function loadReportPage(cookie: string, date: string): Promise<void> {
  // Step 1: GETでレポートページを開く
  await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: {
      Cookie: cookie,
      "User-Agent": UA,
      Referer: `${BASE_URL}/admin/`,
    },
  });

  // Step 2: DataTablesのAJAXリクエストを再現（表示項目設定を含む）
  const dateStr = `${date} - ${date}`;
  const ajaxBody: Record<string, string> = {
    draw: "1",
    start: "0",
    length: "100",
    "search[value]": "",
    "search[regex]": "false",
    "order[0][column]": "5",
    "order[0][dir]": "desc",
    searchDate: dateStr,
    effectKey: "1",
    searchPartnerId: getCredentials().partnerId,
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

  const ajaxQueryStr = Object.entries(ajaxBody)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  await fetch(`${BASE_URL}/admin/profilecontentmedia/list?${ajaxQueryStr}`, {
    headers: {
      Cookie: cookie,
      "User-Agent": UA,
      "X-Requested-With": "XMLHttpRequest",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
    },
  });
}

// 指定日のCSVをダウンロードしてパース
async function fetchDayCsv(
  cookie: string,
  date: string
): Promise<CatsMediaRow[]> {
  // まずレポートページを読み込んでセッション準備
  await loadReportPage(cookie, date);

  const body = buildCsvPayload(date);

  const res = await fetch(`${BASE_URL}/admin/profilecontentmedia/list/csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      "User-Agent": UA,
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
      Origin: BASE_URL,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`CATS CSV取得失敗 (${date}): status ${res.status}`);
  }

  // Content-Typeチェック: HTMLが返ってきたらログイン失敗
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("CATSセッションが無効です。ログインに失敗している可能性があります。");
  }

  const buffer = await res.arrayBuffer();
  const text = decodeCP932(buffer);
  return parseCsv(text);
}

// 日付範囲の全日のCSVを取得して媒体名別日別データを返す
export async function fetchCatsMediaDaily(
  since: string,
  until: string
): Promise<CatsMediaDailyRow[]> {
  const cookie = await login();

  // 日付リストを生成
  const dates: string[] = [];
  const start = new Date(since + "T00:00:00");
  const end = new Date(until + "T00:00:00");
  const current = new Date(start);

  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}/${m}/${d}`);
    current.setDate(current.getDate() + 1);
  }

  const allRows: CatsMediaDailyRow[] = [];
  const batchSize = 5;

  for (let i = 0; i < dates.length; i += batchSize) {
    const batch = dates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (dateStr) => {
        const rows = await fetchDayCsv(cookie, dateStr);
        const isoDate = dateStr.replace(/\//g, "-");
        return rows.map((row) => ({ ...row, date: isoDate }));
      })
    );
    allRows.push(...results.flat());
  }

  return allRows;
}

// 期間合計のCSVを1回で取得して媒体名一覧を返す（検出用、高速）
export async function fetchCatsMediaNames(
  since: string,
  until: string
): Promise<string[]> {
  const cookie = await login();

  // YYYY-MM-DD → YYYY/MM/DD
  const sinceSlash = since.replace(/-/g, "/");
  const untilSlash = until.replace(/-/g, "/");
  const searchDate = `${sinceSlash} - ${untilSlash}`;

  const params: Record<string, string> = {
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
  for (let i = 1; i <= 20; i++) {
    params[`profilecontentmedia::cvByActionPoint${i}`] = "0";
    params[`profilecontentmedia::cvrByActionPoint${i}`] = "0";
    params[`profilecontentmedia::cvrmclByActionPoint${i}`] = "0";
  }

  // effectKey=1（直接効果）→ 「媒体名」カラムが出力される
  const body = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")
    + "&effectKey=1";

  const res = await fetch(`${BASE_URL}/admin/profilecontentmedia/list/csv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie,
      "User-Agent": UA,
      Referer: `${BASE_URL}/admin/profilecontentmedia/list`,
      Origin: BASE_URL,
    },
    body,
  });

  if (!res.ok) throw new Error(`CATS CSV取得失敗: status ${res.status}`);
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("CATSセッションが無効です");
  }

  const buffer = await res.arrayBuffer();
  const text = decodeCP932(buffer);
  const rows = parseCsv(text);
  return [...new Set(rows.map((r) => r.mediaName).filter(Boolean))];
}

// 共有ピクセル（MOG_xx）の広告主マッピングをHTMLテーブルから取得
// CSVでは広告主名が空になるため、ページHTMLから補完する
export interface MogMapping {
  mediaName: string;     // "MOG_01"
  advertiserName: string; // "ピラティスK"
  adName: string;         // "ピラティスK_初月0円_即bot_Meta"
  clicks: number;
  cv: number;
}

export async function fetchMogMappings(
  since: string,
  until: string
): Promise<MogMapping[]> {
  const cookie = await login();

  const sinceSlash = since.replace(/-/g, "/");
  const untilSlash = until.replace(/-/g, "/");
  const searchDate = `${sinceSlash} - ${untilSlash}`;

  // ページをGETで取得（HTMLテーブルにデータが埋め込まれている）
  // 注: searchDateパラメータを付けると集約されてしまうため、パラメータなしで取得
  // デフォルトでは当日のデータが表示され、広告主別に分解される
  const pageRes = await fetch(`${BASE_URL}/admin/profilecontentmedia/list`, {
    headers: { Cookie: cookie, "User-Agent": UA },
  });
  const html = await pageRes.text();

  if (html.length < 10000) {
    console.error("CATS HTMLテーブル取得失敗: ページが小さすぎます");
    return [];
  }

  // <table id="dataTable"> の <tbody> を抽出
  const tableIdx = html.indexOf('id="dataTable"');
  if (tableIdx < 0) return [];

  const tbodyIdx = html.indexOf("<tbody", tableIdx);
  const tbodyEnd = html.indexOf("</tbody>", tbodyIdx);
  if (tbodyIdx < 0 || tbodyEnd < 0) return [];

  const tbodyHtml = html.substring(tbodyIdx, tbodyEnd);

  // 各行をパース
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").trim();

  const mappings: MogMapping[] = [];

  for (const rowMatch of tbodyHtml.matchAll(rowRegex)) {
    const cells: string[] = [];
    for (const tdMatch of rowMatch[1].matchAll(tdRegex)) {
      cells.push(stripTags(tdMatch[1]));
    }

    // cells[0]=媒体名, cells[1]=カテゴリ①, cells[2]=カテゴリ②, cells[3]=広告主名, cells[4]=広告名, cells[5]=クリック数, ...cells[7]=CV
    const mediaName = cells[0] || "";

    // MOG_xx（【】がない共有ピクセル媒体）のみ抽出
    if (mediaName.match(/^MOG_\d+$/) && cells[3]) {
      mappings.push({
        mediaName,
        advertiserName: cells[3],
        adName: cells[4] || "",
        clicks: parseInt(cells[5]) || 0,
        cv: parseInt(cells[7]) || 0,
      });
    }
  }

  return mappings;
}

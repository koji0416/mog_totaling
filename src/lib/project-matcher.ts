// ===== 命名規則パーサー =====

// Metaアカウント名: "001：シーズ・ラボ_レディース毛穴" → "シーズ・ラボ_レディース毛穴"
export function parseMetaAccountName(name: string): string | null {
  const match = name.match(/^\d+\s*[：:]\s*(.+)$/);
  if (!match) return null;
  // 括弧内の転生メモを除去（全角・半角両対応）
  return match[1]
    .replace(/（[^）]*転生[^）]*）$/, "")
    .replace(/\([^)]*転生[^)]*\)$/, "")
    .trim();
}

// CATS媒体名パース
// 【prefix】body_code  → { prefix, body, code }
// 【prefix】body_code（担当者名） → { prefix, body, code }
export function parseCatsMediaName(name: string): {
  prefix: string;
  body: string;
  code: number;
} | null {
  const bracketMatch = name.match(/^【([^】]+)】(.+)$/);
  if (!bracketMatch) return null;

  const prefix = bracketMatch[1];
  let rest = bracketMatch[2];

  // 末尾の全角/半角括弧を除去
  rest = rest.replace(/[（(][^）)]*[）)]$/, "").trim();

  // 末尾の _数字 をコードとして抽出
  const codeMatch = rest.match(/^(.+)_(\d+)$/);
  if (!codeMatch) return null;

  return {
    prefix,
    body: codeMatch[1],
    code: parseInt(codeMatch[2], 10),
  };
}

// CATS媒体名のprefixからプラットフォームを判定
export function prefixToPlatform(prefix: string): "meta" | "tiktok" | null {
  const lower = prefix.toLowerCase();
  if (lower.includes("meta")) return "meta";
  if (lower === "予算運用") return "meta";
  if (lower.includes("tiktok") || lower.includes("tiktio")) return "tiktok";
  return null;
}

// Metaキャンペーン名からコード番号を抽出
export function parseCodeFromCampaignName(name: string): number | null {
  const match = name.match(/コード(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

// ===== マッチングロジック =====

export interface DiscoveredProject {
  clientMenu: string;     // "ソシエ_フェイシャル"
  bizmanager: string;     // "beauty.oo"
  platform: "meta" | "tiktok";
  metaAccountIds: string[];  // 複数のMetaアカウントID
  codes: number[];
  catsMediaNames: string[];
}

// CATS bodyからclientMenuとbizmanagerを分離
// body = "ソシエ_フェイシャル_beauty.oo"
// Metaアカウント名を参照して最善の分割点を見つける
// マッチしない場合は最後の_以降をbizmanagerとみなす
function splitBody(
  body: string,
  metaAccountNames: string[]
): { clientMenu: string; bizmanager: string } {
  const sorted = [...metaAccountNames].sort((a, b) => b.length - a.length);

  for (const name of sorted) {
    if (body === name) {
      return { clientMenu: name, bizmanager: "" };
    }
    if (body.startsWith(name + "_")) {
      return { clientMenu: name, bizmanager: body.slice(name.length + 1) };
    }
    if (body.toLowerCase().startsWith(name.toLowerCase() + "_")) {
      return { clientMenu: name, bizmanager: body.slice(name.length + 1) };
    }
  }

  const lastIdx = body.lastIndexOf("_");
  if (lastIdx > 0) {
    return {
      clientMenu: body.substring(0, lastIdx),
      bizmanager: body.substring(lastIdx + 1),
    };
  }
  return { clientMenu: body, bizmanager: "" };
}

// Metaアカウント名とCATS clientMenuの類似度マッチング
// 例: "サカイクリニック62_インモード" ↔ "サカイクリニック_インモード" → true
// 例: "ソシエ" ↔ "ソシエ_フェイシャル" → true
function isClientMenuMatch(parsedMetaName: string, clientMenu: string): boolean {
  const a = parsedMetaName.toLowerCase();
  const b = clientMenu.toLowerCase();

  // 完全一致
  if (a === b) return true;

  // 片方がもう片方を含む（"ソシエ" ↔ "ソシエ_フェイシャル"）
  if (a.includes(b) || b.includes(a)) return true;

  // 各セグメントの末尾数字を除去して比較（"サカイクリニック62" → "サカイクリニック"）
  const normalize = (s: string) =>
    s.split("_").map((p) => p.replace(/\d+$/, "")).join("_");
  if (normalize(a) === normalize(b)) return true;

  // 先頭セグメント（クライアント名部分）が一致すれば候補とする
  const aFirst = a.split("_")[0].replace(/\d+$/, "");
  const bFirst = b.split("_")[0].replace(/\d+$/, "");
  if (aFirst === bFirst && aFirst.length > 0) {
    // 単一セグメントならクライアント名一致で十分
    const aParts = a.split("_");
    const bParts = b.split("_");
    if (aParts.length === 1 || bParts.length === 1) return true;
    // 複数セグメントなら末尾セグメントも一致を確認
    const aLast = aParts[aParts.length - 1].replace(/\d+$/, "");
    const bLast = bParts[bParts.length - 1].replace(/\d+$/, "");
    if (aLast === bLast) return true;
  }

  // 業種サフィックスを除去してコア名で比較
  // 例: "リアスクリニック" → "リアス", "リアス銀座クリニック" → "リアス銀座"
  // → "リアス銀座".includes("リアス") → true
  const suffixes = ["クリニック", "サロン", "ラボ", "エステ", "美容外科", "皮膚科"];
  const removeSuffix = (s: string) => {
    for (const sf of suffixes) {
      if (s.endsWith(sf)) return s.slice(0, -sf.length);
    }
    return s;
  };
  const aParts = a.split("_");
  const bParts = b.split("_");
  const coreA = removeSuffix(aParts[0]);
  const coreB = removeSuffix(bParts[0]);
  if (coreA.length >= 2 && coreB.length >= 2) {
    if (coreA.includes(coreB) || coreB.includes(coreA)) {
      // クライアント名が一致しても、両方にメニュー部分がある場合はメニューも確認
      if (aParts.length >= 2 && bParts.length >= 2) {
        const aMenu = aParts.slice(1).join("_").replace(/\d+$/, "");
        const bMenu = bParts.slice(1).join("_").replace(/\d+$/, "");
        // メニューが完全に異なる場合は不一致
        if (aMenu !== bMenu && !aMenu.includes(bMenu) && !bMenu.includes(aMenu)) {
          return false;
        }
      }
      return true;
    }
  }

  return false;
}

// Meta広告アカウント一覧とCATS媒体名一覧から案件を自動検出
// マッチング戦略: ビジネス名（ビジネスポートフォリオ）を主キーにし、
// その中でclientMenuが類似するアカウントを選ぶ
export function discoverProjects(
  metaAccounts: { id: string; name: string; businessName: string }[],
  catsMediaNames: string[]
): DiscoveredProject[] {
  // Step 1: Metaアカウントをパースし、ビジネス名別にグループ化
  const allMetaNames: string[] = [];
  const byBusiness = new Map<string, { id: string; parsedName: string }[]>();

  for (const acc of metaAccounts) {
    const parsed = parseMetaAccountName(acc.name);
    if (!parsed) continue;

    if (!allMetaNames.includes(parsed)) allMetaNames.push(parsed);
    if (parsed.includes("_")) {
      const clientOnly = parsed.split("_")[0];
      if (!allMetaNames.includes(clientOnly)) allMetaNames.push(clientOnly);
    }

    const bizKey = acc.businessName.toLowerCase();
    if (!byBusiness.has(bizKey)) byBusiness.set(bizKey, []);
    byBusiness.get(bizKey)!.push({ id: acc.id, parsedName: parsed });
  }

  // Step 2: CATS媒体名をパースして案件を検出
  const projectMap = new Map<string, DiscoveredProject>();

  for (const mediaName of catsMediaNames) {
    const parsed = parseCatsMediaName(mediaName);
    if (!parsed) continue;

    const platform = prefixToPlatform(parsed.prefix);
    if (!platform) continue;

    const { clientMenu, bizmanager } = splitBody(parsed.body, allMetaNames);

    const key = `${clientMenu}__${bizmanager.toLowerCase()}__${platform}`;

    const existing = projectMap.get(key);
    if (existing) {
      if (!existing.codes.includes(parsed.code)) {
        existing.codes.push(parsed.code);
      }
      if (!existing.catsMediaNames.includes(mediaName)) {
        existing.catsMediaNames.push(mediaName);
      }
    } else {
      // Metaアカウントを探す: ビジネス名でマッチ → clientMenu類似度で絞り込み
      const metaAccountIds: string[] = [];
      const bizLower = bizmanager.toLowerCase();

      for (const [bizKey, accounts] of byBusiness.entries()) {
        if (bizKey === bizLower || bizKey.includes(bizLower) || bizLower.includes(bizKey)) {
          for (const acc of accounts) {
            if (isClientMenuMatch(acc.parsedName, clientMenu)) {
              metaAccountIds.push(acc.id);
            }
          }
        }
      }

      projectMap.set(key, {
        clientMenu,
        bizmanager,
        platform,
        metaAccountIds: [...new Set(metaAccountIds)],
        codes: [parsed.code],
        catsMediaNames: [mediaName],
      });
    }
  }

  // コード番号をソート
  for (const p of projectMap.values()) {
    p.codes.sort((a, b) => a - b);
  }

  return [...projectMap.values()].sort((a, b) =>
    a.clientMenu.localeCompare(b.clientMenu, "ja")
  );
}

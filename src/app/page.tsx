"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface DiscoveredProject {
  clientMenu: string;
  bizmanager: string;
  platform: "meta" | "tiktok";
  metaAccountIds: string[];
  codes: number[];
  catsMediaNames: string[];
}

interface SavedProject {
  id: string;
  name: string;
  client_name: string;
  menu_name: string;
  platform: string;
  bizmanager_name: string | null;
  meta_account_id: string | null;
  unit_price: number;
}

interface SyncResult {
  sheetName: string;
  status: "matched" | "skipped" | "no_match" | "no_data" | "error";
  projectName?: string;
  cellsWritten?: number;
  error?: string;
}

function fmtSyncDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProjectsPage() {
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>([]);
  const [saved, setSaved] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [navigating, setNavigating] = useState<string | null>(null);
  const router = useRouter();

  // 単価インライン編集
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  // 当月サマリー
  const [summaries, setSummaries] = useState<Record<string, { spend: number; revenue: number; cv: number }>>({});

  // スプレッドシート同期
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetSyncing, setSheetSyncing] = useState(false);
  const [sheetMessage, setSheetMessage] = useState<string | null>(null);
  const [sheetResults, setSheetResults] = useState<SyncResult[] | null>(null);
  const [googleAuth, setGoogleAuth] = useState<boolean | null>(null);
  const [showSheetPanel, setShowSheetPanel] = useState(false);

  // 日付範囲（デフォルト: 今月1日〜今日）- hydration safe
  const [syncSince, setSyncSince] = useState("");
  const [syncUntil, setSyncUntil] = useState("");

  useEffect(() => {
    const now = new Date();
    setSyncSince(fmtSyncDate(new Date(now.getFullYear(), now.getMonth(), 1)));
    setSyncUntil(fmtSyncDate(now));
  }, []);

  useEffect(() => {
    loadData();
    // Google認証状態確認
    fetch("/api/spreadsheet/sync")
      .then((r) => r.json())
      .then((d) => setGoogleAuth(d.authenticated))
      .catch(() => setGoogleAuth(false));
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [discoverRes, savedRes] = await Promise.all([
        fetch("/api/projects/discover"),
        fetch("/api/projects"),
      ]);
      const discoverData = await discoverRes.json();
      const savedData = await savedRes.json();
      if (discoverData.error) setError(discoverData.error);
      else setDiscovered(discoverData.projects || []);
      setSaved(savedData.projects || []);

      // 当月サマリーを取得
      const projects = savedData.projects || [];
      if (projects.length > 0) {
        const now = new Date();
        const mSince = fmtSyncDate(new Date(now.getFullYear(), now.getMonth(), 1));
        const mUntil = fmtSyncDate(now);
        const summaryPromises = projects.map(async (p: SavedProject) => {
          try {
            const res = await fetch(`/api/projects/totalling?projectId=${p.id}&since=${mSince}&until=${mUntil}`);
            const data = await res.json();
            const rows = data.rows || [];
            const spend = rows.reduce((s: number, r: { spend: number }) => s + r.spend, 0);
            const cv = rows.reduce((s: number, r: { cv: number }) => s + r.cv, 0);
            const revenue = cv * (p.unit_price || 0);
            return [p.id, { spend, revenue, cv }] as const;
          } catch {
            return [p.id, { spend: 0, revenue: 0, cv: 0 }] as const;
          }
        });
        const results = await Promise.all(summaryPromises);
        setSummaries(Object.fromEntries(results));
      }
    } catch {
      setError("データの取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  function projectKey(p: DiscoveredProject) {
    return `${p.clientMenu}__${p.bizmanager}__${p.platform}`;
  }

  function savedClientMenu(s: SavedProject): string {
    return s.menu_name && s.menu_name !== "-"
      ? s.client_name + "_" + s.menu_name
      : s.client_name;
  }

  function findSaved(p: DiscoveredProject): SavedProject | undefined {
    return saved.find(
      (s) =>
        savedClientMenu(s) === p.clientMenu &&
        (s.bizmanager_name || "").toLowerCase() === p.bizmanager.toLowerCase() &&
        s.platform === p.platform
    );
  }

  async function handleClick(p: DiscoveredProject) {
    const key = projectKey(p);
    setNavigating(key);

    let sv = findSaved(p);
    if (!sv) {
      const idx = p.clientMenu.indexOf("_");
      const clientName = idx > 0 ? p.clientMenu.substring(0, idx) : p.clientMenu;
      const menuName = idx > 0 ? p.clientMenu.substring(idx + 1) : "-";
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_name: clientName,
            menu_name: menuName,
            platform: p.platform,
            bizmanager_name: p.bizmanager,
            meta_account_id: p.metaAccountIds[0] || "",
            unit_price: 0,
            approval_rate: 1.0,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          setNavigating(null);
          return;
        }
        sv = data.project;
      } catch {
        setError("案件の保存に失敗しました");
        setNavigating(null);
        return;
      }
    }

    router.push(`/projects/${sv!.id}`);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  async function saveInlinePrice(projectId: string) {
    const sv = saved.find((s) => s.id === projectId);
    if (!sv) return;
    const newPrice = Number(priceInput) || 0;
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: sv.client_name,
          menu_name: sv.menu_name,
          platform: sv.platform,
          bizmanager_name: sv.bizmanager_name,
          meta_account_id: sv.meta_account_id,
          unit_price: newPrice,
          approval_rate: 1.0,
        }),
      });
      const data = await res.json();
      if (!data.error) {
        setSaved((prev) => prev.map((s) => s.id === projectId ? { ...s, unit_price: newPrice } : s));
      }
    } catch { /* ignore */ }
    setEditingPriceId(null);
  }

  async function handleGoogleAuth() {
    try {
      const res = await fetch("/api/auth/google");
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch {
      setError("Google認証の開始に失敗しました");
    }
  }

  async function handleSheetSync() {
    if (!sheetUrl.trim()) {
      setError("スプレッドシートのURLを入力してください");
      return;
    }
    setSheetSyncing(true);
    setSheetMessage(null);
    setSheetResults(null);
    setError(null);
    try {
      const res = await fetch("/api/spreadsheet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetUrl: sheetUrl,
          since: syncSince,
          until: syncUntil,
        }),
      });
      const data = await res.json();
      if (data.needsAuth) {
        handleGoogleAuth();
        return;
      }
      if (data.error) {
        setError(data.error);
      } else {
        const syncInfo = data.summary.syncedProjects !== undefined
          ? `${data.summary.syncedProjects}案件同期 → `
          : "";
        setSheetMessage(
          `${syncInfo}${data.summary.matched}シートに${data.summary.totalCells}セルを書き込みました（未マッチ: ${data.summary.noMatch}件）`
        );
        if (data.syncErrors?.length > 0) {
          setError(`同期エラー: ${data.syncErrors.join(", ")}`);
        }
        setSheetResults(data.results);
      }
    } catch {
      setError("スプレッドシートへの書き込みに失敗しました");
    } finally {
      setSheetSyncing(false);
    }
  }

  const filtered = discovered.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.clientMenu.toLowerCase().includes(q) ||
      p.bizmanager.toLowerCase().includes(q) ||
      p.catsMediaNames.some((n) => n.toLowerCase().includes(q))
    );
  });

  const grouped = filtered.reduce<Record<string, DiscoveredProject[]>>(
    (acc, p) => {
      const clientName = p.clientMenu.split("_")[0];
      if (!acc[clientName]) acc[clientName] = [];
      acc[clientName].push(p);
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ダークヘッダー */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center font-bold text-sm">
                M
              </div>
              <h1 className="text-base font-semibold tracking-tight">MOG 集計</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSheetPanel(!showSheetPanel)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  showSheetPanel
                    ? "text-white bg-emerald-500 shadow-sm shadow-emerald-500/30"
                    : "text-gray-300 bg-gray-800 hover:text-white hover:bg-gray-700"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                SS反映
              </button>
              <a
                href="/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-gray-300 bg-gray-800 rounded-lg hover:text-white hover:bg-gray-700 transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                広告データ詳細
              </a>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* サブヘッダー: 検索 + 再検出 */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="案件を検索..."
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <svg
                className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {loading ? "検出中..." : "再検出"}
            </button>
          </div>
        </div>
      </div>

      {/* スプレッドシート反映パネル */}
      {showSheetPanel && (
        <div className="bg-emerald-50 border-b border-emerald-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-emerald-900">スプレッドシート反映</h3>
                {googleAuth === false && (
                  <button
                    onClick={handleGoogleAuth}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Googleアカウント連携
                  </button>
                )}
                {googleAuth === true && (
                  <span className="text-xs text-emerald-600 font-medium">Google連携済み</span>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="スプレッドシートのURLを貼り付け"
                  className="flex-1 px-3 py-2 text-sm border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <div className="flex gap-2 items-center">
                  {syncSince && (
                    <input
                      type="date"
                      value={syncSince}
                      onChange={(e) => setSyncSince(e.target.value)}
                      className="px-2 py-2 text-xs border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                  <span className="text-xs text-emerald-700">〜</span>
                  {syncUntil && (
                    <input
                      type="date"
                      value={syncUntil}
                      onChange={(e) => setSyncUntil(e.target.value)}
                      className="px-2 py-2 text-xs border border-emerald-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  )}
                  <button
                    onClick={handleSheetSync}
                    disabled={sheetSyncing || !sheetUrl.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {sheetSyncing ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        反映中...
                      </>
                    ) : (
                      "反映"
                    )}
                  </button>
                </div>
              </div>

              {sheetMessage && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-xs text-emerald-800">
                  {sheetMessage}
                </div>
              )}

              {sheetResults && (
                <div className="rounded-lg border border-emerald-200 bg-white overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-emerald-800 text-white text-[11px]">
                        <th className="px-3 py-1.5 text-left font-medium">シート名</th>
                        <th className="px-3 py-1.5 text-left font-medium">ステータス</th>
                        <th className="px-3 py-1.5 text-left font-medium">マッチ先</th>
                        <th className="px-3 py-1.5 text-right font-medium">書込セル数</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetResults
                        .filter((r) => r.status !== "skipped")
                        .map((r, i) => (
                          <tr key={i} className={`border-t border-emerald-100 ${i % 2 === 0 ? "bg-white" : "bg-emerald-50/30"}`}>
                            <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[200px] truncate">{r.sheetName}</td>
                            <td className="px-3 py-1.5">
                              <span
                                className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  r.status === "matched"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : r.status === "no_match"
                                    ? "bg-amber-100 text-amber-800"
                                    : r.status === "error"
                                    ? "bg-red-100 text-red-800"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {r.status === "matched"
                                  ? "書込完了"
                                  : r.status === "no_match"
                                  ? "未マッチ"
                                  : r.status === "no_data"
                                  ? "データなし"
                                  : r.status === "error"
                                  ? "エラー"
                                  : r.status}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-gray-500">{r.projectName || "-"}</td>
                            <td className="px-3 py-1.5 text-right text-gray-600">{r.cellsWritten ?? "-"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* メインコンテンツ */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* 月次サマリー */}
        {Object.keys(summaries).length > 0 && (() => {
          const allSummaries = Object.values(summaries);
          const totalSpend = allSummaries.reduce((s, v) => s + v.spend, 0);
          const totalRevenue = allSummaries.reduce((s, v) => s + v.revenue, 0);
          const totalCv = allSummaries.reduce((s, v) => s + v.cv, 0);
          const totalGross = totalRevenue - totalSpend;
          const totalRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const daysSoFar = now.getDate();
          const projectedSpend = totalSpend / daysSoFar * daysInMonth;
          const projectedRevenue = totalRevenue / daysSoFar * daysInMonth;
          const projectedGross = projectedRevenue - projectedSpend;

          return (
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-5">
              <div className="px-5 py-3 bg-gray-900 text-white flex items-center justify-between">
                <h3 className="text-sm font-semibold">{now.getMonth() + 1}月 全体サマリー</h3>
                <span className="text-[11px] text-gray-400">{daysSoFar}日経過 / {daysInMonth}日</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-gray-100">
                <div className="px-4 py-3">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">広告費</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">¥{Math.round(totalSpend).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">着地予測 ¥{Math.round(projectedSpend).toLocaleString()}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">売上</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">¥{Math.round(totalRevenue).toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">着地予測 ¥{Math.round(projectedRevenue).toLocaleString()}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">粗利</p>
                  <p className={`text-lg font-bold mt-0.5 ${totalGross > 0 ? "text-emerald-600" : totalGross < 0 ? "text-red-500" : "text-gray-900"}`}>
                    ¥{Math.round(totalGross).toLocaleString()}
                  </p>
                  <p className={`text-[10px] mt-0.5 ${projectedGross > 0 ? "text-emerald-500" : "text-red-400"}`}>
                    着地予測 ¥{Math.round(projectedGross).toLocaleString()}
                  </p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">ROAS</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{(totalRoas * 100).toFixed(1)}%</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">総CV</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{totalCv.toLocaleString()}</p>
                </div>
              </div>
            </div>
          );
        })()}

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-32 mb-4" />
                <div className="space-y-3">
                  <div className="h-14 bg-gray-100 rounded-lg" />
                  <div className="h-14 bg-gray-100 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : discovered.length === 0 ? (
          <div className="text-center py-24">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-gray-400 text-sm">マッチする案件が見つかりませんでした</p>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-gray-400">{discovered.length} 件の案件を検出</p>

            {Object.entries(grouped).map(([clientName, items]) => (
              <div key={clientName} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-900 text-white flex items-center justify-between">
                  <h3 className="text-sm font-semibold tracking-wide">{clientName}</h3>
                  <span className="text-xs text-gray-400">{items.length} メニュー</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map((p) => {
                    const key = projectKey(p);
                    const sv = findSaved(p);
                    const menuName = p.clientMenu.split("_").slice(1).join("_");
                    const isNav = navigating === key;
                    const summary = sv ? summaries[sv.id] : undefined;
                    const grossProfit = summary ? summary.revenue - summary.spend : 0;

                    return (
                      <div key={key} className="px-5 py-3 hover:bg-blue-50/30 transition-all group">
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => handleClick(p)}
                            disabled={!!navigating}
                            className="min-w-0 flex-1 text-left disabled:opacity-60"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md ${
                                  p.platform === "meta"
                                    ? "bg-blue-100 text-blue-700"
                                    : "bg-gray-900 text-white"
                                }`}
                              >
                                {p.platform === "meta" ? "Meta" : "TikTok"}
                              </span>
                              <span className="text-sm font-medium text-gray-800">{p.clientMenu}{p.bizmanager ? `_${p.bizmanager}` : ""}</span>
                            </div>
                          </button>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                            {/* 当月サマリー */}
                            {summary && summary.spend > 0 && (
                              <div className="hidden sm:flex items-center gap-3 text-[11px]">
                                <span className="text-gray-400">広告費 <span className="text-gray-700 font-medium">¥{Math.round(summary.spend).toLocaleString()}</span></span>
                                <span className="text-gray-400">CV <span className="text-gray-700 font-medium">{summary.cv}</span></span>
                                <span className={`font-medium ${grossProfit > 0 ? "text-emerald-600" : grossProfit < 0 ? "text-red-500" : "text-gray-400"}`}>
                                  粗利 ¥{Math.round(grossProfit).toLocaleString()}
                                </span>
                              </div>
                            )}
                            {isNav ? (
                              <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <button
                                onClick={() => handleClick(p)}
                                disabled={!!navigating}
                                className="p-1"
                              >
                                <svg className="w-4 h-4 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                        {/* 下段: コード + 単価 */}
                        <div className="flex items-center gap-4 mt-1">
                          {sv && editingPriceId === sv.id ? (
                            <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <span className="text-xs text-gray-400">単価 ¥</span>
                              <input
                                type="number"
                                value={priceInput}
                                onChange={(e) => setPriceInput(e.target.value)}
                                onBlur={() => saveInlinePrice(sv.id)}
                                onKeyDown={(e) => { if (e.key === "Enter") saveInlinePrice(sv.id); if (e.key === "Escape") setEditingPriceId(null); }}
                                className="w-20 text-xs border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                autoFocus
                              />
                            </span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); if (sv) { setEditingPriceId(sv.id); setPriceInput(String(sv.unit_price || "")); } }}
                              className={`text-xs font-medium ${sv && sv.unit_price > 0 ? "text-emerald-600 hover:text-emerald-700" : "text-amber-500 hover:text-amber-600"}`}
                            >
                              {sv && sv.unit_price > 0 ? `単価 ¥${sv.unit_price.toLocaleString()}` : "単価未設定"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

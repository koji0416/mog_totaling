"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";

interface SavedProject {
  id: string;
  name: string;
  client_name: string;
  menu_name: string;
  platform: string;
  bizmanager_name: string | null;
  meta_account_id: string | null;
  unit_price: number;
  approval_rate: number;
}

interface DiscoveredProject {
  clientMenu: string;
  bizmanager: string;
  platform: "meta" | "tiktok";
  metaAccountIds: string[];
  codes: number[];
  catsMediaNames: string[];
}

interface TotallingRow {
  date: string;
  codes: number[];
  spend: number;
  impressions: number;
  clicks: number;
  mcv: number;
  cv: number;
}

function fmtDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
}

function isWeekend(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

function fmt(n: number): string {
  return n === 0 ? "-" : n.toLocaleString("ja-JP");
}

function fmtYen(n: number): string {
  return n === 0 ? "-" : "¥" + Math.round(n).toLocaleString("ja-JP");
}

function fmtPct(n: number): string {
  return n === 0 ? "-" : (n * 100).toFixed(2) + "%";
}

function fmtRoas(n: number): string {
  return n === 0 ? "-" : (n * 100).toFixed(1) + "%";
}

function getMonthRange(year: number, month: number): { since: string; until: string } {
  const start = new Date(year, month, 1);
  const today = new Date();
  const endOfMonth = new Date(year, month + 1, 0);
  const until = endOfMonth > today ? today : endOfMonth;
  return { since: fmtDateISO(start), until: fmtDateISO(until) };
}

function monthLabel(year: number, month: number): string {
  return `${year}年${month + 1}月`;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [project, setProject] = useState<SavedProject | null>(null);
  const [discovered, setDiscovered] = useState<DiscoveredProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [rows, setRows] = useState<TotallingRow[]>([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [codeFilter, setCodeFilter] = useState<string>("all");

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [editingPrice, setEditingPrice] = useState(false);
  const [priceInput, setPriceInput] = useState(0);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [projRes, discoverRes] = await Promise.all([
          fetch(`/api/projects/${id}`),
          fetch("/api/projects/discover"),
        ]);
        const projData = await projRes.json();
        const discoverData = await discoverRes.json();

        if (projData.error) {
          setError(projData.error);
          return;
        }
        setProject(projData.project);
        setPriceInput(projData.project.unit_price || 0);

        const p = projData.project as SavedProject;
        const match = (discoverData.projects || []).find(
          (d: DiscoveredProject) =>
            d.clientMenu === p.client_name + "_" + p.menu_name &&
            (d.bizmanager || "").toLowerCase() === (p.bizmanager_name || "").toLowerCase() &&
            d.platform === p.platform
        );
        setDiscovered(match || null);
      } catch {
        setError("データの取得に失敗しました");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const loadCachedData = useCallback(async () => {
    if (!project) return;
    setTableLoading(true);
    const { since, until } = getMonthRange(year, month);
    const codeParam = codeFilter !== "all" ? `&code=${codeFilter}` : "";
    try {
      const res = await fetch(
        `/api/projects/totalling?projectId=${project.id}&since=${since}&until=${until}${codeParam}`
      );
      const data = await res.json();
      if (data.error) setError(data.error);
      else setRows(data.rows || []);
    } catch {
      setError("集計データの読み込みに失敗しました");
    } finally {
      setTableLoading(false);
    }
  }, [project, year, month, codeFilter]);

  useEffect(() => {
    if (project) loadCachedData();
  }, [project, year, month, codeFilter, loadCachedData]);

  async function handleSync() {
    if (!project || !discovered) return;
    setSyncing(true);
    setSyncMessage(null);
    setError(null);
    const { since, until } = getMonthRange(year, month);
    try {
      const res = await fetch("/api/projects/totalling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          metaAccountIds: discovered.metaAccountIds,
          codes: discovered.codes,
          catsMediaNames: discovered.catsMediaNames,
          since,
          until,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setSyncMessage(
          `広告 ${data.synced?.adRows || 0}件 / CATS ${data.synced?.catsRows || 0}件 を同期しました`
        );
        await loadCachedData();
      }
    } catch {
      setError("同期に失敗しました");
    } finally {
      setSyncing(false);
    }
  }

  async function savePrice() {
    if (!project) return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: project.client_name,
          menu_name: project.menu_name,
          platform: project.platform,
          bizmanager_name: project.bizmanager_name,
          meta_account_id: project.meta_account_id,
          unit_price: priceInput,
          approval_rate: project.approval_rate,
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setProject(data.project);
        setEditingPrice(false);
      }
    } catch {
      setError("単価の保存に失敗しました");
    }
  }

  function prevMonth() {
    if (month === 0) { setYear(year - 1); setMonth(11); } else { setMonth(month - 1); }
  }
  function nextMonth() {
    const nY = month === 11 ? year + 1 : year;
    const nM = month === 11 ? 0 : month + 1;
    if (nY > now.getFullYear() || (nY === now.getFullYear() && nM > now.getMonth())) return;
    setYear(nY);
    setMonth(nM);
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
  const canGoNext = !isCurrentMonth;

  const price = project?.unit_price || 0;
  const totals = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      mcv: acc.mcv + r.mcv,
      cv: acc.cv + r.cv,
    }),
    { spend: 0, impressions: 0, clicks: 0, mcv: 0, cv: 0 }
  );
  const totalRevenue = totals.cv * price;
  const totalGross = totalRevenue - totals.spend;
  const totalRoas = totals.spend > 0 ? totalRevenue / totals.spend : 0;
  const totalCpa = totals.cv > 0 ? totals.spend / totals.cv : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-4">案件が見つかりません</p>
          <button onClick={() => router.push("/")} className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700">
            案件一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  const hasData = rows.some((r) => r.spend > 0 || r.mcv > 0 || r.cv > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ダークヘッダー */}
      <header className="bg-gray-900 text-white">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6">
          <div className="flex items-center h-14 gap-3">
            <button
              onClick={() => router.push("/")}
              className="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-md ${
                    project.platform === "meta" ? "bg-blue-500 text-white" : "bg-white text-gray-900"
                  }`}
                >
                  {project.platform === "meta" ? "Meta" : "TikTok"}
                </span>
                <h1 className="text-sm sm:text-base font-semibold truncate">
                  {project.client_name} / {project.menu_name}
                </h1>
                {project.bizmanager_name && (
                  <span className="text-xs text-gray-400 hidden sm:inline">{project.bizmanager_name}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {discovered && (
                <span className="text-xs text-gray-500 hidden sm:inline">
                  コード: {discovered.codes.join(", ")}
                </span>
              )}
              {!editingPrice ? (
                <button
                  onClick={() => { setPriceInput(project.unit_price || 0); setEditingPrice(true); }}
                  className="px-2.5 py-1 text-xs rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  単価: {price > 0 ? `¥${price.toLocaleString()}` : "未設定"}
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={priceInput || ""}
                    onChange={(e) => setPriceInput(Number(e.target.value))}
                    placeholder="0"
                    className="w-20 border border-gray-600 bg-gray-800 text-white rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  <button onClick={savePrice} className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
                    保存
                  </button>
                  <button onClick={() => setEditingPrice(false)} className="px-1 py-1 text-xs text-gray-500 hover:text-gray-300">
                    ×
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* コントロールバー */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button onClick={prevMonth} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-semibold text-gray-800 min-w-[120px] text-center select-none">
                {monthLabel(year, month)}
              </span>
              <button
                onClick={nextMonth}
                disabled={!canGoNext}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-20"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {discovered && discovered.codes.length > 1 && (
                <select
                  value={codeFilter}
                  onChange={(e) => setCodeFilter(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">全コード合計</option>
                  {discovered.codes.map((c) => (
                    <option key={c} value={String(c)}>コード {c}</option>
                  ))}
                </select>
              )}
              <button
                onClick={handleSync}
                disabled={syncing || !discovered}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <svg className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {syncing ? "同期中..." : "同期"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">×</button>
          </div>
        )}
        {syncMessage && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-700 flex items-center justify-between">
            <span>{syncMessage}</span>
            <button onClick={() => setSyncMessage(null)} className="text-emerald-400 hover:text-emerald-600 ml-2">×</button>
          </div>
        )}

        {/* サマリーカード */}
        {hasData && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">広告費</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmtYen(totals.spend)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">粗利</p>
              <p className={`text-xl font-bold mt-1 ${totalGross > 0 ? "text-emerald-600" : totalGross < 0 ? "text-red-600" : "text-gray-900"}`}>
                {fmtYen(totalGross)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">ROAS</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmtRoas(totalRoas)}</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wider">CPA</p>
              <p className="text-xl font-bold text-gray-900 mt-1">{fmtYen(totalCpa)}</p>
            </div>
          </div>
        )}

        {/* テーブル */}
        {tableLoading ? (
          <div className="text-center py-20 text-gray-400 text-sm">データを読み込み中...</div>
        ) : !hasData ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm mb-3">{monthLabel(year, month)}のデータがありません</p>
            {discovered && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {syncing ? "同期中..." : `${monthLabel(year, month)}を同期する`}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-900 text-white text-[11px]">
                    <th className="px-3 py-2.5 text-left font-medium sticky left-0 bg-gray-900 z-10">日付</th>
                    <th className="px-3 py-2.5 text-center font-medium">コード</th>
                    <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
                    <th className="px-3 py-2.5 text-right font-medium">粗利</th>
                    <th className="px-3 py-2.5 text-right font-medium text-yellow-300">広告費</th>
                    <th className="px-3 py-2.5 text-right font-medium">売上</th>
                    <th className="px-3 py-2.5 text-right font-medium">CPC</th>
                    <th className="px-3 py-2.5 text-right font-medium">CPM</th>
                    <th className="px-3 py-2.5 text-right font-medium text-yellow-300">imp</th>
                    <th className="px-3 py-2.5 text-right font-medium text-yellow-300">クリック</th>
                    <th className="px-3 py-2.5 text-right font-medium text-emerald-300">MCV</th>
                    <th className="px-3 py-2.5 text-right font-medium">CR:CTR</th>
                    <th className="px-3 py-2.5 text-right font-medium">記事CTR</th>
                    <th className="px-3 py-2.5 text-right font-medium">CVR</th>
                    <th className="px-3 py-2.5 text-right font-medium text-emerald-300">CV</th>
                    <th className="px-3 py-2.5 text-right font-medium">MCPA</th>
                    <th className="px-3 py-2.5 text-right font-medium">CPA</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const weekend = isWeekend(r.date);
                    const revenue = r.cv * price;
                    const grossProfit = revenue - r.spend;
                    const roas = r.spend > 0 ? revenue / r.spend : 0;
                    const cpc = r.clicks > 0 ? r.spend / r.clicks : 0;
                    const cpm = r.impressions > 0 ? (r.spend / r.impressions) * 1000 : 0;
                    const crCtr = r.impressions > 0 ? r.clicks / r.impressions : 0;
                    const articleCtr = r.clicks > 0 ? r.mcv / r.clicks : 0;
                    const cvr = r.mcv > 0 ? r.cv / r.mcv : 0;
                    const mcpa = r.mcv > 0 ? r.spend / r.mcv : 0;
                    const cpa = r.cv > 0 ? r.spend / r.cv : 0;
                    const rowHasData = r.spend > 0 || r.mcv > 0 || r.cv > 0;
                    const bg = weekend ? "bg-blue-50/60" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50";

                    return (
                      <tr key={r.date} className={`border-t border-gray-100 ${bg} hover:bg-blue-50/30`}>
                        <td className={`px-3 py-2 font-medium sticky left-0 z-10 ${bg} ${weekend ? "text-blue-600" : "text-gray-700"}`}>
                          {formatDate(r.date)}
                        </td>
                        <td className="px-3 py-2 text-center text-gray-400">{r.codes.length > 0 ? r.codes.join(",") : "-"}</td>
                        <td className="px-3 py-2 text-right">{fmtRoas(roas)}</td>
                        <td className={`px-3 py-2 text-right ${grossProfit > 0 ? "text-emerald-600" : grossProfit < 0 ? "text-red-600" : ""}`}>
                          {rowHasData ? fmtYen(grossProfit) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">{fmtYen(r.spend)}</td>
                        <td className="px-3 py-2 text-right">{fmtYen(revenue)}</td>
                        <td className="px-3 py-2 text-right">{fmtYen(cpc)}</td>
                        <td className="px-3 py-2 text-right">{fmtYen(cpm)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.impressions)}</td>
                        <td className="px-3 py-2 text-right">{fmt(r.clicks)}</td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-700">{fmt(r.mcv)}</td>
                        <td className="px-3 py-2 text-right">{fmtPct(crCtr)}</td>
                        <td className="px-3 py-2 text-right">{fmtPct(articleCtr)}</td>
                        <td className="px-3 py-2 text-right">{fmtPct(cvr)}</td>
                        <td className="px-3 py-2 text-right font-medium text-emerald-700">{fmt(r.cv)}</td>
                        <td className="px-3 py-2 text-right">{fmtYen(mcpa)}</td>
                        <td className="px-3 py-2 text-right">{fmtYen(cpa)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const t = totals;
                    const tRevenue = t.cv * price;
                    const tGross = tRevenue - t.spend;
                    const tRoas = t.spend > 0 ? tRevenue / t.spend : 0;
                    const tCpc = t.clicks > 0 ? t.spend / t.clicks : 0;
                    const tCpm = t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0;
                    const tCrCtr = t.impressions > 0 ? t.clicks / t.impressions : 0;
                    const tArticleCtr = t.clicks > 0 ? t.mcv / t.clicks : 0;
                    const tCvr = t.mcv > 0 ? t.cv / t.mcv : 0;
                    const tMcpa = t.mcv > 0 ? t.spend / t.mcv : 0;
                    const tCpa = t.cv > 0 ? t.spend / t.cv : 0;
                    return (
                      <tr className="border-t-2 border-gray-300 bg-gray-900 text-white font-bold text-[11px]">
                        <td className="px-3 py-2.5 sticky left-0 bg-gray-900 z-10">合計</td>
                        <td className="px-3 py-2.5 text-center text-gray-400">-</td>
                        <td className="px-3 py-2.5 text-right">{fmtRoas(tRoas)}</td>
                        <td className={`px-3 py-2.5 text-right ${tGross > 0 ? "text-emerald-400" : tGross < 0 ? "text-red-400" : ""}`}>
                          {fmtYen(tGross)}
                        </td>
                        <td className="px-3 py-2.5 text-right">{fmtYen(t.spend)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtYen(tRevenue)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtYen(tCpc)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtYen(tCpm)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(t.impressions)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(t.clicks)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(t.mcv)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtPct(tCrCtr)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtPct(tArticleCtr)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtPct(tCvr)}</td>
                        <td className="px-3 py-2.5 text-right">{fmt(t.cv)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtYen(tMcpa)}</td>
                        <td className="px-3 py-2.5 text-right">{fmtYen(tCpa)}</td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

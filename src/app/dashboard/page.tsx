"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AdAccount, CampaignMetrics, CampaignDailyMetrics, DailyMetrics } from "@/lib/types";
import AccountList from "@/components/AccountList";
import CampaignTable from "@/components/CampaignTable";
import DailyTable from "@/components/DailyTable";
import CampaignDailyTable from "@/components/CampaignDailyTable";
import CatsMediaDailyTable from "@/components/CatsMediaDailyTable";
import MetricCard from "@/components/MetricCard";
import { MetricSkeleton, TableSkeleton, AccountSkeleton } from "@/components/Skeleton";
import type { CatsMediaDailyRow } from "@/lib/cats-api";

type Platform = "meta" | "tiktok" | "cats";
type ViewTab = "campaign" | "daily" | "campaign_daily";
type RefreshInterval = 0 | 60 | 180 | 300;

const REFRESH_LABELS: Record<RefreshInterval, string> = {
  0: "手動",
  60: "1分",
  180: "3分",
  300: "5分",
};

interface TikTokAccount {
  advertiser_id: string;
  advertiser_name: string;
  currency: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function defaultSince(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return fmtDate(d);
}

function defaultUntil(): string {
  return fmtDate(new Date());
}

// TikTokアカウントをAdAccount形式に変換
function toAdAccount(t: TikTokAccount): AdAccount {
  return {
    id: t.advertiser_id,
    name: t.advertiser_name,
    account_status: 1,
    currency: t.currency,
    businessName: "TikTok",
    businessId: "tiktok",
  };
}

export default function Dashboard() {
  const [platform, setPlatform] = useState<Platform>("meta");
  const [metaAccounts, setMetaAccounts] = useState<AdAccount[]>([]);
  const [tiktokAccounts, setTiktokAccounts] = useState<AdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [since, setSince] = useState(defaultSince);
  const [until, setUntil] = useState(defaultUntil);
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [daily, setDaily] = useState<DailyMetrics[]>([]);
  const [campaignDaily, setCampaignDaily] = useState<CampaignDailyMetrics[]>([]);
  const [catsData, setCatsData] = useState<CatsMediaDailyRow[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("campaign");
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const resizingRef = useRef(false);

  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedAccountRef = useRef(selectedAccountId);
  const platformRef = useRef(platform);
  const sinceRef = useRef(since);
  const untilRef = useRef(until);

  selectedAccountRef.current = selectedAccountId;
  platformRef.current = platform;
  sinceRef.current = since;
  untilRef.current = until;

  const accounts = platform === "cats" ? [] : platform === "meta" ? metaAccounts : tiktokAccounts;

  // アカウント一覧取得
  useEffect(() => {
    async function safeFetch(url: string) {
      const res = await fetch(url);
      if (res.redirected || !res.ok) return null;
      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) return null;
      return res.json();
    }
    async function loadMeta() {
      try {
        const data = await safeFetch("/api/meta/accounts");
        if (data?.accounts) setMetaAccounts(data.accounts);
      } catch { /* ignore */ }
    }
    async function loadTikTok() {
      try {
        const data = await safeFetch("/api/tiktok/accounts");
        if (data?.accounts) setTiktokAccounts(data.accounts.map(toAdAccount));
      } catch { /* ignore */ }
    }
    Promise.all([loadMeta(), loadTikTok()]).finally(() => setLoadingAccounts(false));
  }, []);

  const fetchAllData = useCallback(
    async (accountId: string, plat: Platform, s: string, u: string, showLoading = true) => {
      if (showLoading) setLoadingInsights(true);
      setError(null);

      const apiBase = plat === "meta" ? "/api/meta" : "/api/tiktok";
      const idParam = plat === "meta" ? "accountId" : "advertiserId";
      const dateParams = `&since=${s}&until=${u}`;

      try {
        const [campRes, dailyRes, campDailyRes] = await Promise.all([
          fetch(`${apiBase}/insights?${idParam}=${accountId}&mode=campaign${dateParams}`),
          fetch(`${apiBase}/insights?${idParam}=${accountId}&mode=daily${dateParams}`),
          fetch(`${apiBase}/insights?${idParam}=${accountId}&mode=campaign_daily${dateParams}`),
        ]);

        if (campRes.redirected || dailyRes.redirected) {
          router.push("/login");
          return;
        }

        const campData = await campRes.json();
        const dailyData = await dailyRes.json();

        if (campData.error) {
          setError(campData.error);
          setCampaigns([]);
        } else {
          setCampaigns(campData.insights);
        }

        if (dailyData.error) {
          if (!campData.error) setError(dailyData.error);
          setDaily([]);
        } else {
          setDaily(dailyData.daily);
        }

        const campDailyData = await campDailyRes.json();
        if (campDailyData.error) {
          setCampaignDaily([]);
        } else {
          setCampaignDaily(campDailyData.campaignDaily || []);
        }

        setLastUpdated(new Date());
      } catch (e) {
        setError(`データの取得に失敗しました。${e instanceof Error ? e.message : ""}`);
        setCampaigns([]);
        setDaily([]);
        setCampaignDaily([]);
      } finally {
        setLoadingInsights(false);
      }
    },
    []
  );

  const fetchCatsData = useCallback(
    async (s: string, u: string, showLoading = true) => {
      if (showLoading) setLoadingCats(true);
      setError(null);
      try {
        const res = await fetch(`/api/cats/insights?since=${s}&until=${u}`);
        if (res.redirected) {
          router.push("/login");
          return;
        }
        const json = await res.json();
        if (json.error) {
          setError(json.error);
          setCatsData([]);
        } else {
          setCatsData(json.data || []);
        }
        setLastUpdated(new Date());
      } catch (e) {
        setError(`CATSデータの取得に失敗しました。${e instanceof Error ? e.message : ""}`);
        setCatsData([]);
      } finally {
        setLoadingCats(false);
      }
    },
    []
  );

  function handlePlatformChange(p: Platform) {
    setPlatform(p);
    setSelectedAccountId(null);
    setCampaigns([]);
    setDaily([]);
    setCampaignDaily([]);
    setCatsData([]);
    setError(null);
    setLastUpdated(null);
    if (p === "cats") {
      setViewTab("campaign");
    }
  }

  function handleSelectAccount(id: string) {
    setSelectedAccountId(id);
    fetchAllData(id, platform, since, until);
    setSidebarOpen(false);
  }

  function handleManualRefresh() {
    if (platform === "cats") {
      fetchCatsData(since, until);
    } else if (selectedAccountId) {
      fetchAllData(selectedAccountId, platform, since, until);
    }
  }

  function handleDateApply() {
    if (platform === "cats") {
      fetchCatsData(since, until);
    } else if (selectedAccountId) {
      fetchAllData(selectedAccountId, platform, since, until);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (refreshInterval > 0 && selectedAccountId) {
      intervalRef.current = setInterval(() => {
        const accId = selectedAccountRef.current;
        const plat = platformRef.current;
        const s = sinceRef.current;
        const u = untilRef.current;
        if (accId) {
          fetchAllData(accId, plat, s, u, false);
        }
      }, refreshInterval * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshInterval, selectedAccountId, fetchAllData]);

  // サイドバーリサイズ
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.min(Math.max(startWidth + (e.clientX - startX), 200), 500);
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const currency = selectedAccount?.currency || "JPY";
  const currencySymbol = currency === "JPY" ? "¥" : "$";

  const totalSpend = campaigns.reduce((sum, c) => sum + c.spend, 0);
  const totalImpressions = campaigns.reduce((sum, c) => sum + c.impressions, 0);
  const totalClicks = campaigns.reduce((sum, c) => sum + c.clicks, 0);
  const totalConversions = campaigns.reduce((sum, c) => sum + c.conversions, 0);
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const avgCpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* ===== モバイル: オーバーレイ ===== */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ===== サイドバー ===== */}
      <aside
        style={{ width: sidebarWidth }}
        className={`
          fixed inset-y-0 left-0 z-40 border-r border-gray-200 bg-white flex flex-col relative
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0 lg:flex-shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                platform === "meta" ? "bg-blue-600" : platform === "cats" ? "bg-amber-500" : "bg-gray-900"
              }`}>
                {platform === "meta" ? (
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                  </svg>
                ) : platform === "cats" ? (
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h7" />
                    <path d="M16 19l2 2 4-4" />
                    <path d="M7 10h0M12 10h0M17 10h0" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 00-.79-.05A6.34 6.34 0 003.15 15.2a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V8.73a8.19 8.19 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.16z" />
                  </svg>
                )}
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">
                  {platform === "meta" ? "Meta Ads" : platform === "cats" ? "CATS" : "TikTok Ads"}
                </h1>
                <p className="text-xs text-gray-400">Dashboard</p>
              </div>
            </div>
            {/* モバイル: 閉じるボタン */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* プラットフォーム切り替えタブ */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => handlePlatformChange("meta")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              platform === "meta"
                ? "text-blue-600 border-b-2 border-blue-500 bg-blue-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            Meta
          </button>
          <button
            onClick={() => handlePlatformChange("tiktok")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              platform === "tiktok"
                ? "text-gray-900 border-b-2 border-gray-800 bg-gray-50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            TikTok
          </button>
          <button
            onClick={() => handlePlatformChange("cats")}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              platform === "cats"
                ? "text-amber-700 border-b-2 border-amber-500 bg-amber-50/50"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            CATS
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {platform === "cats" ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm font-medium text-gray-400">CATS 直接効果</p>
              <p className="text-xs text-gray-300 mt-1">日付を変更して再取得できます</p>
            </div>
          ) : loadingAccounts ? (
            <AccountSkeleton />
          ) : (
            <AccountList
              accounts={accounts}
              selectedId={selectedAccountId}
              onSelect={handleSelectAccount}
            />
          )}
        </div>

        <div className="border-t border-gray-200 p-3 space-y-1">
          <button
            onClick={() => router.push("/")}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            案件設定
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            ログアウト
          </button>
        </div>
        {/* リサイズハンドル */}
        <div
          onMouseDown={handleResizeStart}
          className="hidden lg:block absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-blue-400/40 transition-colors z-50"
        />
      </aside>

      {/* ===== メインコンテンツ ===== */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* ヘッダー */}
        <header className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* モバイル: ハンバーガーメニュー */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-1.5 -ml-1 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div className="min-w-0">
                {platform === "cats" ? (
                  <>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900">CATS 直接効果</h2>
                    {lastUpdated && (
                      <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
                        最終更新 {lastUpdated.toLocaleTimeString("ja-JP")}
                      </p>
                    )}
                  </>
                ) : selectedAccount ? (
                  <>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                      {selectedAccount.name}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5 truncate hidden sm:block">
                      {selectedAccount.businessName} · {selectedAccount.id} · {selectedAccount.currency}
                      {lastUpdated && (
                        <span className="ml-2">
                          · 最終更新 {lastUpdated.toLocaleTimeString("ja-JP")}
                        </span>
                      )}
                    </p>
                  </>
                ) : (
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">ダッシュボード</h2>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* 自動更新（CATS以外） */}
              {platform !== "cats" && (
                <div className="hidden sm:flex items-center">
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value) as RefreshInterval)}
                    className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    {Object.entries(REFRESH_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              )}
              {/* 手動更新ボタン */}
              {(selectedAccountId || platform === "cats") && (
                <button
                  onClick={handleManualRefresh}
                  disabled={loadingInsights || loadingCats}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="今すぐ更新"
                >
                  <svg
                    className={`w-4 h-4 ${loadingInsights || loadingCats ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              {/* 日付範囲選択 */}
              <div className="hidden sm:flex items-center gap-1.5">
                <input
                  type="date"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs text-gray-400">〜</span>
                <input
                  type="date"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                  className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600 bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                />
                <button
                  onClick={handleDateApply}
                  disabled={(!selectedAccountId && platform !== "cats") || loadingInsights || loadingCats}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  取得
                </button>
              </div>
            </div>
          </div>
          {/* モバイル: 日付範囲 */}
          <div className="flex sm:hidden items-center gap-1.5 mt-2">
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600 bg-white"
            />
            <span className="text-xs text-gray-400">〜</span>
            <input
              type="date"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-600 bg-white"
            />
            <button
              onClick={handleDateApply}
              disabled={!selectedAccountId || loadingInsights}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              取得
            </button>
          </div>
        </header>

        {/* コンテンツエリア */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* エラー */}
          {error && (
            <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 sm:p-4 text-sm text-red-700">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* CATS表示 */}
          {platform === "cats" && (
            <>
              {loadingCats ? (
                <>
                  <MetricSkeleton />
                  <TableSkeleton />
                </>
              ) : catsData.length === 0 && !error ? (
                <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-gray-400">
                  <svg className="w-12 h-12 sm:w-16 sm:h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-base sm:text-lg font-medium text-gray-300">
                    日付を確認して「取得」を押してください
                  </p>
                  <p className="text-xs text-gray-300 mt-2">1日ごとにCSVを取得するため、期間が長いと時間がかかります</p>
                </div>
              ) : (
                <section>
                  <CatsMediaDailyTable data={catsData} />
                </section>
              )}
            </>
          )}

          {/* Meta/TikTok: 未選択時 */}
          {platform !== "cats" && !selectedAccountId && !loadingAccounts && (
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-gray-400">
              <svg className="w-12 h-12 sm:w-16 sm:h-16 mb-4 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
              <p className="text-base sm:text-lg font-medium text-gray-300">
                <span className="hidden lg:inline">左の</span>アカウントを選択してください
              </p>
              <p className="text-sm text-gray-300 mt-1">キャンペーンデータが表示されます</p>
              {/* モバイル: アカウント選択ボタン */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="mt-4 lg:hidden px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                アカウントを選択
              </button>
            </div>
          )}

          {/* Meta/TikTok: データ表示 */}
          {platform !== "cats" && selectedAccountId && (
            <>
              {loadingInsights ? (
                <>
                  <MetricSkeleton />
                  <TableSkeleton />
                </>
              ) : (
                <>
                  {/* サマリーカード */}
                  <section className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 lg:grid-cols-6">
                    <MetricCard
                      label="費用"
                      value={`${currencySymbol}${formatNumber(Math.round(totalSpend))}`}
                      accent="blue"
                    />
                    <MetricCard
                      label="表示回数"
                      value={formatNumber(totalImpressions)}
                      accent="purple"
                    />
                    <MetricCard
                      label="クリック数"
                      value={formatNumber(totalClicks)}
                      accent="cyan"
                    />
                    <MetricCard
                      label="CTR"
                      value={`${avgCtr.toFixed(2)}%`}
                      accent="green"
                    />
                    <MetricCard
                      label="CV"
                      value={formatNumber(totalConversions)}
                      accent="amber"
                    />
                    <MetricCard
                      label="CPA"
                      value={avgCpa > 0 ? `${currencySymbol}${formatNumber(Math.round(avgCpa))}` : "-"}
                      accent="rose"
                    />
                  </section>

                  {/* タブ切り替え */}
                  <section>
                    <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
                      <button
                        onClick={() => setViewTab("campaign")}
                        className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                          viewTab === "campaign"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        キャンペーン別
                      </button>
                      <button
                        onClick={() => setViewTab("daily")}
                        className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                          viewTab === "daily"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        日別推移
                      </button>
                      <button
                        onClick={() => setViewTab("campaign_daily")}
                        className={`px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                          viewTab === "campaign_daily"
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        キャンペーン別日別
                      </button>
                    </div>

                    {viewTab === "campaign" ? (
                      <CampaignTable campaigns={campaigns} currency={currency} />
                    ) : viewTab === "campaign_daily" ? (
                      <CampaignDailyTable data={campaignDaily} currency={currency} />
                    ) : (
                      <DailyTable daily={daily} currency={currency} />
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

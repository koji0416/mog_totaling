"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { AdAccount, CampaignMetrics, DailyMetrics, DatePreset } from "@/lib/types";
import DateRangeSelector from "@/components/DateRangeSelector";
import AccountList from "@/components/AccountList";
import CampaignTable from "@/components/CampaignTable";
import DailyTable from "@/components/DailyTable";
import MetricCard from "@/components/MetricCard";
import { MetricSkeleton, TableSkeleton, AccountSkeleton } from "@/components/Skeleton";

type ViewTab = "campaign" | "daily";
type RefreshInterval = 0 | 60 | 180 | 300;

const REFRESH_LABELS: Record<RefreshInterval, string> = {
  0: "手動",
  60: "1分",
  180: "3分",
  300: "5分",
};

function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

export default function Dashboard() {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>("last_7d");
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([]);
  const [daily, setDaily] = useState<DailyMetrics[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("campaign");
  const [refreshInterval, setRefreshInterval] = useState<RefreshInterval>(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectedAccountRef = useRef(selectedAccountId);
  const datePresetRef = useRef(datePreset);

  selectedAccountRef.current = selectedAccountId;
  datePresetRef.current = datePreset;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/meta/accounts");
        if (res.redirected) return;
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        setAccounts(data.accounts);
      } catch {
        setError("アカウント情報の取得に失敗しました。");
      } finally {
        setLoadingAccounts(false);
      }
    }
    load();
  }, []);

  const fetchAllData = useCallback(
    async (accountId: string, preset: DatePreset, showLoading = true) => {
      if (showLoading) setLoadingInsights(true);
      setError(null);
      try {
        const [campRes, dailyRes] = await Promise.all([
          fetch(`/api/meta/insights?accountId=${accountId}&datePreset=${preset}&mode=campaign`),
          fetch(`/api/meta/insights?accountId=${accountId}&datePreset=${preset}&mode=daily`),
        ]);

        // セッション切れでリダイレクトされた場合
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

        setLastUpdated(new Date());
      } catch (e) {
        setError(`データの取得に失敗しました。${e instanceof Error ? e.message : ""}`);
        setCampaigns([]);
        setDaily([]);
      } finally {
        setLoadingInsights(false);
      }
    },
    []
  );

  function handleSelectAccount(id: string) {
    setSelectedAccountId(id);
    fetchAllData(id, datePreset);
    setSidebarOpen(false); // モバイル: 選択したらドロワーを閉じる
  }

  function handleDateChange(preset: DatePreset) {
    setDatePreset(preset);
    if (selectedAccountId) {
      fetchAllData(selectedAccountId, preset);
    }
  }

  function handleManualRefresh() {
    if (selectedAccountId) {
      fetchAllData(selectedAccountId, datePreset);
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
        const preset = datePresetRef.current;
        if (accId) {
          fetchAllData(accId, preset, false);
        }
      }, refreshInterval * 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshInterval, selectedAccountId, fetchAllData]);

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
        className={`
          fixed inset-y-0 left-0 z-40 w-72 border-r border-gray-200 bg-white flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0 lg:flex-shrink-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="px-5 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z" />
                </svg>
              </div>
              <div>
                <h1 className="text-base font-bold text-gray-900">Meta Ads</h1>
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
        <div className="flex-1 overflow-hidden">
          {loadingAccounts ? (
            <AccountSkeleton />
          ) : (
            <AccountList
              accounts={accounts}
              selectedId={selectedAccountId}
              onSelect={handleSelectAccount}
            />
          )}
        </div>

        <div className="border-t border-gray-200 p-3">
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
                {selectedAccount ? (
                  <>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 truncate">
                      {selectedAccount.name}
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5 truncate hidden sm:block">
                      {selectedAccount.id} · {selectedAccount.currency}
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
              {/* 自動更新 (PCのみ表示) */}
              <div className="hidden sm:flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
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
              {/* 手動更新ボタン */}
              {selectedAccountId && (
                <button
                  onClick={handleManualRefresh}
                  disabled={loadingInsights}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  title="今すぐ更新"
                >
                  <svg
                    className={`w-4 h-4 ${loadingInsights ? "animate-spin" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}
              <DateRangeSelector value={datePreset} onChange={handleDateChange} />
            </div>
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

          {/* 未選択時 */}
          {!selectedAccountId && !loadingAccounts && (
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

          {/* データ表示 */}
          {selectedAccountId && (
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
                    </div>

                    {viewTab === "campaign" ? (
                      <CampaignTable campaigns={campaigns} currency={currency} />
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

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

export default function ProjectsPage() {
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>([]);
  const [saved, setSaved] = useState<SavedProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [navigating, setNavigating] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadData();
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
              <h1 className="text-base font-semibold tracking-tight">MOG Totalling</h1>
            </div>
            <div className="flex items-center gap-1">
              <a
                href="/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
              >
                Dashboard
              </a>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
              >
                Logout
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

                    return (
                      <button
                        key={key}
                        onClick={() => handleClick(p)}
                        disabled={!!navigating}
                        className="w-full text-left px-5 py-4 hover:bg-blue-50/50 transition-all disabled:opacity-60 group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
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
                              <span className="text-sm font-semibold text-gray-900">{menuName}</span>
                              <span className="text-xs text-gray-400 font-medium">{p.bizmanager}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-1.5">
                              <span className="text-xs text-gray-400">コード {p.codes.join(", ")}</span>
                              {sv && sv.unit_price > 0 ? (
                                <span className="text-xs font-medium text-emerald-600">
                                  単価 ¥{sv.unit_price.toLocaleString()}
                                </span>
                              ) : (
                                <span className="text-xs text-amber-500 font-medium">単価未設定</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 ml-4">
                            {isNav ? (
                              <svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <svg className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      </button>
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

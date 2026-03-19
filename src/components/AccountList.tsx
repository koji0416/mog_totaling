"use client";

import { useState, useMemo } from "react";
import { AdAccount } from "@/lib/types";

interface Props {
  accounts: AdAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function statusDot(status: number): string {
  switch (status) {
    case 1:
      return "bg-green-400";
    case 2:
      return "bg-red-400";
    case 3:
      return "bg-yellow-400";
    default:
      return "bg-gray-400";
  }
}

export default function AccountList({ accounts, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = accounts.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()) ||
    a.businessName.toLowerCase().includes(search.toLowerCase())
  );

  // ビジネスポートフォリオ別にグルーピング
  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; accounts: AdAccount[] }>();
    for (const acc of filtered) {
      const key = acc.businessId;
      if (!map.has(key)) {
        map.set(key, { name: acc.businessName, accounts: [] });
      }
      map.get(key)!.accounts.push(acc);
    }
    // 「未割当」は最後に
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      if (a[0] === "none") return 1;
      if (b[0] === "none") return -1;
      return a[1].name.localeCompare(b[1].name, "ja");
    });
    return entries;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      {/* 検索ボックス */}
      <div className="p-3 border-b border-gray-200">
        <div className="relative">
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
            placeholder="アカウント・ポートフォリオを検索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
        <div className="mt-2 text-xs text-gray-400">
          {filtered.length} / {accounts.length} アカウント
        </div>
      </div>

      {/* アカウントリスト（ポートフォリオ別） */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {filtered.length === 0 ? (
          <div className="p-4 text-sm text-gray-400 text-center">
            該当するアカウントがありません
          </div>
        ) : (
          <div className="py-1">
            {grouped.map(([bizId, group]) => (
              <div key={bizId}>
                {/* ポートフォリオ名ヘッダー */}
                <div className="sticky top-0 z-10 bg-gray-50 px-4 py-1.5 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider truncate">
                      {group.name}
                    </span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      ({group.accounts.length})
                    </span>
                  </div>
                </div>
                {/* アカウント一覧 */}
                {group.accounts.map((account) => {
                  const isSelected = account.id === selectedId;
                  return (
                    <button
                      key={account.id}
                      onClick={() => onSelect(account.id)}
                      className={`
                        w-full text-left px-4 py-2.5 border-l-3 transition-all
                        ${
                          isSelected
                            ? "bg-blue-50 border-l-blue-500 text-blue-900"
                            : "border-l-transparent hover:bg-gray-50 text-gray-700"
                        }
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(
                            account.account_status
                          )}`}
                        />
                        <span className="text-sm font-medium truncate">
                          {account.name}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

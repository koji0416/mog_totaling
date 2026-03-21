"use client";

import { useState, useMemo } from "react";
import type { CatsMediaDailyRow } from "@/lib/cats-api";

interface Props {
  data: CatsMediaDailyRow[];
}

function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

function formatPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const weekday = weekdays[d.getDay()];
  return `${month}/${day}（${weekday}）`;
}

export default function CatsMediaDailyTable({ data }: Props) {
  const [selectedMedia, setSelectedMedia] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 媒体名一覧（クリック数降順）
  const mediaList = useMemo(() => {
    const map = new Map<string, { name: string; totalClicks: number }>();
    for (const row of data) {
      const existing = map.get(row.mediaName);
      if (existing) {
        existing.totalClicks += row.clicks;
      } else {
        map.set(row.mediaName, { name: row.mediaName, totalClicks: row.clicks });
      }
    }
    return [...map.values()].sort((a, b) => b.totalClicks - a.totalClicks);
  }, [data]);

  // 検索フィルター適用後の媒体リスト
  const filteredMediaList = useMemo(() => {
    if (!searchQuery.trim()) return mediaList;
    const q = searchQuery.toLowerCase();
    return mediaList.filter((m) => m.name.toLowerCase().includes(q));
  }, [mediaList, searchQuery]);

  // 選択中の媒体の日別データ（新しい日付が上）
  const dailyRows = useMemo(() => {
    if (!selectedMedia) return [];
    return data
      .filter((r) => r.mediaName === selectedMedia)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, selectedMedia]);

  // 合計
  const totals = useMemo(() => {
    const t = dailyRows.reduce(
      (acc, d) => ({
        clicks: acc.clicks + d.clicks,
        middleClicks: acc.middleClicks + d.middleClicks,
        cv: acc.cv + d.cv,
        totalConversions: acc.totalConversions + d.totalConversions,
        totalRevenue: acc.totalRevenue + d.totalRevenue,
        totalReward: acc.totalReward + d.totalReward,
      }),
      { clicks: 0, middleClicks: 0, cv: 0, totalConversions: 0, totalRevenue: 0, totalReward: 0 }
    );
    return {
      ...t,
      cvrCl: t.clicks > 0 ? (t.cv / t.clicks) * 100 : 0,
      ctr: 0,
      cvr: t.clicks > 0 ? (t.totalConversions / t.clicks) * 100 : 0,
      cvrMcl: 0,
    };
  }, [dailyRows]);

  const maxClicks = Math.max(...dailyRows.map((d) => d.clicks), 1);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-400 text-sm">この期間のCATSデータはありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 検索＋媒体名選択 */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm font-medium text-gray-700 flex-shrink-0">媒体名</label>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="媒体名を検索..."
          className="w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={selectedMedia || ""}
          onChange={(e) => setSelectedMedia(e.target.value || null)}
          className="flex-1 max-w-lg border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="">選択してください（{filteredMediaList.length}件）</option>
          {filteredMediaList.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}（{formatNumber(m.totalClicks)} clicks）
            </option>
          ))}
        </select>
      </div>

      {/* 未選択時 */}
      {!selectedMedia && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <svg className="mx-auto w-12 h-12 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 text-sm">媒体名を選択すると日別データが表示されます</p>
        </div>
      )}

      {/* 日別テーブル */}
      {selectedMedia && dailyRows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="table-container">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">日付</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">クリック数</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">{/* バー */}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">中間クリック数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">登録完了CV</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">登録完了CVR(CL)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">合計成果数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CTR</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CVR(CL)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CVR(MCL)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">合計売り上げ</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">成果報酬合計</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dailyRows.map((d, i) => {
                  const barWidth = (d.clicks / maxClicks) * 100;
                  const isWeekend = new Date(d.date + "T00:00:00").getDay() % 6 === 0;

                  return (
                    <tr
                      key={d.date}
                      className={`transition-colors hover:bg-blue-50/50 ${
                        isWeekend ? "bg-orange-50/30" : i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                        <span className={isWeekend ? "text-orange-600" : ""}>{formatDate(d.date)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-gray-800 whitespace-nowrap">
                        {formatNumber(d.clicks)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="w-24 h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatNumber(d.middleClicks)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatNumber(d.cv)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatPercent(d.cvrCl)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatNumber(d.totalConversions)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatPercent(d.ctr)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatPercent(d.cvr)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatPercent(d.cvrMcl)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">¥{formatNumber(d.totalRevenue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">¥{formatNumber(d.totalReward)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                <tr className="font-semibold text-gray-900">
                  <td className="px-4 py-3 text-sm">合計（{dailyRows.length}日間）</td>
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(totals.clicks)}</td>
                  <td />
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(totals.middleClicks)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(totals.cv)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatPercent(totals.cvrCl)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(totals.totalConversions)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatPercent(totals.ctr)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatPercent(totals.cvr)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatPercent(totals.cvrMcl)}</td>
                  <td className="px-4 py-3 text-sm text-right">¥{formatNumber(totals.totalRevenue)}</td>
                  <td className="px-4 py-3 text-sm text-right">¥{formatNumber(totals.totalReward)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {selectedMedia && dailyRows.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-400 text-sm">この媒体の日別データはありません</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { CampaignDailyMetrics } from "@/lib/types";

interface Props {
  data: CampaignDailyMetrics[];
  currency: string;
}

function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

function formatCurrency(n: number, currency: string): string {
  return `${currency === "JPY" ? "¥" : "$"}${formatNumber(Math.round(n))}`;
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

export default function CampaignDailyTable({ data, currency }: Props) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // キャンペーン一覧（費用降順）
  const campaigns = useMemo(() => {
    const map = new Map<string, { id: string; name: string; totalSpend: number }>();
    for (const row of data) {
      const existing = map.get(row.campaignId);
      if (existing) {
        existing.totalSpend += row.spend;
      } else {
        map.set(row.campaignId, {
          id: row.campaignId,
          name: row.campaignName,
          totalSpend: row.spend,
        });
      }
    }
    return [...map.values()].sort((a, b) => b.totalSpend - a.totalSpend);
  }, [data]);

  // 選択中のキャンペーンの日別データ（新しい日付が上）
  const dailyRows = useMemo(() => {
    if (!selectedCampaignId) return [];
    return data
      .filter((r) => r.campaignId === selectedCampaignId)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, selectedCampaignId]);

  // 合計
  const totals = useMemo(() => {
    const t = dailyRows.reduce(
      (acc, d) => ({
        spend: acc.spend + d.spend,
        impressions: acc.impressions + d.impressions,
        clicks: acc.clicks + d.clicks,
        conversions: acc.conversions + d.conversions,
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
    );
    return {
      ...t,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
      cpa: t.conversions > 0 ? t.spend / t.conversions : 0,
    };
  }, [dailyRows]);

  const maxSpend = Math.max(...dailyRows.map((d) => d.spend), 1);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-400 text-sm">この期間のキャンペーンデータはありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* キャンペーン選択 */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700 flex-shrink-0">キャンペーン</label>
        <select
          value={selectedCampaignId || ""}
          onChange={(e) => setSelectedCampaignId(e.target.value || null)}
          className="flex-1 max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="">キャンペーンを選択してください</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}（{formatCurrency(c.totalSpend, currency)}）
            </option>
          ))}
        </select>
      </div>

      {/* 未選択時 */}
      {!selectedCampaignId && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <svg className="mx-auto w-12 h-12 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 text-sm">キャンペーンを選択すると日別データが表示されます</p>
        </div>
      )}

      {/* 日別テーブル */}
      {selectedCampaignId && dailyRows.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="table-container">
            <table className="min-w-full">
              <thead className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">日付</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">費用</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">{/* バー */}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">表示回数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">クリック数</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CTR</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CV</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">CPA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {dailyRows.map((d, i) => {
                  const barWidth = (d.spend / maxSpend) * 100;
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
                        {formatCurrency(d.spend, currency)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="w-24 h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-400 rounded-full transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatNumber(d.impressions)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatNumber(d.clicks)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatPercent(d.ctr)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">{formatNumber(d.conversions)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">
                        {d.cpa > 0 ? formatCurrency(d.cpa, currency) : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
                <tr className="font-semibold text-gray-900">
                  <td className="px-4 py-3 text-sm">合計（{dailyRows.length}日間）</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(totals.spend, currency)}</td>
                  <td />
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(totals.impressions)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(totals.clicks)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatPercent(totals.ctr)}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatNumber(totals.conversions)}</td>
                  <td className="px-4 py-3 text-sm text-right">{totals.cpa > 0 ? formatCurrency(totals.cpa, currency) : "-"}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 選択済みだがデータなし */}
      {selectedCampaignId && dailyRows.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-400 text-sm">このキャンペーンの日別データはありません</p>
        </div>
      )}
    </div>
  );
}

"use client";

import { DailyMetrics } from "@/lib/types";

interface Props {
  daily: DailyMetrics[];
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

export default function DailyTable({ daily, currency }: Props) {
  // 新しい日付が上に来るように逆順にする
  const sorted = [...daily].reverse();

  // 合計
  const totals = daily.reduce(
    (acc, d) => ({
      spend: acc.spend + d.spend,
      impressions: acc.impressions + d.impressions,
      clicks: acc.clicks + d.clicks,
      conversions: acc.conversions + d.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );
  const totalCtr =
    totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
  const totalCpa =
    totals.conversions > 0 ? totals.spend / totals.conversions : 0;

  // spend の最大値（バーの幅計算用）
  const maxSpend = Math.max(...daily.map((d) => d.spend), 1);

  if (daily.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-gray-400 text-sm">この期間の日別データはありません</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="table-container">
        <table className="min-w-full">
          <thead className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                日付
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                費用
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">
                {/* 費用バー */}
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                表示回数
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                クリック数
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                CTR
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                CV
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                CPA
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((d, i) => {
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
                    <span className={isWeekend ? "text-orange-600" : ""}>
                      {formatDate(d.date)}
                    </span>
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
                  <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">
                    {formatNumber(d.impressions)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">
                    {formatNumber(d.clicks)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">
                    {formatPercent(d.ctr)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">
                    {formatNumber(d.conversions)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600 whitespace-nowrap">
                    {d.cpa > 0 ? formatCurrency(d.cpa, currency) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
            <tr className="font-semibold text-gray-900">
              <td className="px-4 py-3 text-sm">合計（{daily.length}日間）</td>
              <td className="px-4 py-3 text-sm text-right">
                {formatCurrency(totals.spend, currency)}
              </td>
              <td />
              <td className="px-4 py-3 text-sm text-right">
                {formatNumber(totals.impressions)}
              </td>
              <td className="px-4 py-3 text-sm text-right">
                {formatNumber(totals.clicks)}
              </td>
              <td className="px-4 py-3 text-sm text-right">
                {formatPercent(totalCtr)}
              </td>
              <td className="px-4 py-3 text-sm text-right">
                {formatNumber(totals.conversions)}
              </td>
              <td className="px-4 py-3 text-sm text-right">
                {totalCpa > 0 ? formatCurrency(totalCpa, currency) : "-"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

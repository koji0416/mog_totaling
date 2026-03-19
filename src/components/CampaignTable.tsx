"use client";

import { useState } from "react";
import { CampaignMetrics } from "@/lib/types";

interface Props {
  campaigns: CampaignMetrics[];
  currency: string;
}

type SortKey = keyof CampaignMetrics;
type SortDir = "asc" | "desc";

function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

function formatCurrency(n: number, currency: string): string {
  return `${currency === "JPY" ? "¥" : "$"}${formatNumber(Math.round(n))}`;
}

function formatPercent(n: number): string {
  return `${n.toFixed(2)}%`;
}

const columns: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "campaignName", label: "キャンペーン名", align: "left" },
  { key: "spend", label: "費用", align: "right" },
  { key: "impressions", label: "表示回数", align: "right" },
  { key: "clicks", label: "クリック数", align: "right" },
  { key: "ctr", label: "CTR", align: "right" },
  { key: "conversions", label: "CV", align: "right" },
  { key: "cpa", label: "CPA", align: "right" },
];

export default function CampaignTable({ campaigns, currency }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...campaigns].sort((a, b) => {
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal, "ja")
        : bVal.localeCompare(aVal, "ja");
    }
    const diff = (aVal as number) - (bVal as number);
    return sortDir === "asc" ? diff : -diff;
  });

  // 合計行
  const totals = campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      conversions: acc.conversions + c.conversions,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
  );
  const totalCtr =
    totals.impressions > 0
      ? (totals.clicks / totals.impressions) * 100
      : 0;
  const totalCpa =
    totals.conversions > 0 ? totals.spend / totals.conversions : 0;

  if (campaigns.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-400 text-sm">この期間のキャンペーンデータはありません</p>
      </div>
    );
  }

  function renderCell(c: CampaignMetrics, key: SortKey) {
    switch (key) {
      case "campaignName":
        return c.campaignName;
      case "spend":
        return formatCurrency(c.spend, currency);
      case "impressions":
        return formatNumber(c.impressions);
      case "clicks":
        return formatNumber(c.clicks);
      case "ctr":
        return formatPercent(c.ctr);
      case "conversions":
        return formatNumber(c.conversions);
      case "cpa":
        return c.cpa > 0 ? formatCurrency(c.cpa, currency) : "-";
      default:
        return "-";
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="table-container">
        <table className="min-w-full">
          <thead className="bg-gray-50/80 sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`
                    px-4 py-3 text-xs font-semibold uppercase tracking-wider cursor-pointer select-none
                    transition-colors hover:bg-gray-100
                    ${col.align === "left" ? "text-left" : "text-right"}
                    ${sortKey === col.key ? "text-blue-600" : "text-gray-500"}
                  `}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.align === "right" && sortKey === col.key && (
                      <span className="text-blue-400">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                    {col.label}
                    {col.align === "left" && sortKey === col.key && (
                      <span className="text-blue-400">
                        {sortDir === "asc" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((c, i) => (
              <tr
                key={c.campaignId}
                className={`transition-colors hover:bg-blue-50/50 ${
                  i % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`
                      px-4 py-3 text-sm whitespace-nowrap
                      ${col.align === "left" ? "text-left" : "text-right"}
                      ${col.key === "campaignName" ? "font-medium text-gray-900 max-w-[280px] truncate" : "text-gray-600"}
                      ${col.key === "spend" ? "font-semibold text-gray-800" : ""}
                    `}
                    title={col.key === "campaignName" ? c.campaignName : undefined}
                  >
                    {renderCell(c, col.key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {/* 合計行 */}
          <tfoot className="bg-gray-50 border-t-2 border-gray-200 sticky bottom-0">
            <tr className="font-semibold text-gray-900">
              <td className="px-4 py-3 text-sm text-left">
                合計（{campaigns.length}件）
              </td>
              <td className="px-4 py-3 text-sm text-right">
                {formatCurrency(totals.spend, currency)}
              </td>
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

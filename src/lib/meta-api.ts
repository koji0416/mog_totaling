import { AdAccount, InsightRow, CampaignMetrics, DailyMetrics } from "./types";

const BASE_URL = "https://graph.facebook.com/v21.0";

function getAccessToken(): string {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "META_ACCESS_TOKEN が設定されていません。.env.local ファイルを確認してください。"
    );
  }
  return token;
}

// 広告アカウント一覧を取得（ビジネスポートフォリオ情報付き）
export async function fetchAdAccounts(): Promise<AdAccount[]> {
  const token = getAccessToken();

  // まずbusiness情報付きで試行、権限エラーなら情報なしで再試行
  let data;
  const urlWithBiz = `${BASE_URL}/me/adaccounts?fields=id,name,account_status,currency,business{id,name}&limit=100&access_token=${token}`;
  const res = await fetch(urlWithBiz, { cache: "no-store" });
  data = await res.json();

  if (data.error) {
    // business_management権限がない場合、business情報なしで再試行
    if (data.error.code === 100 || data.error.message?.includes("business_management")) {
      const urlNoBiz = `${BASE_URL}/me/adaccounts?fields=id,name,account_status,currency&limit=100&access_token=${token}`;
      const res2 = await fetch(urlNoBiz, { cache: "no-store" });
      data = await res2.json();

      if (data.error) {
        throw new Error(`Meta API エラー: ${data.error.message}`);
      }
    } else {
      throw new Error(`Meta API エラー: ${data.error.message}`);
    }
  }

  return (data.data as Array<{
    id: string;
    name: string;
    account_status: number;
    currency: string;
    business?: { id: string; name: string };
  }>).map((a) => ({
    id: a.id,
    name: a.name,
    account_status: a.account_status,
    currency: a.currency,
    businessName: a.business?.name || "未割当",
    businessId: a.business?.id || "none",
  }));
}

// コンバージョンに該当するアクションタイプ
const CONVERSION_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_purchase",
  "offsite_conversion.fb_pixel_lead",
  "offsite_conversion.fb_pixel_complete_registration",
  "purchase",
  "lead",
  "complete_registration",
  "onsite_conversion.messaging_first_reply",
  "omni_purchase",
  "omni_complete_registration",
];

// インサイトの生データからCampaignMetricsに変換
function parseInsightRow(row: InsightRow): CampaignMetrics {
  // actionsからコンバージョン数を抽出
  let conversions = 0;
  if (row.actions) {
    for (const action of row.actions) {
      if (CONVERSION_ACTION_TYPES.includes(action.action_type)) {
        conversions += parseInt(action.value, 10);
      }
    }
  }

  const spend = parseFloat(row.spend) || 0;
  const cpa = conversions > 0 ? spend / conversions : 0;

  return {
    campaignName: row.campaign_name,
    campaignId: row.campaign_id,
    spend,
    impressions: parseInt(row.impressions, 10) || 0,
    clicks: parseInt(row.clicks, 10) || 0,
    ctr: parseFloat(row.ctr) || 0,
    conversions,
    cpa,
  };
}

// 特定アカウントのキャンペーン別インサイトを取得
export async function fetchAccountInsights(
  accountId: string,
  datePreset: string
): Promise<CampaignMetrics[]> {
  const token = getAccessToken();
  const fields = [
    "campaign_name",
    "campaign_id",
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "actions",
    "cost_per_action_type",
  ].join(",");

  const url = `${BASE_URL}/${accountId}/insights?fields=${fields}&level=campaign&date_preset=${datePreset}&limit=500&access_token=${token}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta API エラー: ${data.error.message}`);
  }

  if (!data.data || data.data.length === 0) {
    return [];
  }

  return (data.data as InsightRow[]).map(parseInsightRow);
}

// 日別インサイトを取得（time_increment=1 で1日ごとに分割）
export async function fetchDailyInsights(
  accountId: string,
  datePreset: string
): Promise<DailyMetrics[]> {
  const token = getAccessToken();
  const fields = [
    "spend",
    "impressions",
    "clicks",
    "ctr",
    "actions",
    "cost_per_action_type",
  ].join(",");

  const url = `${BASE_URL}/${accountId}/insights?fields=${fields}&date_preset=${datePreset}&time_increment=1&limit=500&access_token=${token}`;

  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta API エラー: ${data.error.message}`);
  }

  if (!data.data || data.data.length === 0) {
    return [];
  }

  return (data.data as InsightRow[]).map((row) => {
    let conversions = 0;
    if (row.actions) {
      for (const action of row.actions) {
        if (CONVERSION_ACTION_TYPES.includes(action.action_type)) {
          conversions += parseInt(action.value, 10);
        }
      }
    }
    const spend = parseFloat(row.spend) || 0;
    return {
      date: row.date_start,
      spend,
      impressions: parseInt(row.impressions, 10) || 0,
      clicks: parseInt(row.clicks, 10) || 0,
      ctr: parseFloat(row.ctr) || 0,
      conversions,
      cpa: conversions > 0 ? spend / conversions : 0,
    };
  });
}

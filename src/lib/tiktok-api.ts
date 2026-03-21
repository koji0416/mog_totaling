// TikTok APIレスポンスを安全にパース
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`TikTok APIが不正なレスポンスを返しました (status: ${res.status}): ${text.slice(0, 200)}`);
  }
}

interface TikTokTokenData {
  access_token: string;
  advertiser_ids: string[];
}

// 環境変数からトークンを読み込み
function loadToken(): TikTokTokenData {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const advertiserIds = process.env.TIKTOK_ADVERTISER_IDS;

  if (!accessToken || !advertiserIds) {
    throw new Error(
      "TikTokトークンが未設定です。TIKTOK_ACCESS_TOKEN と TIKTOK_ADVERTISER_IDS を環境変数に設定してください。"
    );
  }

  return {
    access_token: accessToken,
    advertiser_ids: advertiserIds.split(","),
  };
}

// --- 広告アカウント一覧 ---

export interface TikTokAdAccount {
  advertiser_id: string;
  advertiser_name: string;
  currency: string;
}

export async function fetchTikTokAdAccounts(): Promise<TikTokAdAccount[]> {
  const token = loadToken();
  const accounts: TikTokAdAccount[] = [];

  // 一括取得（最大100件ずつ）
  for (let i = 0; i < token.advertiser_ids.length; i += 100) {
    const batch = token.advertiser_ids.slice(i, i + 100);
    const url = new URL(
      "https://business-api.tiktok.com/open_api/v1.3/advertiser/info/"
    );
    url.searchParams.set("advertiser_ids", JSON.stringify(batch));

    const res = await fetch(url.toString(), {
      headers: { "Access-Token": token.access_token },
    });
    const data = await safeJson(res);

    if (data.code === 0 && data.data?.list) {
      for (const adv of data.data.list) {
        accounts.push({
          advertiser_id: adv.advertiser_id,
          advertiser_name: adv.name || adv.advertiser_name || adv.advertiser_id,
          currency: adv.currency || "JPY",
        });
      }
    }
  }

  return accounts;
}

// --- キャンペーン別レポート ---

export interface TikTokCampaignMetrics {
  campaignName: string;
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
}

export async function fetchTikTokCampaignReport(
  advertiserId: string,
  startDate: string,
  endDate: string
): Promise<TikTokCampaignMetrics[]> {
  const token = loadToken();

  const params = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    dimensions: JSON.stringify(["campaign_id"]),
    metrics: JSON.stringify([
      "campaign_name",
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "conversion",
      "cost_per_conversion",
    ]),
    data_level: "AUCTION_CAMPAIGN",
    start_date: startDate,
    end_date: endDate,
    page_size: "500",
  };

  const url = new URL("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { "Access-Token": token.access_token },
  });
  const data = await safeJson(res);

  if (data.code !== 0) {
    throw new Error(`TikTok API エラー: ${data.message}`);
  }

  if (!data.data?.list) return [];

  return data.data.list.map(
    (row: {
      dimensions: { campaign_id: string };
      metrics: {
        campaign_name: string;
        spend: string;
        impressions: string;
        clicks: string;
        ctr: string;
        conversion: string;
        cost_per_conversion: string;
      };
    }) => {
      const m = row.metrics;
      const spend = parseFloat(m.spend) || 0;
      const conversions = parseInt(m.conversion) || 0;
      return {
        campaignName: m.campaign_name,
        campaignId: row.dimensions.campaign_id,
        spend,
        impressions: parseInt(m.impressions) || 0,
        clicks: parseInt(m.clicks) || 0,
        ctr: parseFloat(m.ctr) || 0,
        conversions,
        cpa: parseFloat(m.cost_per_conversion) || 0,
      };
    }
  );
}

// --- キャンペーン別日別レポート ---

export interface TikTokCampaignDailyMetrics {
  campaignName: string;
  campaignId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
}

export async function fetchTikTokCampaignDailyReport(
  advertiserId: string,
  startDate: string,
  endDate: string
): Promise<TikTokCampaignDailyMetrics[]> {
  const token = loadToken();

  const params = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
    metrics: JSON.stringify([
      "campaign_name",
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "conversion",
      "cost_per_conversion",
    ]),
    data_level: "AUCTION_CAMPAIGN",
    start_date: startDate,
    end_date: endDate,
    page_size: "1000",
  };

  const url = new URL("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { "Access-Token": token.access_token },
  });
  const data = await safeJson(res);

  if (data.code !== 0) {
    throw new Error(`TikTok API エラー: ${data.message}`);
  }

  if (!data.data?.list) return [];

  return data.data.list.map(
    (row: {
      dimensions: { campaign_id: string; stat_time_day: string };
      metrics: {
        campaign_name: string;
        spend: string;
        impressions: string;
        clicks: string;
        ctr: string;
        conversion: string;
        cost_per_conversion: string;
      };
    }) => {
      const m = row.metrics;
      const spend = parseFloat(m.spend) || 0;
      const conversions = parseInt(m.conversion) || 0;
      return {
        campaignName: m.campaign_name,
        campaignId: row.dimensions.campaign_id,
        date: row.dimensions.stat_time_day.split(" ")[0],
        spend,
        impressions: parseInt(m.impressions) || 0,
        clicks: parseInt(m.clicks) || 0,
        ctr: parseFloat(m.ctr) || 0,
        conversions,
        cpa: parseFloat(m.cost_per_conversion) || 0,
      };
    }
  );
}

// --- 日別レポート ---

export interface TikTokDailyMetrics {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
}

export async function fetchTikTokDailyReport(
  advertiserId: string,
  startDate: string,
  endDate: string
): Promise<TikTokDailyMetrics[]> {
  const token = loadToken();

  const params = {
    advertiser_id: advertiserId,
    report_type: "BASIC",
    dimensions: JSON.stringify(["stat_time_day"]),
    metrics: JSON.stringify([
      "spend",
      "impressions",
      "clicks",
      "ctr",
      "conversion",
      "cost_per_conversion",
    ]),
    data_level: "AUCTION_ADVERTISER",
    start_date: startDate,
    end_date: endDate,
    page_size: "500",
  };

  const url = new URL("https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/");
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { "Access-Token": token.access_token },
  });
  const data = await safeJson(res);

  if (data.code !== 0) {
    throw new Error(`TikTok API エラー: ${data.message}`);
  }

  if (!data.data?.list) return [];

  return data.data.list.map(
    (row: {
      dimensions: { stat_time_day: string };
      metrics: {
        spend: string;
        impressions: string;
        clicks: string;
        ctr: string;
        conversion: string;
        cost_per_conversion: string;
      };
    }) => {
      const m = row.metrics;
      const spend = parseFloat(m.spend) || 0;
      const conversions = parseInt(m.conversion) || 0;
      return {
        date: row.dimensions.stat_time_day.split(" ")[0],
        spend,
        impressions: parseInt(m.impressions) || 0,
        clicks: parseInt(m.clicks) || 0,
        ctr: parseFloat(m.ctr) || 0,
        conversions,
        cpa: parseFloat(m.cost_per_conversion) || 0,
      };
    }
  );
}

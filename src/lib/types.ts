// Meta APIから返ってくる広告アカウント
export interface AdAccount {
  id: string; // "act_123456" 形式
  name: string;
  account_status: number;
  currency: string;
  businessName: string; // ビジネスポートフォリオ名
  businessId: string;
}

// Meta APIから返ってくるインサイト（生データ）
export interface InsightRow {
  campaign_name: string;
  campaign_id: string;
  spend: string;
  impressions: string;
  clicks: string;
  ctr: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  date_start: string;
  date_stop: string;
}

// 画面表示用に変換したキャンペーン指標
export interface CampaignMetrics {
  campaignName: string;
  campaignId: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
}

// 日別データ（アカウント全体の合計）
export interface DailyMetrics {
  date: string; // "2024-01-15" 形式
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  cpa: number;
}

// 期間フィルターの選択肢
export type DatePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "this_month"
  | "last_month";

// 期間の表示名マッピング
export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "今日",
  yesterday: "昨日",
  last_7d: "過去7日間",
  last_14d: "過去14日間",
  last_30d: "過去30日間",
  this_month: "今月",
  last_month: "先月",
};

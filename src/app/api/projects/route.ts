import { type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// 案件一覧取得
export async function GET() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("client_name")
    .order("menu_name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ projects: data });
}

// 案件作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { client_name, menu_name, platform, bizmanager_name, meta_account_id, unit_price, approval_rate, budget } = body;

  if (!client_name || !menu_name || !platform) {
    return Response.json({ error: "クライアント名、メニュー名、プラットフォームは必須です" }, { status: 400 });
  }

  // 案件名を自動生成: クライアント名_メニュー名_ビジマネ名（媒体）
  const name = bizmanager_name
    ? `${client_name}_${menu_name}_${bizmanager_name}（${platform === "meta" ? "Meta" : "TikTok"}）`
    : `${client_name}_${menu_name}（${platform === "meta" ? "Meta" : "TikTok"}）`;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name,
      client_name,
      menu_name,
      platform,
      bizmanager_name: bizmanager_name || null,
      meta_account_id: meta_account_id || null,
      unit_price: unit_price || 0,
      approval_rate: approval_rate ?? 1.0,
      budget: budget || null,
    })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ project: data }, { status: 201 });
}

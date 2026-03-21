import { type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// 案件取得
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return Response.json({ project: data });
}

// 案件更新
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { client_name, menu_name, platform, bizmanager_name, meta_account_id, unit_price, approval_rate, budget } = body;

  const name = bizmanager_name
    ? `${client_name}_${menu_name}_${bizmanager_name}（${platform === "meta" ? "Meta" : "TikTok"}）`
    : `${client_name}_${menu_name}（${platform === "meta" ? "Meta" : "TikTok"}）`;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("projects")
    .update({
      name,
      client_name,
      menu_name,
      platform,
      bizmanager_name: bizmanager_name || null,
      meta_account_id: meta_account_id || null,
      unit_price: unit_price || 0,
      approval_rate: approval_rate ?? 1.0,
      budget: budget || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ project: data });
}

// 案件削除
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true });
}

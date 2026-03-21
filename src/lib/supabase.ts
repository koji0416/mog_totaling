import { createClient } from "@supabase/supabase-js";

// サーバーサイド用（service_role key）- API routeで使用
export function createServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase環境変数が設定されていません");
  }
  return createClient(url, key);
}

// クライアントサイド用（anon key）- コンポーネントで使用
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

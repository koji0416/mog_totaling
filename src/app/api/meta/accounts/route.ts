import { fetchAdAccounts } from "@/lib/meta-api";

export async function GET() {
  try {
    const accounts = await fetchAdAccounts();
    return Response.json({ accounts });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return Response.json({ error: message }, { status: 500 });
  }
}

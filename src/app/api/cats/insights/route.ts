import { type NextRequest } from "next/server";
import { fetchCatsMediaDaily } from "@/lib/cats-api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const since = searchParams.get("since");
  const until = searchParams.get("until");

  if (!since || !until) {
    return Response.json(
      { error: "since, until パラメータが必要です" },
      { status: 400 }
    );
  }

  try {
    const data = await fetchCatsMediaDaily(since, until);
    return Response.json({ data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "不明なエラーが発生しました";
    return Response.json({ error: message }, { status: 500 });
  }
}

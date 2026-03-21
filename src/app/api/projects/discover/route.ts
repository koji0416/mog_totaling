import { fetchAdAccounts } from "@/lib/meta-api";
import { fetchCatsMediaNames } from "@/lib/cats-api";
import { discoverProjects } from "@/lib/project-matcher";

export async function GET() {
  try {
    // Meta広告アカウント一覧とCATS媒体名一覧を並行取得
    const today = new Date();
    const since = new Date(today);
    since.setDate(since.getDate() - 60);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const [metaAccounts, catsMediaNames] = await Promise.all([
      fetchAdAccounts().catch((err) => {
        console.error("Meta API error (continuing with empty):", err);
        return [];
      }),
      fetchCatsMediaNames(fmt(since), fmt(today)),
    ]);

    // 自動マッチング
    const projects = discoverProjects(
      metaAccounts.map((a) => ({ id: a.id, name: a.name, businessName: a.businessName })),
      catsMediaNames
    );

    return Response.json({
      projects,
      stats: {
        metaAccounts: metaAccounts.length,
        catsMediaNames: catsMediaNames.length,
        discoveredProjects: projects.length,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    return Response.json({ error: message }, { status: 500 });
  }
}

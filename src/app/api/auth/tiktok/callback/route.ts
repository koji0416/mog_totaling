import { NextRequest, NextResponse } from "next/server";

// TikTokからのOAuthコールバック
// MOGが認可ボタンを押すと、auth_code付きでここにリダイレクトされる
export async function GET(request: NextRequest) {
  const authCode = request.nextUrl.searchParams.get("auth_code");

  if (!authCode) {
    return new NextResponse(
      "<html><body><h1>認可に失敗しました</h1><p>auth_codeが取得できませんでした。</p></body></html>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const appId = process.env.TIKTOK_APP_ID!;
    const appSecret = process.env.TIKTOK_APP_SECRET!;

    const res = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: appId,
          secret: appSecret,
          auth_code: authCode,
        }),
      }
    );

    const data = await res.json();

    if (data.code !== 0) {
      return new NextResponse(
        `<html><body><h1>トークン取得に失敗しました</h1><p>${data.message}</p></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }

    const tokenData = data.data;
    const accessToken = tokenData.access_token;
    let advertiserIds = (tokenData.advertiser_ids || []).join(",");

    // advertiser_idsが空の場合、別APIで取得を試みる
    if (!advertiserIds) {
      const advRes = await fetch(
        `https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/?app_id=${appId}&secret=${appSecret}&access_token=${accessToken}`,
        { headers: { "Access-Token": accessToken } }
      );
      const advData = await advRes.json();
      if (advData.code === 0 && advData.data?.list) {
        advertiserIds = advData.data.list
          .map((a: { advertiser_id: string }) => a.advertiser_id)
          .join(",");
      }
    }

    // Vercelはファイル書き込み不可のため、画面に表示して環境変数に設定してもらう
    return new NextResponse(
      `<html>
      <head><meta charset="utf-8"><title>TikTok認可完了</title></head>
      <body style="font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px;">
        <h1>TikTok認可が完了しました</h1>
        <p>以下の値をVercelの環境変数に設定してください。</p>
        <h3>TIKTOK_ACCESS_TOKEN</h3>
        <textarea readonly style="width:100%; height:80px; font-size:12px;">${accessToken}</textarea>
        <h3>TIKTOK_ADVERTISER_IDS</h3>
        <textarea readonly style="width:100%; height:40px; font-size:12px;">${advertiserIds}</textarea>
        <h3>デバッグ: トークンAPIレスポンス</h3>
        <textarea readonly style="width:100%; height:120px; font-size:11px;">${JSON.stringify(data, null, 2)}</textarea>
        <p style="margin-top:20px; color:#666;">設定後に再デプロイすれば、TikTokデータが取得可能になります。</p>
      </body>
      </html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  } catch (err) {
    return new NextResponse(
      `<html><body><h1>エラーが発生しました</h1><p>${err instanceof Error ? err.message : "不明なエラー"}</p></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

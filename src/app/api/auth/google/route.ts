import { google } from "googleapis";

// Google OAuth2 認証開始: リダイレクトURLを返す
export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    scope: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  return Response.json({ authUrl: url });
}

function getRedirectUri(): string {
  // Vercel上ならproduction URL、ローカルならlocalhost
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/auth/google/callback`;
  }
  return "http://localhost:3000/api/auth/google/callback";
}

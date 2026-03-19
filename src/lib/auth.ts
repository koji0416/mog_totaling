import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "meta-dash-session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || "default-secret-change-me-in-production"
);

export async function createSession(username: string): Promise<string> {
  const token = await new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(SECRET);
  return token;
}

export async function verifySession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    await jwtVerify(token, SECRET);
    return true;
  } catch {
    return false;
  }
}

export function validateCredentials(username: string, password: string): boolean {
  const validUser = process.env.AUTH_USERNAME || "admin";
  const validPass = process.env.AUTH_PASSWORD || "password";
  return username === validUser && password === validPass;
}

export { COOKIE_NAME };

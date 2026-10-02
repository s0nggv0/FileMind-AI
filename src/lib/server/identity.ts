import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";

const developmentSecret = randomBytes(32).toString("hex");
function secret() {
  const configured = process.env.WORKSPACE_SESSION_SECRET?.trim() || undefined;
  if (configured && Buffer.byteLength(configured, "utf8") < 32) throw new Error("WORKSPACE_SESSION_SECRET must contain at least 32 bytes.");
  if (process.env.NODE_ENV === "production" && !configured && process.env.DATABASE_URL) throw new Error("WORKSPACE_SESSION_SECRET is required for persistent workspaces.");
  return configured ?? developmentSecret;
}
export async function getUserId(create = false) {
  const jar = await cookies(); const value = jar.get("filemind-session")?.value;
  if (value) {
    const [id, signature] = value.split(".");
    if (z.uuid().safeParse(id).success && signature) {
      const expected = createHmac("sha256", secret()).update(id).digest("hex");
      const a = Buffer.from(signature); const b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a, b)) return id;
    }
  }
  if (!create) return null;
  const id = crypto.randomUUID(); const signature = createHmac("sha256", secret()).update(id).digest("hex");
  jar.set("filemind-session", `${id}.${signature}`, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" && process.env.WORKSPACE_COOKIE_SECURE !== "false", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return id;
}

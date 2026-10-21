import { cookies } from "next/headers";
import { AppError, verify, validId, sign } from "./peer-core";
import { readRecord } from "./peer-store";
import type { Person } from "./peer-types";
export async function personFromRequest(request?: Request): Promise<Person> { const authorization = request?.headers.get("authorization"); const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : (await cookies()).get("peer_session")?.value; const data = token ? verify(token) : null; if (!data || data.kind !== "session" || !validId(data.uid)) throw new AppError(401, "Open je uitnodiging om te beginnen."); const p = await readRecord<Person>(`people/${data.uid}.json`); if (!p) throw new AppError(401, "Deze toegang bestaat niet meer."); return p.value; }
export async function setSession(uid: string) { (await cookies()).set("peer_session", sign({ kind: "session", uid, exp: Date.now() + 90 * 86400000 }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 90 * 86400 }); }
export function checkOrigin(request: Request) { const origin = request.headers.get("origin"); if (!origin) return; const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host"); if (new URL(origin).host !== host) throw new AppError(403, "Open dit gesprek op de oorspronkelijke website."); }

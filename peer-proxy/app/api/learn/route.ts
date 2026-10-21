import { NextRequest, NextResponse } from "next/server";
import { checkOrigin, personFromRequest } from "@/lib/peer-auth";
import { id, sign, verify, validId, AppError } from "@/lib/peer-core";
import { cleanEvents, UX_VERSION } from "@/lib/learn-core";
import { chooseVariant, recordVisit, storeBatch } from "@/lib/peer-learning";
import { changeRecord, readRecord } from "@/lib/peer-store";
import type { Invite } from "@/lib/peer-types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const visit = id();
  let variant: "a" | "b" = "a";
  let existing; try { existing = await personFromRequest(); } catch {}
  try { variant = existing?.learnVariant ?? await chooseVariant(parseInt(visit.slice(-4), 16)); } catch {}
  let cohort = existing?.cohort ?? "pilot";
  if (!existing) { const invite = request.nextUrl.searchParams.get("invite"); if (invite === process.env.PEER_TEST_ENTRY_TOKEN) cohort = "qa"; else if (validId(invite)) cohort = (await readRecord<Invite>(`invites/${invite}.json`))?.value.cohort ?? "pilot"; }
  try { await changeRecord<{ count: number }>(`learning/grant-limits/${new Date().toISOString().slice(0,10)}.json`, v => { const count = (v?.count ?? 0) + 1; if (count > 5000) throw new Error("grant-limit"); return { count }; }); if (!existing) await recordVisit(visit, variant, cohort); } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
  return NextResponse.json({ token: sign({ kind: "learning", visit, variant, version: UX_VERSION, exp: Date.now() + 24 * 3600000 }), visit, variant }, { headers: { "Cache-Control": "private,no-store" } });
}
export async function POST(request: NextRequest) {
  try {
    checkOrigin(request);
    const raw = await request.text(); if (raw.length > 18000) return NextResponse.json({ ok: false }, { status: 413 });
    const body = JSON.parse(raw), grant = typeof body.token === "string" ? verify(body.token) : null;
    if (!grant || grant.kind !== "learning" || grant.version !== UX_VERSION || !validId(grant.visit) || !validId(body.batchId) || !["a", "b"].includes(String(grant.variant))) return NextResponse.json({ ok: false }, { status: 403 });
    const events = cleanEvents(body.events); if (!events.length) return NextResponse.json({ ok: false }, { status: 400 });
    let person; try { person = await personFromRequest(); } catch (e) { if (!(e instanceof AppError) || e.status !== 401) throw e; }
    await storeBatch(grant.visit, body.batchId, grant.variant as "a" | "b", events, person);
    return NextResponse.json({ ok: true, saved: events.length, batch: body.batchId }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
}

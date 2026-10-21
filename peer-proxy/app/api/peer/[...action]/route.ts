import { after, NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AppError, cleanText, id, overlap, privatePerson, redact, sign, validId, verify } from "@/lib/peer-core";
import { changeRecord, readRecord, records, writeRecord } from "@/lib/peer-store";
import { checkOrigin, personFromRequest, setSession } from "@/lib/peer-auth";
import { proxyReply, reflection } from "@/lib/peer-ai";
import { mediate, matchPeers, findExternalPeers } from "@/lib/peer-match";
import { recordSignals, milestone } from "@/lib/peer-learning";
import { UX_VERSION, type Arm } from "@/lib/learn-core";
import { connectTelegram, disconnectTelegram, enqueueAlert, telegramAvailable, type TelegramBinding } from "@/lib/peer-telegram";
import type { CaseCard, Invite, Person, RoomMessage, SharedCase } from "@/lib/peer-types";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
type Member = { id: string; alias: string; at: number; lastSeen: number; generation: number; invited: boolean; rooms: string[] };
type Activity = { lastAt: number; lastOwner: string; waiting?: { owner: string; for: string[]; at: number } };
type Directory = { quality?: Record<string, { helpful: number; unhelpful: number }>; activity?: Record<string, Activity>; members: Record<string, Member>; cases: SharedCase[]; joins: number; shares: number };
const directoryPath = (cohort: string) => `cohorts/${cohort}/directory.json`;
const emptyDirectory = (): Directory => ({ activity: {}, members: {}, cases: [], joins: 0, shares: 0 });
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
function track(p: Person, name: keyof Arm, context?: { room?: string }) { after(() => milestone(p, name, context).catch(() => { console.warn("learning-outcome-not-saved", name); })); }
const previewHash = (text: string, topic: string) => createHash("sha256").update(JSON.stringify({ text, topic })).digest("hex");
function verifiedPreview(token: unknown, p: Person, text: string, topic: string) { const v = typeof token === "string" ? verify(token) : null; return !!v && v.kind === "share-preview" && v.uid === p.id && v.hash === previewHash(text, topic); }

async function updatePerson(uid: string, mutate: (p: Person) => Person) {
  return changeRecord<Person>(`people/${uid}.json`, p => { if (!p) throw new AppError(401, "Je toegang is verlopen."); return mutate(p); });
}
async function touch(p: Person, force = false) {
  if (!force && Date.now() - p.lastSeen < 45000) return p;
  const next = await updatePerson(p.id, x => ({ ...x, lastSeen: Date.now() }));
  await changeRecord<Directory>(directoryPath(p.cohort), d => { d ??= emptyDirectory(); d.members[p.id] = { id: p.id, alias: next.alias, at: p.createdAt, lastSeen: next.lastSeen, generation: p.generation, invited: !!p.invitedBy, rooms: next.roomIds }; return d; });
  return next;
}
function cards(p: Person, d: Directory): CaseCard[] {
  return d.cases.map(c => {
    const { owner, cohort: _cohort, ...safe } = c;
    const activity = d.activity?.[c.id];
    const match = p.matches?.find(m => m.id === c.id);
    const base = match ? match.relevance * 10 : overlap([...p.keywords, p.topic], [...c.keywords, c.topic]);
    const q = d.quality?.[c.id];
    const learned = base > 0 && q && q.helpful + q.unhelpful >= 5 ? Math.max(-0.5, Math.min(0.5, (q.helpful - q.unhelpful) / (q.helpful + q.unhelpful) * 0.5)) : 0;
    return { ...safe, own: owner === p.id, joined: p.roomIds.includes(c.id), score: base + learned, ...(match ? { reason: match.reason } : {}), online: Date.now() - (d.members[owner]?.lastSeen ?? 0) < 120000, participants: Object.values(d.members).filter(m => m.rooms.includes(c.id)).length, unread: !!activity && activity.lastOwner !== p.id && activity.lastAt > (p.lastRead?.[c.id] ?? p.createdAt), waitingForMe: !!activity?.waiting?.for.includes(p.id), waitingOnPeers: activity?.waiting?.owner === p.id };
  }).sort((a, b) => b.score - a.score || b.at - a.at);
}
async function loadState(p: Person, roomId?: string | null) {
  if (Date.now() - p.lastSeen > 1800000 && Date.now() - p.createdAt > 86400000) track(p, "returned");
  p = await touch(p);
  const d = (await readRecord<Directory>(directoryPath(p.cohort)))?.value ?? emptyDirectory();
  const allCards = cards(p, d);
  let room;
  if (roomId && validId(roomId) && p.roomIds.includes(roomId)) {
    const card = allCards.find(c => c.id === roomId);
    if (card) { const messages = (await records<RoomMessage>(`rooms/${roomId}/messages/`, 200)).sort((a, b) => a.at - b.at); if (messages.some(m => m.owner !== p.id)) track(p, "first_peer_reply", { room: roomId }); room = { case: card, messages: messages.map(({ owner: _owner, ...m }) => m) }; }
  }
  const members = Object.values(d.members);
  return { person: privatePerson(p), cases: allCards, room, stats: { participants: members.length, online: members.filter(x => Date.now() - x.lastSeen < 120000).length, sharedCases: d.cases.length, invitedParticipants: members.filter(x => x.invited).length, secondGeneration: members.filter(x => x.generation >= 2).length }, telegram: { available: telegramAvailable(), connected: !!(await readRecord<TelegramBinding>(`telegram/bindings/${p.id}.json`))?.value.enabled } };
}
async function bodyOf(request: NextRequest) {
  const raw = await request.text(); if (raw.length > 16000) throw new AppError(413, "Dit bericht is te groot.");
  try { return JSON.parse(raw || "{}"); } catch { throw new AppError(400, "Het verzoek kon niet worden gelezen."); }
}
async function roomFor(p: Person, roomId: unknown, requireJoined = true) {
  if (!validId(roomId)) throw new AppError(400, "Dit gesprek bestaat niet.");
  const d = (await readRecord<Directory>(directoryPath(p.cohort)))?.value;
  const c = d?.cases.find(x => x.id === roomId);
  if (!c || (requireJoined && !p.roomIds.includes(roomId))) throw new AppError(403, "Sluit eerst aan bij dit gesprek.");
  return c;
}

async function handle(request: NextRequest, action: string) {
  if (request.method === "POST") checkOrigin(request);
  if (action === "status") return json({ ready: !!process.env.PEER_SESSION_SECRET && !!process.env.BLOB_READ_WRITE_TOKEN, mode: "invitation", version: UX_VERSION, mediation: "ai-filtered", learning: "server-outcomes-and-client-events" });
  const body = request.method === "POST" ? await bodyOf(request) : {};
  if (action === "start") {
    try { const existing = await personFromRequest(); return json(await loadState(existing)); } catch (e) { if (!(e instanceof AppError) || e.status !== 401) throw e; }
    const token = cleanText(body.invite, 256);
    let cohort: string; let inviter: Invite | undefined;
    if (process.env.PEER_ENTRY_TOKEN && token === process.env.PEER_ENTRY_TOKEN) cohort = "pilot";
    else if (process.env.PEER_TEST_ENTRY_TOKEN && token === process.env.PEER_TEST_ENTRY_TOKEN) cohort = "qa";
    else {
      if (!validId(token)) throw new AppError(403, "Deze uitnodiging is niet geldig.");
      inviter = (await readRecord<Invite>(`invites/${token}.json`))?.value;
      if (!inviter || inviter.expiresAt < Date.now()) throw new AppError(403, "Deze uitnodiging is verlopen.");
      cohort = inviter.cohort;
    }
    const uid = id(); const now = Date.now();
    const words = ["Indigo", "Ceder", "Koraal", "Atlas", "Maan", "Duin", "Echo", "Linde"];
    const person: Person = { id: uid, cohort, alias: `${words[parseInt(uid.slice(0, 2), 16) % words.length]} ${uid.slice(2, 6).toUpperCase()}`, createdAt: now, lastSeen: now, invitedBy: inviter?.owner, generation: inviter?.generation ?? 0, variant: parseInt(uid.slice(-1), 16) % 2 ? "result" : "case", learningEnabled: body.learningEnabled !== false, roomIds: [], topic: "", keywords: [], draft: "", chat: [] };
    const grant = typeof body.learningToken === "string" ? verify(body.learningToken) : null;
    if (grant?.kind === "learning" && grant.version === UX_VERSION && ["a", "b"].includes(String(grant.variant))) { person.learnVariant = grant.variant as "a" | "b"; person.learnVersion = UX_VERSION; }
    await changeRecord<Directory>(directoryPath(cohort), d => { d ??= emptyDirectory(); if (Object.keys(d.members).length >= 100) throw new AppError(429, "Deze eerste proefgroep zit vol."); d.members[uid] = { id: uid, alias: person.alias, at: now, lastSeen: now, generation: person.generation, invited: !!inviter, rooms: [] }; d.joins++; return d; });
    await writeRecord(`people/${uid}.json`, person);
    await setSession(uid);
    track(person, "started");
    return json({ ...await loadState(person), invitedRoom: inviter?.roomId });
  }
  if (action === "recover" && body.code) {
    const v = verify(cleanText(body.code, 2000));
    if (!v || v.kind !== "recovery" || !validId(v.uid) || !await readRecord<Person>(`people/${v.uid}.json`)) throw new AppError(403, "Deze herstelcode is niet geldig of verlopen.");
    await setSession(v.uid); return json({ ok: true });
  }
  let p = await personFromRequest(request);
  if (action === "measurement") { p = await updatePerson(p.id, x => ({ ...x, learningEnabled: body.enabled === true })); return json(await loadState(p)); }
  if (action === "telegram-connect") return json({ url: await connectTelegram(p.id) });
  if (action === "telegram-disconnect") { await disconnectTelegram(p.id); return json(await loadState(p)); }
  if (action === "state") return json(await loadState(p, request.nextUrl.searchParams.get("room")));
  if (action === "recover") return json({ code: sign({ kind: "recovery", uid: p.id, exp: Date.now() + 90 * 86400000 }) });
  if (action === "chat") {
    const text = cleanText(body.text, 3000);
    if (p.chat.filter(m => m.role === "user").length >= 25) throw new AppError(429, "Je hebt de gesprekslimiet van deze proef bereikt. Je kunt verder met peers.");
    const lockPath = `locks/${p.id}.json`; const lockId = id();
    await changeRecord<{ id: string; expires: number }>(lockPath, l => { if (l && l.expires > Date.now()) throw new AppError(409, "De proxy is nog met je vorige bericht bezig."); return { id: lockId, expires: Date.now() + 125000 }; });
    try {
      p = await updatePerson(p.id, x => ({ ...x, chat: [...x.chat, { id: id(), role: "user", text, at: Date.now() }] }));
      const reply = await proxyReply(p, text);
      p = await updatePerson(p.id, x => ({ ...x, sessionId: reply.sessionId, topic: reply.topic.slice(0, 80), keywords: reply.keywords.slice(0, 5).map(k => k.slice(0, 50)), draft: redact(reply.draft).slice(0, 800), chat: [...x.chat, { id: id(), role: "assistant", text: reply.reply.slice(0, 6000), at: Date.now() }] }));
      const observed = p;
      after(() => recordSignals(observed, reply.learning).catch(() => { console.warn("content-signals-not-saved"); }));
      const directory = (await readRecord<Directory>(directoryPath(p.cohort)))?.value;
      if (directory?.cases.some(c => c.owner !== p.id)) { try { const matches = await matchPeers(p, directory.cases); p = await updatePerson(p.id, x => ({ ...x, matches })); } catch { console.warn("peer-match-deferred"); } }
      track(p, "first_message");
      return json(await loadState(p));
    } finally { await changeRecord<{ id: string; expires: number }>(lockPath, l => l?.id === lockId ? { id: lockId, expires: 0 } : l!); }
  }
  if (action === "match") {
    if (!p.chat.some(m => m.role === "user")) throw new AppError(400, "Vertel de proxy eerst wie of welke ervaring je zoekt.");
    const d = (await readRecord<Directory>(directoryPath(p.cohort)))?.value ?? emptyDirectory();
    const matches = await matchPeers(p, d.cases);
    p = await updatePerson(p.id, x => ({ ...x, matches }));
    return json(await loadState(p));
  }
  if (action === "preview") {
    const filtered = await mediate(cleanText(body.text, 1200), cleanText(body.topic || p.topic || "Gedeelde vraag", 80));
    const safe = { text: filtered.text.slice(0, 1200).trim(), topic: filtered.topic.trim() };
    return json({ ...safe, previewToken: sign({ kind: "share-preview", uid: p.id, hash: previewHash(safe.text, safe.topic), exp: Date.now() + 900000 }) });
  }
  if (action === "find") {
    const text = cleanText(body.text, 1200), topic = cleanText(body.topic, 80);
    if (body.approved !== true || !verifiedPreview(body.previewToken, p, text, topic)) throw new AppError(400, "Controleer eerst de anonieme zoekvraag voordat je buiten de groep zoekt.");
    await changeRecord<{ count: number }>(`search-limits/${p.id}-${new Date().toISOString().slice(0, 10)}.json`, v => { const count = (v?.count ?? 0) + 1; if (count > 3) throw new AppError(429, "Voor deze proef kun je drie zoekopdrachten per dag doen."); return { count }; });
    const peers = await findExternalPeers(text);
    return json({ peers, sent: false });
  }
  if (action === "share") {
    if (body.approved !== true) throw new AppError(400, "Controleer en bevestig eerst wat je wilt delen.");
    const text = redact(cleanText(body.text, 1200)); const topic = cleanText(body.topic || p.topic || "Nieuwe vraag", 80);
    if (!verifiedPreview(body.previewToken, p, text, topic)) throw new AppError(400, "Laat de proxy eerst je deelvoorstel controleren en bevestig daarna de definitieve tekst.");
    if (body.parentId) await roomFor(p, body.parentId);
    const c: SharedCase = { id: id(), owner: p.id, cohort: p.cohort, alias: p.alias, topic, text, keywords: [...new Set((topic + " " + text).toLowerCase().match(/[a-zà-ÿ]{4,}/g) || [])].slice(0, 40), at: Date.now(), ...(body.parentId ? { parentId: body.parentId } : {}) };
    await changeRecord<Directory>(directoryPath(p.cohort), d => { d ??= emptyDirectory(); if (d.cases.filter(x => x.owner === p.id).length >= 8) throw new AppError(429, "Voor deze proef kun je maximaal acht cases inbrengen."); d.cases.push(c); d.shares++; d.activity ??= {}; d.activity[c.id] = { lastAt: c.at, lastOwner: p.id, waiting: { owner: p.id, for: [], at: Date.now() } }; return d; });
    p = await updatePerson(p.id, x => ({ ...x, roomIds: [...new Set([...x.roomIds, c.id])] }));
    p = await touch(p, true);
    return json({ ...await loadState(p, c.id), roomId: c.id });
  }
  if (action === "join") {
    const c = await roomFor(p, body.roomId, false);
    p = await updatePerson(p.id, x => ({ ...x, roomIds: [...new Set([...x.roomIds, c.id])], lastRead: { ...x.lastRead, [c.id]: Date.now() } }));
    await changeRecord<Directory>(directoryPath(p.cohort), d => { d ??= emptyDirectory(); const wait = d.activity?.[c.id]?.waiting; if (wait && wait.owner !== p.id && !wait.for.includes(p.id)) wait.for.push(p.id); return d; });
    p = await touch(p, true); return json(await loadState(p, c.id));
  }
  if (action === "leave") {
    const c = await roomFor(p, body.roomId);
    p = await updatePerson(p.id, x => ({ ...x, roomIds: x.roomIds.filter(r => r !== c.id) }));
    p = await touch(p, true); return json(await loadState(p));
  }
  if (action === "read") {
    const c = await roomFor(p, body.roomId);
    p = await updatePerson(p.id, x => ({ ...x, lastRead: { ...x.lastRead, [c.id]: Date.now() } }));
    return json(await loadState(p, c.id));
  }
  if (action === "wait") {
    const c = await roomFor(p, body.roomId);
    const eventId = id();
    const prior = (await readRecord<Directory>(directoryPath(p.cohort)))?.value.activity?.[c.id]?.waiting;
    if (prior?.owner === p.id && prior.at > Date.now() - 600000) return json(await loadState(p, c.id));
    const d = await changeRecord<Directory>(directoryPath(p.cohort), d => {
      d ??= emptyDirectory(); d.activity ??= {};
      const existing = d.activity[c.id];
      if (existing?.waiting?.owner === p.id && existing.waiting.at > Date.now() - 600000) throw new AppError(429, "Je verzoek staat al open. Geef de ander even tijd.");
      d.activity[c.id] = { lastAt: existing?.lastAt ?? c.at, lastOwner: existing?.lastOwner ?? p.id, waiting: { owner: p.id, for: Object.values(d.members).filter(m => m.id !== p.id && m.rooms.includes(c.id)).map(m => m.id), at: Date.now() } };
      return d;
    });
    for (const uid of d.activity?.[c.id]?.waiting?.for ?? []) await enqueueAlert(uid, c.id, eventId);
    return json(await loadState(p, c.id));
  }
  if (action === "message") {
    const c = await roomFor(p, body.roomId); const original = cleanText(body.text, 2000);
    const messages = await records<RoomMessage>(`rooms/${c.id}/messages/`, 200);
    if (messages.length >= 180) throw new AppError(429, "Dit gesprek zit vol. Je kunt een zijgesprek starten.");
    if (messages.filter(m => m.owner === p.id && m.at > Date.now() - 60000).length >= 8) throw new AppError(429, "Even rustig aan: maximaal acht bijdragen per minuut.");
    const { text } = await mediate(original, c.topic);
    const messageId = id();
    await writeRecord(`rooms/${c.id}/messages/${String(Date.now()).padStart(14, "0")}-${messageId}.json`, { id: messageId, roomId: c.id, owner: p.id, alias: p.alias, text, at: Date.now(), mediated: true } satisfies RoomMessage);
    const d = await changeRecord<Directory>(directoryPath(p.cohort), d => {
      d ??= emptyDirectory(); d.activity ??= {};
      const existing = d.activity[c.id];
      d.activity[c.id] = { lastAt: Date.now(), lastOwner: p.id, ...(existing?.waiting?.owner === p.id ? { waiting: existing.waiting } : {}) };
      return d;
    });
    const recipients = Object.values(d.members).filter(m => m.id !== p.id && m.rooms.includes(c.id));
    for (const member of recipients) await enqueueAlert(member.id, c.id, messageId);
    return json(await loadState(p, c.id));
  }
  if (action === "invite") {
    await changeRecord<{count: number}>(`invite-limits/${p.id}-${new Date().toISOString().slice(0,10)}.json`, v => { const count = (v?.count ?? 0) + 1; if (count > 30) throw new AppError(429, "Je hebt vandaag voldoende uitnodigingen gemaakt. Morgen kun je verder."); return {count}; });
    if (body.roomId) await roomFor(p, body.roomId);
    const inviteId = id();
    const invite: Invite = { id: inviteId, owner: p.id, cohort: p.cohort, ...(body.roomId ? { roomId: body.roomId } : {}), at: Date.now(), expiresAt: Date.now() + 14 * 86400000, generation: p.generation + 1, variant: p.variant };
    await writeRecord(`invites/${inviteId}.json`, invite);
    return json({ invite: inviteId, variant: p.variant });
  }
  if (action === "reflect") {
    if (p.chat.filter(m => m.role === "user").length < 2) throw new AppError(400, "Vertel eerst iets meer over je situatie. Na twee bijdragen kan de proxy een eerste terugblik maken.");
    if (p.insight && Date.now() - p.insight.at < 60000) return json(await loadState(p));
    const d = (await readRecord<Directory>(directoryPath(p.cohort)))?.value ?? emptyDirectory();
    const relevant = d.cases.filter(c => c.owner !== p.id && overlap([...p.keywords, p.topic], [...c.keywords, c.topic]) > 0);
    const insight = await reflection(p, relevant);
    p = await updatePerson(p.id, x => ({ ...x, insight })); return json(await loadState(p));
  }
  if (action === "feedback") {
    if (!["helpful", "not-helpful", "report"].includes(body.kind)) throw new AppError(400, "Kies een geldige reactie.");
    await writeRecord(`feedback/${p.cohort}/${id()}.json`, { actor: createHash("sha256").update(p.id).digest("hex"), kind: body.kind, roomId: validId(body.roomId) ? body.roomId : null, at: Date.now() });
    if (body.kind === "helpful") track(p, "helpful");
    if (validId(body.roomId) && ["helpful", "not-helpful"].includes(body.kind)) {
      const c = await roomFor(p, body.roomId);
      let fresh = false;
      p = await updatePerson(p.id, x => { fresh = !x.matchFeedback?.[c.id]; return fresh ? { ...x, matchFeedback: { ...x.matchFeedback, [c.id]: body.kind } } : x; });
      if (fresh) await changeRecord<Directory>(directoryPath(p.cohort), d => { d ??= emptyDirectory(); d.quality ??= {}; const q = d.quality[c.id] ?? { helpful: 0, unhelpful: 0 }; if (body.kind === "helpful") q.helpful++; else q.unhelpful++; d.quality[c.id] = q; return d; });
    }
    return json({ ok: true });
  }
  throw new AppError(404, "Deze handeling bestaat niet.");
}
async function route(request: NextRequest, context: { params: Promise<{ action: string[] }> }) {
  try { const { action } = await context.params; const name = action.join("/"); if (request.method === "GET" && !["state", "status"].includes(name)) throw new AppError(405, "Deze handeling vereist een bevestiging."); return await handle(request, name); }
  catch (e) { if (!(e instanceof AppError) || e.status >= 500) { try { track(await personFromRequest(request), "failed"); } catch {} } if (e instanceof AppError) return json({ error: e.message }, e.status); console.error("peer-operation-failed", e instanceof Error ? e.name : "unknown"); return json({ error: "Dit lukte nu niet. Je kunt het nogmaals proberen." }, 503); }
}
export const GET = route;
export const POST = route;


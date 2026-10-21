import { createHmac } from "node:crypto";
import { del, list } from "@vercel/blob";
import { changeRecord, readRecord, writeRecord } from "./peer-store";
import { signingKey, validId } from "./peer-core";
import { decision, pickVariant, emptyExperiment, UX_VERSION, type Experiment, type LearnEvent, type Arm } from "./learn-core";
import type { Person } from "./peer-types";

export const actorKey = (uid: string) => createHmac("sha256", signingKey()).update(`learning:${uid}`).digest("hex").slice(0, 32);
const path = (cohort: string) => `learning/experiments/${UX_VERSION}/${cohort}.json`;
type Signals = { intent: string; needClarity: string; friction: string; nextAction: string };
type ContentSummary = { count: number; actors: Record<string, true>; labels: Record<string, number>; updatedAt: number };
export async function recordSignals(person: Person, signals: Signals) {
  if (person.learningEnabled === false) return;
  const actor = actorKey(person.id);
  // Only schema-constrained category labels; no quotations or private summaries.
  await writeRecord(`learning/content-signals/${person.cohort}/${Date.now()}-${actor}.json`, { actor, version: UX_VERSION, at: Date.now(), signals, reliability: "model-observation-unverified" });
  await changeRecord<ContentSummary>(`learning/content-summary/${person.cohort}.json`, summary => {
    summary ??= { count: 0, actors: {}, labels: {}, updatedAt: 0 };
    summary.count++; summary.actors[actor] = true;
    for (const [key, value] of Object.entries(signals)) { const label = `${key}:${value}`; summary.labels[label] = (summary.labels[label] ?? 0) + 1; }
    summary.updatedAt = Date.now(); return summary;
  });
}
export async function proxyHint(cohort: string): Promise<"default" | "reflect-need" | "clarify-once"> {
  const summary = (await readRecord<ContentSummary>(`learning/content-summary/${cohort}.json`))?.value;
  if (!summary || summary.count < 20 || Object.keys(summary.actors).length < 5) return "default";
  if ((summary.labels["friction:misunderstood"] ?? 0) / summary.count >= 0.15) return "reflect-need";
  if ((summary.labels["needClarity:unclear"] ?? 0) / summary.count >= 0.5) return "clarify-once";
  return "default";
}
export async function experiment(cohort = "pilot") { return (await readRecord<Experiment>(path(cohort)))?.value ?? emptyExperiment(); }
export async function chooseVariant(seed: number): Promise<"a" | "b"> {
  const d = decision(await experiment());
  return pickVariant(d.winner, seed);
}
export async function milestone(person: Person, name: keyof Arm, context?: { visit?: string; room?: string; source?: string }) {
  if (!person.learnVariant || person.learnVersion !== UX_VERSION || person.learningEnabled === false) return;
  const actor = actorKey(person.id);
  const k = name === "visits" ? `visit-${context?.visit}` : name;
  let fresh = false;
  await changeRecord<{ marks: Record<string, number> }>(`learning/actors/${actor}.json`, current => {
    current ??= { marks: {} }; fresh = !current.marks[k]; if (fresh) current.marks[k] = Date.now(); return current;
  });
  if (!fresh) return;
  await changeRecord<Experiment>(path(person.cohort), e => { e ??= emptyExperiment(); e.arms[person.learnVariant!][name]++; e.updatedAt = Date.now(); return e; });
  await writeRecord(`learning/outcomes/${new Date().toISOString().slice(0, 10)}/${person.cohort}/${actor}-${name}.json`, { at: Date.now(), version: UX_VERSION, variant: person.learnVariant, actor, name, ...(context?.room && validId(context.room) ? { room: context.room } : {}) });
}
export async function recordVisit(visit: string, variant: "a" | "b", cohort: string) {
  await changeRecord<Experiment>(path(cohort), e => { e ??= emptyExperiment(); e.arms[variant].visits++; e.updatedAt = Date.now(); return e; });
}
export async function storeBatch(visit: string, batch: string, variant: "a" | "b", events: LearnEvent[], person?: Person) {
  const cohort = person?.cohort ?? "unassigned";
  const day = new Date().toISOString().slice(0, 10);
  const eventPath = `learning/events/${day}/${cohort}/${visit}-${batch}.json`;
  if (await readRecord(eventPath)) return;
  await changeRecord<{ count: number }>(`learning/visit-limits/${day}/${visit}.json`, v => {
    const count = (v?.count ?? 0) + events.length;
    if (count > 600) throw new Error("visit-limit");
    return { count };
  });
  await writeRecord(eventPath, { at: Date.now(), expiresAt: Date.now() + 90 * 86400000, version: UX_VERSION, visit, batch, variant, cohort, ...(person ? { actor: actorKey(person.id) } : {}), trust: "client-reported", events });
  await changeRecord<{ counts: Record<string, number>; latency: Record<string, { n: number; ms: number }>; updatedAt: number }>(`learning/daily/${day}/${cohort}.json`, d => {
    d ??= { counts: {}, latency: {}, updatedAt: 0 };
    for (const e of events) { d.counts[e.name] = (d.counts[e.name] ?? 0) + 1; if (e.name === "api_ok" || e.name === "api_error") { const key = String(e.props.action ?? "other"); const v = d.latency[key] ?? { n: 0, ms: 0 }; v.n++; v.ms += Number(e.props.ms ?? 0); d.latency[key] = v; } }
    d.updatedAt = Date.now(); return d;
  });
}
export async function reviewLearning() {
  const e = await experiment();
  const contentSignals = (await readRecord<ContentSummary>("learning/content-summary/pilot.json"))?.value;
  const report = { at: Date.now(), version: UX_VERSION, unit: "visits_and_deduplicated_server_outcomes", experiment: e, policy: decision(e), contentSignals: contentSignals ? { count: contentSignals.count, distinctActors: Object.keys(contentSignals.actors).length, labels: contentSignals.labels, reliability: "model-observation-unverified" } : null, proxyHint: await proxyHint("pilot"), objective: "first real peer reply; errors and return visits guardrails", limitations: ["Visits are not verified unique humans", "Client events may be blocked or missing", "No causal claim before adequate observations", "No private text or summaries in analytics", "Content labels are model observations, not verified outcomes"] };
  await changeRecord(`learning/reviews/${new Date().toISOString().slice(0, 10)}.json`, () => report);
  const cutoff = Date.now() - 90 * 86400000;
  let cursor: string | undefined;
  let scanned = 0;
  do { const page = await list({ prefix: "peer/v1/learning/events/", limit: 1000, cursor }); const old = page.blobs.filter(b => new Date(b.uploadedAt).getTime() < cutoff).map(b => b.url); if (old.length) await del(old); scanned += page.blobs.length; cursor = page.hasMore ? page.cursor : undefined; } while (cursor && scanned < 10000);
  return report;
}

export const UX_VERSION = "2026-10-21-clean-1";
export const EVENT_NAMES = ["page_view", "cta_click", "view", "click", "focus", "draft", "scroll", "visibility", "page_exit", "api_ok", "api_error", "voice_start", "voice_end", "voice_error", "match_seen", "modal", "invite_copy", "invite_share", "privacy_choice", "helpful", "not_helpful"] as const;
export type LearnEvent = { name: typeof EVENT_NAMES[number]; at: number; props: Record<string, string | number | boolean> };
export type Arm = { visits: number; started: number; first_message: number; first_peer_reply: number; returned: number; helpful: number; failed: number };
export type Experiment = { version: string; arms: Record<"a" | "b", Arm>; updatedAt: number };
export const emptyArm = (): Arm => ({ visits: 0, started: 0, first_message: 0, first_peer_reply: 0, returned: 0, helpful: 0, failed: 0 });
export const emptyExperiment = (): Experiment => ({ version: UX_VERSION, arms: { a: emptyArm(), b: emptyArm() }, updatedAt: Date.now() });
export function pickVariant(winner: "a" | "b" | null, seed: number): "a" | "b" { return winner ? seed % 10 < 8 ? winner : winner === "a" ? "b" : "a" : seed % 2 ? "a" : "b"; }
const words = new Set(["landing", "chat", "peers", "mirror", "room", "share", "invite", "recovery", "privacy", "telegram", "find", "none", "control", "composer", "restore", "begin", "preview", "message", "start", "join", "leave", "read", "wait", "reflect", "feedback", "recover", "state", "telegram-connect", "telegram-disconnect", "match", "visible", "hidden", "small", "medium", "large", "empty", "short", "long", "a", "b", "pointer", "keyboard", "timer", "pagehide", "navigation", "enabled", "disabled", "chat_success", "room_success", "other", "open", "close"]);
const textKeys = new Set(["view", "from", "to", "action", "field", "size", "bucket", "variant", "reason", "state"]);
const numberKeys = new Set(["ms", "count", "position", "depth", "status", "score"]);
export function cleanEvents(input: unknown, now = Date.now()): LearnEvent[] {
  if (!Array.isArray(input) || input.length > 30) return [];
  return input.flatMap(value => {
    if (!value || typeof value !== "object" || !EVENT_NAMES.includes(value.name)) return [];
    const props: LearnEvent["props"] = {};
    if (value.props && typeof value.props === "object") for (const [key, v] of Object.entries(value.props)) {
      if (textKeys.has(key) && typeof v === "string" && words.has(v)) props[key] = v;
      if (numberKeys.has(key) && typeof v === "number" && Number.isFinite(v)) props[key] = Math.max(0, Math.min(key === "ms" ? 86400000 : 100000, Math.round(v)));
    }
    return [{ name: value.name, at: typeof value.at === "number" && Number.isFinite(value.at) ? Math.max(now - 3600000, Math.min(now, value.at)) : now, props }];
  });
}
export function interval(successes: number, n: number) {
  if (!n) return [0, 1];
  const p = successes / n, z = 1.96, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const radius = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / d;
  return [Math.max(0, center - radius), Math.min(1, center + radius)];
}
export function decision(e: Experiment): { winner: "a" | "b" | null; reason: string } {
  const { a, b } = e.arms;
  if (a.visits < 40 || b.visits < 40 || a.first_peer_reply < 10 || b.first_peer_reply < 10) return { winner: null, reason: "collecting_real_peer_outcomes" };
  const aa = interval(a.first_peer_reply, a.visits), bb = interval(b.first_peer_reply, b.visits);
  const candidate = aa[0] > bb[1] ? "a" : bb[0] > aa[1] ? "b" : null;
  if (!candidate) return { winner: null, reason: "no_clear_difference" };
  const w = e.arms[candidate], l = e.arms[candidate === "a" ? "b" : "a"];
  if (w.failed / w.visits > l.failed / l.visits + 0.02) return { winner: null, reason: "error_guardrail" };
  if (w.returned / w.visits + 0.02 < l.returned / l.visits) return { winner: null, reason: "return_guardrail" };
  return { winner: candidate, reason: "peer_outcomes_with_guardrails" };
}

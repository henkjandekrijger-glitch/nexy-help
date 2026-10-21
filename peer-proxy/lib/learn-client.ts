"use client";
import { UX_VERSION } from "./learn-core";
type Props = Record<string, string | number | boolean>;
let token = "", variant: "a" | "b" = "a", disabled = false, flushing = false;
let queue: { name: string; at: number; props: Props }[] = [];
let pending: { batchId: string; events: typeof queue } | null = null;
let view = "landing";
export const learningToken = () => token;
export const learn = (name: string, props: Props = {}) => { if (!disabled && queue.length < 300) queue.push({ name, at: Date.now(), props: { view, ...props } }); };
export function learnView(next: string) { view = next; learn("view", { to: next }); }
export function setLearning(enabled: boolean) { disabled = !enabled; if (enabled && !token) void fetch("/api/learn", { cache: "no-store" }).then(r => r.json()).then(d => { token = d.token || ""; }).catch(() => {}); if (disabled) { queue = []; pending = null; } try { localStorage.setItem("peer-measurement", enabled ? "yes" : "no"); } catch {} }
export const learningEnabled = () => !disabled;
export async function flushLearning(beacon = false) {
  if (disabled || !token || (flushing && !beacon) || (!queue.length && !pending)) return;
  if (beacon && navigator.sendBeacon) {
    const batches = pending ? [pending] : [];
    while (queue.length && batches.length < 3) batches.push({ batchId: crypto.randomUUID().replaceAll("-", ""), events: queue.splice(0, 30) });
    for (const batch of batches) navigator.sendBeacon("/api/learn", new Blob([JSON.stringify({ token, ...batch })], { type: "application/json" }));
    pending = batches.at(-1) ?? pending; return;
  }
  pending ??= { batchId: crypto.randomUUID().replaceAll("-", ""), events: queue.splice(0, 30) };
  const sendingId = pending.batchId;
  const payload = JSON.stringify({ token, ...pending });
  flushing = true;
  try { const r = await fetch("/api/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }); if (r.ok && pending?.batchId === sendingId) pending = null; } catch {} finally { flushing = false; }
}
export async function initLearning(): Promise<{ variant: "a" | "b"; cleanup: () => void }> {
  try { disabled = localStorage.getItem("peer-measurement") === "no"; } catch {}
  try { if (!disabled) { const invite = new URLSearchParams(location.search).get("invite"); const r = await fetch(`/api/learn${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`, { cache: "no-store" }); if (r.ok) { const d = await r.json(); token = d.token; variant = d.variant; } } } catch {}
  const started = performance.now();
  learn("page_view", { size: innerWidth < 600 ? "small" : innerWidth < 1100 ? "medium" : "large" });
  const click = (e: MouseEvent) => { const el = (e.target as Element)?.closest<HTMLElement>("button,a"); if (el) learn("click", { action: el.dataset.track || "control" }); };
  const focus = (e: FocusEvent) => { if ((e.target as Element)?.matches("textarea,input")) learn("focus", { field: "composer" }); };
  let lastBucket = "", maxDepth = 0;
  const input = (e: Event) => { const el = e.target as HTMLTextAreaElement; if (!el.matches("textarea") || el.id === "restore") return; const bucket = !el.value.length ? "empty" : el.value.length < 80 ? "short" : el.value.length < 400 ? "medium" : "long"; if (bucket !== lastBucket) { lastBucket = bucket; learn("draft", { bucket }); } };
  const scroll = () => { const el = document.scrollingElement; if (!el) return; const depth = Math.min(100, Math.round((el.scrollTop + innerHeight) / Math.max(el.scrollHeight, innerHeight) * 4) * 25); if (depth > maxDepth) { maxDepth = depth; learn("scroll", { depth }); } };
  const visibility = () => { learn("visibility", { state: document.visibilityState, ms: performance.now() - started }); if (document.visibilityState === "hidden") void flushLearning(true); };
  const exit = () => { learn("page_exit", { ms: performance.now() - started, reason: "pagehide" }); void flushLearning(true); };
  document.addEventListener("click", click); document.addEventListener("focusin", focus); document.addEventListener("input", input); document.addEventListener("scroll", scroll, { passive: true }); document.addEventListener("visibilitychange", visibility); window.addEventListener("pagehide", exit);
  const timer = setInterval(() => void flushLearning(), 8000);
  void flushLearning();
  return { variant, cleanup: () => { clearInterval(timer); document.removeEventListener("click", click); document.removeEventListener("focusin", focus); document.removeEventListener("input", input); document.removeEventListener("scroll", scroll); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("pagehide", exit); void flushLearning(true); } };
}

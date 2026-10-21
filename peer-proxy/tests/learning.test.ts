import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanEvents, decision, pickVariant, emptyExperiment } from "../lib/learn-core.ts";
test("adaptive allocation preserves 20 percent exploration for either winning arm", () => {
  for (const winner of ["a", "b"] as const) assert.equal(Array.from({ length: 100 }, (_, seed) => pickVariant(winner, seed)).filter(v => v === winner).length, 80);
  assert.equal(Array.from({ length: 100 }, (_, seed) => pickVariant(null, seed)).filter(v => v === "a").length, 50);
});
test("analytics rejects private text, arbitrary URLs, and content disguised as action labels", () => {
  const result = cleanEvents([{ name: "click", at: Date.now(), props: { action: "my secret@example.com", text: "private words", url: "https://example.com/?secret=x", view: "chat", status: 200 } }]);
  assert.deepEqual(result[0].props, { view: "chat", status: 200 });
  assert.ok(!JSON.stringify(result).includes("secret"));
});
test("analytics bounds malformed timestamps, numeric values, and batch sizes", () => {
  const result = cleanEvents([{ name: "api_ok", at: Infinity, props: { ms: -50, count: Infinity, status: 200 } }, { name: "secret custom event" }], 10000);
  assert.equal(result.length, 1); assert.equal(result[0].at, 10000); assert.equal(result[0].props.ms, 0); assert.equal(result[0].props.count, undefined);
  assert.deepEqual(cleanEvents(Array.from({ length: 31 }, () => ({ name: "click" }))), []);
});
test("more CTA clicks or first messages cannot substitute for actual peer outcomes", () => {
  const e = emptyExperiment(); e.arms.a.visits = e.arms.b.visits = 1000; e.arms.a.started = 900; e.arms.b.started = 20; e.arms.a.first_message = 800;
  assert.equal(decision(e).winner, null);
});
test("routing requires sufficient real outcomes and a clear difference", () => {
  const e = emptyExperiment(); e.arms.a.visits = e.arms.b.visits = 1000; e.arms.a.first_peer_reply = 120; e.arms.b.first_peer_reply = 20;
  assert.equal(decision(e).winner, "a");
  e.arms.b.first_peer_reply = 115; assert.equal(decision(e).winner, null);
});
test("error and return guardrails can veto a seemingly stronger variant", () => {
  const e = emptyExperiment(); e.arms.a.visits = e.arms.b.visits = 1000; e.arms.a.first_peer_reply = 120; e.arms.b.first_peer_reply = 20; e.arms.a.failed = 50;
  assert.equal(decision(e).reason, "error_guardrail");
  e.arms.a.failed = 0; e.arms.b.returned = 80; assert.equal(decision(e).reason, "return_guardrail");
});

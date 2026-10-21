import { del } from "@vercel/blob";
import { id, AppError } from "./peer-core";
import { readRecord, writeRecord, changeRecord, records } from "./peer-store";

export type TelegramBinding = { uid: string; chatId: number; enabled: boolean; at: number };
type Alert = { id: string; uid: string; roomId: string; attempts: number; sent: boolean; nextAt: number; at: number };
export const telegramAvailable = () => !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_USERNAME && process.env.TELEGRAM_WEBHOOK_SECRET);
export async function telegramCall(method: string, data: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new AppError(503, "De Telegram-bot is nog niet gekoppeld.");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), signal: AbortSignal.timeout(10000) });
  const response = await r.json();
  if (!r.ok || !response.ok) throw new Error("TelegramDeliveryFailed");
  return response.result;
}
export async function connectTelegram(uid: string) {
  if (!telegramAvailable()) throw new AppError(503, "De Telegram-bot moet nog eenmalig aan deze proef worden gekoppeld. Je reacties blijven hier bewaard.");
  const nonce = id();
  await writeRecord(`telegram/connect/${nonce}.json`, { uid, expires: Date.now() + 15 * 60000, used: false });
  const username = process.env.TELEGRAM_BOT_USERNAME!.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]+$/.test(username)) throw new AppError(503, "De botnaam is nog niet juist ingesteld.");
  return `https://t.me/${username}?start=p_${nonce}`;
}
export async function disconnectTelegram(uid: string) {
  await changeRecord<TelegramBinding>(`telegram/bindings/${uid}.json`, b => ({ uid, chatId: b?.chatId ?? 0, at: Date.now(), enabled: false }));
}
async function deliver(alert: Alert) {
  const lockId = id();
  try {
    await changeRecord<{ id: string; expires: number }>(`telegram/locks/${alert.id}.json`, l => { if (l && l.expires > Date.now()) throw new Error("AlreadySending"); return { id: lockId, expires: Date.now() + 30000 }; });
  } catch { return; }
  try {
    const latest = (await readRecord<Alert>(`telegram/outbox/${alert.id}.json`))?.value;
    if (!latest || latest.sent) return;
    const binding = (await readRecord<TelegramBinding>(`telegram/bindings/${alert.uid}.json`))?.value;
    if (!binding?.enabled) { await writeRecord(`telegram/sent/${alert.id}.json`, { ...latest, sent: true }); await del(`peer/v1/telegram/outbox/${alert.id}.json`); return; }
    const host = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://peer-proxy-nine.vercel.app");
    await telegramCall("sendMessage", { chat_id: binding.chatId, text: "Er ligt een nieuwe reactie of vraag voor je klaar in Samen. Je kunt verdergaan wanneer het jou past.", reply_markup: { inline_keyboard: [[{ text: "Open je gesprek", url: `${host}/?room=${alert.roomId}` }]] } });
    await writeRecord(`telegram/sent/${alert.id}.json`, { ...latest, sent: true, attempts: latest.attempts + 1 });
    await del(`peer/v1/telegram/outbox/${alert.id}.json`);
  } catch {
    await changeRecord<Alert>(`telegram/outbox/${alert.id}.json`, a => ({ ...a!, attempts: (a?.attempts ?? 0) + 1, nextAt: Date.now() + 5 * 60000 }));
  } finally { await changeRecord<{ id: string; expires: number }>(`telegram/locks/${alert.id}.json`, l => l?.id === lockId ? { id: lockId, expires: 0 } : l!); }
}
export async function enqueueAlert(uid: string, roomId: string, eventId: string) {
  const binding = (await readRecord<TelegramBinding>(`telegram/bindings/${uid}.json`))?.value;
  if (!binding?.enabled || !telegramAvailable()) return;
  const alertId = `${eventId}-${uid}`;
  if (await readRecord<Alert>(`telegram/sent/${alertId}.json`)) return;
  const alert: Alert = { id: alertId, uid, roomId, attempts: 0, sent: false, at: Date.now(), nextAt: Date.now() };
  try { await writeRecord(`telegram/outbox/${alertId}.json`, alert); } catch { return; }
  await deliver(alert);
}
export async function retryAlerts() {
  const pending = (await records<Alert>("telegram/outbox/", 500)).filter(a => !a.sent && a.at > Date.now() - 86400000 && a.attempts < 4 && a.nextAt <= Date.now()).slice(0, 20);
  for (const alert of pending) await deliver(alert);
  return pending.length;
}

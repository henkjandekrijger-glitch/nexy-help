import { timingSafeEqual } from "node:crypto";
import { changeRecord, readRecord, writeRecord } from "@/lib/peer-store";
import { validId } from "@/lib/peer-core";
import { telegramCall, disconnectTelegram, type TelegramBinding } from "@/lib/peer-telegram";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const actual = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET || "";
  if (!expected || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return new Response("Unauthorized", { status: 401 });
  const raw = await request.text(); if (raw.length > 20000) return new Response("Too large", { status: 413 });
  let update; try { update = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!Number.isSafeInteger(update.update_id)) return Response.json({ ok: true });
  const message = update.message;
  if (!message || message.chat?.type !== "private" || !Number.isSafeInteger(message.chat?.id)) return Response.json({ ok: true });
  const chatId = message.chat.id; const text = String(message.text || "");
  if (text === "/stop") {
    const owner = (await readRecord<{ uid: string }>(`telegram/chats/${chatId}.json`))?.value;
    if (owner) await disconnectTelegram(owner.uid);
    await telegramCall("sendMessage", { chat_id: chatId, text: "Meldingen staan uit. Je kunt ze later opnieuw aanzetten vanuit je gesprek." });
    return Response.json({ ok: true });
  }
  const match = text.match(/^\/start(?:@\w+)?\s+p_([a-f0-9]{32})$/);
  if (match && validId(match[1])) {
    const path = `telegram/connect/${match[1]}.json`;
    const nonce = (await readRecord<{ uid: string; expires: number; used: boolean }>(path))?.value;
    if (!nonce || nonce.used || nonce.expires < Date.now()) return Response.json({ ok: true });
    let consumed = false;
    try { await changeRecord<{ uid: string; expires: number; used: boolean }>(path, n => { if (!n || n.used || n.expires < Date.now()) throw new Error("Expired"); consumed = true; return { ...n, used: true }; }); } catch { return Response.json({ ok: true }); }
    if (consumed) {
      const old = (await readRecord<{ uid: string }>(`telegram/chats/${chatId}.json`))?.value;
      if (old && old.uid !== nonce.uid) await disconnectTelegram(old.uid);
      await changeRecord<TelegramBinding>(`telegram/bindings/${nonce.uid}.json`, () => ({ uid: nonce.uid, chatId, enabled: true, at: Date.now() }));
      await changeRecord<{ uid: string }>(`telegram/chats/${chatId}.json`, () => ({ uid: nonce.uid }));
      await telegramCall("sendMessage", { chat_id: chatId, text: "Je meldingen staan aan. Je krijgt hier een seintje bij een nieuwe reactie of een verzoek om jouw bijdrage. Je privégesprek en persoonlijke spiegel worden niet meegestuurd. Uitzetten kan met /stop." });
    }
  } else if (text === "/start" || text === "/help") await telegramCall("sendMessage", { chat_id: chatId, text: "Koppel meldingen met de Telegram-knop in je gesprek op Samen. Gebruik /stop om meldingen uit te zetten." });
  return Response.json({ ok: true });
}

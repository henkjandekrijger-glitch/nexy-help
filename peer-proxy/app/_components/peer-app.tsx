"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, AudioLines, Bell, Clock3, Check, ChevronRight, Copy, CornerDownRight, EyeOff, GitBranch, Headphones, Link2, Loader2, LockKeyhole, Menu, MessageCircle, Mic, Plus, Send, ShieldCheck, Sparkles, Square, ThumbsDown, ThumbsUp, Users, X } from "lucide-react";
import { initLearning, learn, learnView, learningToken, setLearning, learningEnabled } from "@/lib/learn-client";
import type { CaseCard, PeerState } from "@/lib/peer-types";

type View = "chat" | "peers" | "mirror" | "room";
type Modal = "share" | "invite" | "recovery" | "privacy" | "telegram" | "find" | null;
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; onresult: ((e: { results: { isFinal: boolean; 0: { transcript: string } }[]; resultIndex: number }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void };

async function api(action: string, body?: unknown) {
  const started = performance.now();
  const name = action.split("?")[0];
  try {
    const payload = body === undefined ? undefined : { ...(body as Record<string, unknown>), learningToken: learningToken() };
    const r = await fetch(`/api/peer/${action}`, { method: body === undefined ? "GET" : "POST", credentials: "same-origin", headers: body === undefined ? {} : { "Content-Type": "application/json" }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
    const data = await r.json();
    if (!r.ok) { learn("api_error", { action: name, status: r.status, ms: performance.now() - started }); throw Object.assign(new Error(data.error || "Dat lukte nu niet."), { status: r.status }); }
    if (name !== "state" && name !== "read") learn("api_ok", { action: name, ms: performance.now() - started });
    return data;
  } catch (e) { if (!(e as { status?: number }).status) learn("api_error", { action: name, status: 0, ms: performance.now() - started }); throw e; }
}
const relative = (at: number) => { const mins = Math.floor((Date.now() - at) / 60000); return mins < 1 ? "zojuist" : mins < 60 ? `${mins} min geleden` : mins < 1440 ? `${Math.floor(mins / 60)} uur geleden` : `${Math.floor(mins / 1440)} dagen geleden`; };

export default function PeerApp() {
  const [state, setState] = useState<PeerState | null>(null);
  const [beginning, setBeginning] = useState(false);
  const [ctaVariant, setCtaVariant] = useState<"a" | "b">("a");
  const [measurement, setMeasurement] = useState(true);
  const [previewToken, setPreviewToken] = useState("");
  const [externalPeers, setExternalPeers] = useState<{ title: string; url: string; excerpt: string }[]>([]);
  const [introLink, setIntroLink] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [input, setInput] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [shareText, setShareText] = useState("");
  const [shareTopic, setShareTopic] = useState("");
  const [parentId, setParentId] = useState<string | undefined>();
  const [approved, setApproved] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [recovery, setRecovery] = useState("");
  const [restoreCode, setRestoreCode] = useState("");
  const [showRestore, setShowRestore] = useState(false);
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [feedback, setFeedback] = useState("");
  const speech = useRef<Recognition | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const roomRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let disposed = false; let cleanup: (() => void) | undefined;
    void initLearning().then(result => { if (disposed) result.cleanup(); else { cleanup = result.cleanup; setCtaVariant(result.variant); setMeasurement(learningEnabled()); } });
    return () => { disposed = true; cleanup?.(); };
  }, []);
  useEffect(() => { learnView(state ? view : beginning ? "chat" : "landing"); }, [view, !!state, beginning]);
  useEffect(() => { learn("modal", { action: modal ? "open" : "close", view: modal || "none" }); }, [modal]);
  useEffect(() => { roomRef.current = roomId; }, [roomId]);
  useEffect(() => { busyRef.current = !!busy; }, [busy]);
  useEffect(() => {
    setInvite(new URLSearchParams(window.location.search).get("invite") || "");
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    setMicSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
    api("state").then(async s => { setState(s); const requested = new URLSearchParams(window.location.search).get("room"); if (requested && s.cases.some((c: CaseCard) => c.id === requested && c.joined)) { setState(await api(`state?room=${requested}`)); setRoomId(requested); setView("room"); } }).catch(e => { if (e.status !== 401) setError(e.message); }).finally(() => setLoaded(true));
    return () => speech.current?.stop();
  }, []);
  useEffect(() => {
    if (!state) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || busyRef.current) return;
      api(`state${roomRef.current ? `?room=${roomRef.current}` : ""}`).then(setState).catch(() => {});
    }, 10000);
    return () => clearInterval(timer);
  }, [!!state]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [state?.person.chat.length, state?.room?.messages.length, busy]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(t); }, [notice]);

  const run = useCallback(async (name: string, task: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(name); setError("");
    try { await task(); } catch (e) { setError(e instanceof Error ? e.message : "Dat lukte nu niet."); }
    finally { busyRef.current = false; setBusy(null); }
  }, []);

  async function startAndSend() {
    const text = input.trim(); if (!text) return;
    await run("chat", async () => {
      if (!state) {
        const initial = await api("start", { invite, learningEnabled: learningEnabled() }); setState(initial);
        window.history.replaceState(null, "", window.location.pathname);
      }
      setInput(""); setView("chat");
      try { setState(await api("chat", { text })); }
      catch (e) { setState(await api("state")); throw e; }
    });
  }
  function changeView(next: View) { setView(next); setInput(""); setError(""); setMobileMenu(false); }
  function prepareShare(branch?: string) {
    setParentId(branch); setShareText(branch ? "" : state?.person.draft || "");
    setShareTopic(branch ? "" : state?.person.topic || ""); setApproved(false); setPreviewToken(""); setModal("share");
  }
  async function previewContribution() {
    await run("preview", async () => { const r = await api("preview", { text: shareText, topic: shareTopic || "Gedeelde vraag" }); setShareText(r.text); setShareTopic(r.topic); setPreviewToken(r.previewToken); setApproved(false); });
  }
  function prepareFind() { setShareText(state?.person.draft || ""); setShareTopic(state?.person.topic || "Gezochte ervaring"); setPreviewToken(""); setApproved(false); setExternalPeers([]); setIntroLink(""); setModal("find"); }
  async function searchOutside() {
    await run("find", async () => { const r = await api("find", { text: shareText, topic: shareTopic, approved, previewToken }); setExternalPeers(r.peers); });
  }
  async function createIntro() { await run("invite", async () => { const r = await api("invite", {}); setIntroLink(`${location.origin}/?invite=${r.invite}`); }); }
  async function publishCase() {
    await run("share", async () => { const s = await api("share", { text: shareText, topic: shareTopic, approved, parentId, previewToken }); setState(s); setRoomId(s.roomId); setView("room"); setInput(""); setModal(null); });
  }
  async function join(card: CaseCard) {
    await run("join", async () => { setState(await api("join", { roomId: card.id })); setRoomId(card.id); changeView("room"); });
  }
  async function sendRoom() {
    const text = input.trim(); if (!text || !roomId) return;
    await run("message", async () => { setState(await api("message", { roomId, text })); setInput(""); });
  }
  async function makeInvite(forRoom = false) {
    await run("invite", async () => {
      const r = await api("invite", { ...(forRoom && roomId ? { roomId } : {}) });
      setShareLink(`${window.location.origin}/?invite=${r.invite}`); setModal("invite");
    });
  }
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); if (text.includes("?invite=")) learn("invite_copy"); setNotice("Gekopieerd"); } catch { setNotice("Selecteer de link en kopieer hem handmatig."); } }
  function record() {
    if (listening) { speech.current?.stop(); return; }
    learn("voice_start");
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition; if (!Constructor) return;
    const recognition = new Constructor(); recognition.lang = "nl-NL"; recognition.interimResults = false; recognition.continuous = false;
    recognition.onresult = e => { const t = Array.from(e.results).filter(r => r.isFinal).map(r => r[0].transcript).join(" "); setInput(old => `${old}${old ? " " : ""}${t}`.slice(0, view === "room" ? 2000 : 3000)); };
    recognition.onend = () => { learn("voice_end"); setListening(false); };
    recognition.onerror = () => { learn("voice_error"); setListening(false); setError("Inspreken is nu niet beschikbaar. Je kunt je bericht typen."); };
    speech.current = recognition; setListening(true);
    try { recognition.start(); } catch { setListening(false); }
  }
  async function reflect() { await run("reflect", async () => setState(await api("reflect", {}))); }
  async function react(kind: string) { await run("feedback", async () => { await api("feedback", { kind, roomId }); setFeedback(kind); setNotice(kind === "report" ? "Je melding is vastgelegd." : "Dank je. Je reactie is bewaard."); }); }
  const matching = state?.cases.filter(c => !c.own && c.score > 0) || [];
  const joined = state?.cases.filter(c => c.joined) || [];
  const room = state?.room;
  const personal = state?.person.insight;
  useEffect(() => {
    if (view !== "room" || !roomId || !state?.room?.case.unread || document.visibilityState !== "visible") return;
    api("read", { roomId }).then(setState).catch(() => {});
  }, [view, roomId, state?.room?.messages.length, state?.room?.case.unread]);
  async function telegram() {
    setShareLink(""); setModal("telegram");
    if (state?.telegram?.available && !state.telegram.connected) await run("telegram", async () => { const r = await api("telegram-connect", {}); setShareLink(r.url); });
  }
  const noChat = !state?.person.chat.length;
  useEffect(() => {
    if (view !== "peers") return;
    const observer = new IntersectionObserver(entries => { for (const entry of entries) if (entry.isIntersecting) { const el = entry.target as HTMLElement; learn("match_seen", { position: Number(el.dataset.position || 0), score: Number(el.dataset.score || 0) }); observer.unobserve(el); } }, { threshold: 0.6 });
    document.querySelectorAll(".case-card").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [view, state?.cases.map(c => c.id).join(",")]);

  const composer = (landing = false) => <div className={`composer ${landing ? "composer-landing" : ""}`}>
    <textarea ref={textArea} aria-label={view === "room" ? "Bericht aan deelnemers" : "Je bericht aan de proxy"} value={input} maxLength={view === "room" ? 2000 : 3000} placeholder={view === "room" ? "Wat wil je via de proxy bijdragen?" : "Vertel wat je bezighoudt of wie je zoekt…"} rows={landing ? 3 : 2} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !listening) { e.preventDefault(); void (view === "room" ? sendRoom() : startAndSend()); } }} disabled={!!busy} />
    <div className="composer-bottom"><span className="composer-hint">{listening ? "Ik luister…" : view === "room" ? "De AI filtert je bijdrage vóór het delen." : "Jouw gesprek begint privé."}</span><div className="composer-buttons"><button className={`icon-button mic ${listening ? "listening" : ""}`} onClick={record} disabled={!micSupported || !!busy} aria-label={listening ? "Stop inspreken" : "Spreek je bericht in"} title={micSupported ? "Inspreken; controleer de tekst vóór versturen" : "Je browser ondersteunt inspreken niet; typen werkt wel"}>{listening ? <Square size={18} /> : <Mic size={19} />}</button><button className="send-button" aria-label="Verstuur bericht" disabled={!input.trim() || !!busy || (!state && !invite)} onClick={() => void (view === "room" ? sendRoom() : startAndSend())}>{busy === "chat" || busy === "message" ? <Loader2 className="spin" size={20} /> : <ArrowUp size={21} />}</button></div></div>
  </div>;

  return <div className="app-shell">
    <header className="topbar"><a className="wordmark" href="/" onClick={e => { e.preventDefault(); if (state) changeView("chat"); else setBeginning(false); }}>samen<span>.</span></a><div className="topbar-actions">{state && <><button className="quiet-button privacy-top" onClick={() => setModal("privacy")}><ShieldCheck size={15} /> Anoniem voor elkaar</button><button className="outline-button invite-top" onClick={() => void makeInvite()}><Plus size={15} /> Nodig iemand uit</button><button className="icon-button mobile-menu" aria-label="Open menu" onClick={() => setMobileMenu(!mobileMenu)}><Menu size={21} /></button></>}</div></header>

    {!state ? <main className={`landing clean-landing ${beginning ? "has-started" : ""}`}>
      {beginning ? <div className="begin-chat"><div className="proxy-symbol"><AudioLines size={25} /></div><h1>Wie zou jou<br />verder helpen?</h1><p className="hero-copy">Begin gewoon te praten. Je AI zoekt met je mee.</p>{composer(true)}<p className="start-note">Je begint privé. Jij kiest wat je deelt.</p></div> : <div className="entry-content"><div className="entry-mark"><AudioLines size={26} /></div><h1>Praat.<br />Vind elkaar<span>.</span></h1><p className="hero-copy">Anoniem voor elkaar.<br />Met AI die filtert, matcht en verbindt.</p><button className="primary-button entry-cta" data-track="begin" disabled={!loaded || !invite} onClick={() => { learn("cta_click", { action: "begin", variant: ctaVariant }); setBeginning(true); requestAnimationFrame(() => textArea.current?.focus()); }}>{!loaded ? <Loader2 className="spin" size={18} /> : null}{ctaVariant === "b" ? "Vind mijn mensen" : "Begin een gesprek"}<ArrowUpRight size={18} /></button>{loaded && !invite && <p className="start-note">Open je uitnodigingslink om te beginnen.</p>}</div>}
      {error && <div className="error" role="alert">{error}</div>}
      <footer className="entry-footer"><button onClick={() => setModal("privacy")}>Privacy & toegang</button></footer>
    </main> : <div className="workspace">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}><div className="sidebar-section-title">JOUW RUIMTE</div><nav><button className={view === "chat" ? "active" : ""} onClick={() => changeView("chat")}><MessageCircle size={18} /> Mijn gesprek <LockKeyhole className="nav-lock" size={12} /></button><button className={view === "peers" ? "active" : ""} onClick={() => changeView("peers")}><Users size={18} /> Ontdek peers {matching.length > 0 && <span className="count-pill">{matching.length}</span>}</button><button className={view === "mirror" ? "active" : ""} onClick={() => changeView("mirror")}><Sparkles size={18} /> Mijn spiegel <LockKeyhole className="nav-lock" size={12} /></button></nav>
        {joined.length > 0 && <><div className="sidebar-section-title conversations-title">GESPREKKEN</div><div className="joined-list">{joined.map(c => <button className={view === "room" && roomId === c.id ? "selected" : ""} key={c.id} onClick={() => void join(c)}><span className={`tiny-dot ${c.online ? "is-online" : ""}`} /><span>{c.topic}</span>{c.waitingForMe ? <Clock3 size={13} /> : c.unread ? <span className="unread-dot" /> : <ChevronRight size={13} />}</button>)}</div></>}
        <button className="sidebar-add" onClick={() => prepareShare()}><Plus size={16} /> Breng een case in</button>
        <button className="sidebar-telegram" onClick={() => void telegram()}><Bell size={15} /><span>{state.telegram?.connected ? "Telegram staat aan" : "Meldingen via Telegram"}</span></button><div className="sidebar-bottom"><div className="profile-avatar">{state.person.alias.slice(0, 1)}</div><div><strong>{state.person.alias}</strong><span>Jouw anonieme naam</span></div><button className="icon-button" aria-label="Bewaar je herstelcode" title="Herstellen op een ander apparaat" onClick={() => void run("recovery", async () => { const r = await api("recover", {}); setRecovery(r.code); setModal("recovery"); })}><Link2 size={16} /></button></div>
      </aside>
      <main className={`main-panel ${view}`}>
        {error && <div className="error workspace-error" role="alert">{error}<button aria-label="Sluit foutmelding" onClick={() => setError("")}><X size={15} /></button></div>}
        {view === "chat" && <><div className="panel-heading"><div><div className="eyebrow small">ALLEEN VOOR JOU</div><h2>Mijn gesprek</h2></div><span className="private-badge"><LockKeyhole size={13} /> Privé</span></div><div className="chat-body">
          {noChat ? <div className="chat-empty"><div className="proxy-symbol"><AudioLines size={28} /></div><h2>Wie zou jou verder helpen?</h2><p>Vertel wat je zoekt. Je AI helpt de juiste mensen vinden.</p></div> : state.person.chat.map(m => <article key={m.id} className={`chat-message ${m.role}`}><div className="message-avatar">{m.role === "assistant" ? <AudioLines size={17} /> : state.person.alias.slice(0, 1)}</div><div className="message-content"><div className="message-label">{m.role === "assistant" ? "Proxy · AI" : "Jij"}<span>{relative(m.at)}</span></div><div className="message-text">{m.text}</div></div></article>)}
          {busy === "chat" && <article className="chat-message assistant"><div className="message-avatar"><AudioLines size={17} /></div><div className="thinking"><i /><i /><i /><span>De proxy denkt met je mee</span></div></article>}
          {state.person.draft && !busy && <div className="context-action"><span><Users size={16} /> Klaar voor een ander perspectief?</span><button onClick={() => prepareShare()}>Deel een vraag <ArrowUpRight size={14} /></button><button onClick={() => { changeView("peers"); void run("match", async () => setState(await api("match", {}))); }}>Vind mijn peer <ArrowUpRight size={14} /></button></div>}
          <div ref={bottom} />
        </div><div className="composer-dock">{composer()}<p className="dock-note">De proxy is AI. Anderen zien alleen wat je zelf deelt.</p></div></>}

        {view === "peers" && <><div className="panel-heading"><div><div className="eyebrow small">ANDERE MENSEN. ANDERE PERSPECTIEVEN.</div><h2>Ontdek peers</h2></div><button className="outline-button" onClick={prepareFind}><ArrowUpRight size={15} /> Zoek buiten de groep</button></div><div className="browse-content"><div className="group-stats"><span><span className="status-dot" /> {state.stats.online} recent aanwezig</span><span>{state.stats.participants} deelnemers</span><span>{state.stats.sharedCases} gedeelde cases</span></div><p className="section-intro">Je ziet uitsluitend vragen en ervaringen die deelnemers zelf hebben vrijgegeven. Je AI kijkt ook naar passende ervaring en een aanvullend perspectief.</p>
          {!state.cases.length ? <div className="empty-card"><Users size={29} /><h3>Hier begint de groep.</h3><p>Er zijn nog geen cases gedeeld. Breng jouw vraag in of nodig iemand uit die een ander perspectief heeft.</p><button className="primary-button" onClick={() => prepareShare()}>Breng de eerste case in <ArrowUpRight size={15} /></button></div> : <div className="case-grid">{state.cases.map((c, position) => <article key={c.id} data-position={position + 1} data-score={c.score} className="case-card"><div className="case-card-top"><span className="topic-tag">{c.parentId && <GitBranch size={12} />}{c.topic}</span>{c.own ? <span className="subtle">Jouw case</span> : c.score > 0 ? <span className="match-tag">{c.reason ? "Mogelijke match" : "Onderwerpoverlap"}</span> : null}</div><p>{c.text}</p>{c.reason && <p className="match-reason">{c.reason}</p>}{c.waitingForMe && <div className="waiting-tag"><Clock3 size={12} /> Er wordt op jouw reactie gewacht</div>}{c.unread && !c.waitingForMe && <div className="waiting-tag"><MessageCircle size={12} /> Nieuwe reactie</div>}<div className="case-card-footer"><span><span className={`tiny-dot ${c.online ? "is-online" : ""}`} />{c.alias} · {c.participants} aangesloten</span><button aria-label={`Sluit aan bij ${c.topic}`} onClick={() => void join(c)}>{c.joined ? "Open gesprek" : "Sluit aan"}<ArrowUpRight size={14} /></button></div></article>)}</div>}
          <div className="quiet-callout"><Headphones size={18} /><div><strong>Niet tegelijk online? Dat hoeft ook niet.</strong><p>Je bijdrage blijft beschikbaar. Open je gesprek later om reacties te lezen.</p></div></div>
        </div></>}

        {view === "mirror" && <><div className="panel-heading"><div><div className="eyebrow small">JOUW AANPAK, SCHERPER IN BEELD</div><h2>Mijn spiegel</h2></div><span className="private-badge"><EyeOff size={14} /> Alleen jij</span></div><div className="browse-content mirror-content"><p className="section-intro">Een persoonlijke terugblik op wat je hebt laten zien: je aanpak, afwegingen en volgende stap. Deze verschijnt nooit bij peers of in uitnodigingen.</p>
          {!personal ? <div className="empty-card"><Sparkles size={29} /><h3>Wat laat jouw aanpak zien?</h3><p>Na minimaal twee eigen bijdragen kan de proxy een eerste terugblik maken. Een gesprek alleen bepaalt niet hoe goed je ergens in bent.</p><button className="primary-button" disabled={!!busy || state.person.chat.filter(m => m.role === "user").length < 2} onClick={() => void reflect()}>{busy === "reflect" ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />} Maak mijn terugblik</button></div> : <><article className="insight-summary"><div className="eyebrow small">DIT VALT OP</div><h3>{personal.summary}</h3><p>{personal.evidence}</p></article><div className="insight-columns"><article><h3><Check size={17} /> Wat je al laat zien</h3>{personal.strengths.map((s, i) => <p key={i}>{s}</p>)}</article><article><h3><MessageCircle size={17} /> Wat nog openligt</h3>{personal.questions.map((s, i) => <p key={i}>{s}</p>)}</article></div><article className="next-step"><span>JOUW VOLGENDE STAP</span><p>{personal.nextStep}</p></article><div className="insight-bottom"><span>Bijgewerkt {relative(personal.at)}</span><button className="text-link" onClick={() => void reflect()} disabled={!!busy}>Vernieuw terugblik {busy === "reflect" ? <Loader2 className="spin" size={14} /> : <ArrowUpRight size={14} />}</button></div><div className="feedback-row"><span>Helpt dit je verder?</span><button aria-label="Deze terugblik helpt" className={feedback === "helpful" ? "chosen" : ""} onClick={() => void react("helpful")}><ThumbsUp size={16} /></button><button aria-label="Deze terugblik helpt niet" className={feedback === "not-helpful" ? "chosen" : ""} onClick={() => void react("not-helpful")}><ThumbsDown size={16} /></button></div></>}
          <div className="quiet-callout"><ShieldCheck size={18} /><div><strong>Een eerlijke vergelijking heeft een meetlat nodig.</strong><p>Er zijn in deze proef nog geen gevalideerde vaardigheidstests of wereldranglijsten. De terugblik benoemt bewijs en onzekerheid.</p></div></div>
        </div></>}

        {view === "room" && room && <><div className="panel-heading room-heading"><div><div className="eyebrow small">{room.case.parentId ? "ZIJGESPREK" : "SAMEN ONDERZOEKEN"}</div><h2>{room.case.topic}</h2></div><button className="outline-button" onClick={() => void makeInvite(true)}><Plus size={15} /> Betrek iemand</button></div><div className="room-subheading"><span><span className="tiny-dot is-online" /> {room.case.participants} aangesloten · via de proxy</span><div><button onClick={() => void run("wait", async () => { setState(await api("wait", { roomId })); setNotice("Je verzoek om een reactie staat open."); })}><Clock3 size={14} /> Vraag een reactie</button><button onClick={() => prepareShare(room.case.id)}><GitBranch size={14} /> Zijgesprek</button><button onClick={() => void react("report")}>Melden</button><button onClick={() => void run("leave", async () => { setState(await api("leave", { roomId })); setRoomId(null); changeView("peers"); })}>Verlaten</button></div></div><div className="async-banner"><Clock3 size={17} /><div><strong>{room.case.waitingForMe ? "Er wordt op jouw reactie gewacht." : room.case.waitingOnPeers ? (room.case.participants > 1 ? "Je wacht op een reactie van een peer." : "Je vraag staat open voor peers.") : "Je kunt hier ook later verdergaan."}</strong><span>{room.case.waitingForMe ? "Neem rustig de tijd. Je kunt reageren wanneer het jou uitkomt." : "De proxy bewaart het gesprek. Nieuwe reacties komen hier terug."}</span></div><button onClick={() => void telegram()}><Bell size={14} />{state.telegram?.connected ? "Telegram aan" : "Geef me een seintje"}</button></div><div className="chat-body"><article className="original-case"><div><MessageCircle size={16} /><span>Case van {room.case.alias}</span></div><p>{room.case.text}</p></article>{!room.messages.length && <p className="room-empty">Het gesprek ligt open. Deel jouw ervaring, stel een vraag of nodig iemand uit. Reacties blijven ook later leesbaar.</p>}{room.messages.map(m => <article key={m.id} className="chat-message peer"><div className="message-avatar peer-avatar">{m.alias.slice(0, 1)}</div><div className="message-content"><div className="message-label">{m.alias}<span>Via de AI · {relative(m.at)}</span></div><div className="message-text">{m.text}</div></div></article>)}<div ref={bottom} /></div><div className="composer-dock">{composer()}<p className="dock-note">Echte mensen. Bijdragen worden door AI gefilterd; de AI verzint geen reacties.</p></div></>}
        {view === "room" && !room && <div className="empty-card"><Loader2 className="spin" /><p>Gesprek openen…</p><button onClick={() => changeView("peers")}>Terug naar peers</button></div>}
      </main>

    </div>}

    {modal && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setModal(null); }}><section className="modal" role="dialog" aria-modal="true" aria-label={modal === "find" ? "Vind passende mensen" : modal === "telegram" ? "Telegram-meldingen" : modal === "share" ? "Controleer je deelvoorstel" : modal === "invite" ? "Nodig iemand uit" : modal === "recovery" ? "Je herstelcode" : "Privacy en werking"}><button className="modal-close icon-button" aria-label="Sluiten" onClick={() => setModal(null)}><X size={20} /></button>
      {modal === "share" && <><div className="modal-symbol"><Users size={24} /></div><div className="eyebrow small">JIJ BEPAALT WAT ER NAAR BUITEN GAAT</div><h2>{parentId ? "Een nieuwe richting." : "Een ander perspectief erbij."}</h2><p>Alleen de tekst hieronder wordt zichtbaar voor deelnemers van jouw proefgroep. Controleer ook herkenbare details.</p><label htmlFor="case-topic">Onderwerp</label><input id="case-topic" value={shareTopic} maxLength={80} onChange={e => { setShareTopic(e.target.value); setPreviewToken(""); setApproved(false); }} placeholder="Waar gaat je case over?" /><label htmlFor="case-text">Jouw anonieme vraag of ervaring</label><textarea id="case-text" value={shareText} maxLength={1200} onChange={e => { setShareText(e.target.value); setPreviewToken(""); setApproved(false); }} rows={6} placeholder="Vertel kort de situatie en wat je wilt onderzoeken…" />{!previewToken && <button className="outline-button full" disabled={!shareText.trim() || !!busy} onClick={() => void previewContribution()}>{busy === "preview" ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} Maak mijn anonieme deelvoorstel</button>}<label className="checkbox-label"><input type="checkbox" disabled={!previewToken} checked={approved} onChange={e => setApproved(e.target.checked)} /><span>Ik heb deze tekst gecontroleerd en wil alleen deze case met mijn groep delen.</span></label>{error && <div className="error">{error}</div>}<button className="primary-button full" disabled={!previewToken || !approved || !shareText.trim() || !shareTopic.trim() || !!busy} onClick={() => void publishCase()}>{busy === "share" ? <Loader2 className="spin" size={17} /> : <ArrowUpRight size={17} />} Deel deze case</button><p className="modal-footnote"><LockKeyhole size={12} /> Je privégesprek en persoonlijke terugblik worden niet gedeeld.</p></>}
      {modal === "invite" && <><div className="modal-symbol"><Link2 size={24} /></div><div className="eyebrow small">EEN NIEUW PERSPECTIEF</div><h2>{view === "room" ? "Wie zou hier iets aan toevoegen?" : "Samen zie je meer."}</h2><p>De ontvanger begint met een eigen privégesprek en kiest zelf wat hij deelt. Je persoonlijke terugblik staat nooit in deze uitnodiging.</p><div className="invite-preview"><span>Jouw uitnodiging</span><p>{view === "room" ? "Ik onderzoek een vraag. Jouw perspectief zou kunnen helpen. Praat anoniem mee, wanneer het jou past." : state?.person.variant === "result" ? "Ik heb mijn aanpak eens vanuit een ander perspectief bekeken. Wat zou jij ontdekken? Begin je eigen anonieme gesprek." : "Heb jij ook een vraag die je met anderen wilt onderzoeken? Praat vrij, vind andere perspectieven en kies zelf wat je deelt."}</p></div><div className="copy-field"><input aria-label="Uitnodigingslink" readOnly value={shareLink} onFocus={e => e.target.select()} /><button className="icon-button" aria-label="Kopieer uitnodigingslink" onClick={() => void copy(shareLink)}><Copy size={18} /></button></div><button className="primary-button full" onClick={() => { learn("invite_share"); if (navigator.share) void navigator.share({ title: "Samen verder", text: "Een ander perspectief op jouw vraag. Begin anoniem.", url: shareLink }).catch(() => {}); else void copy(shareLink); }}><Send size={16} /> Verstuur je uitnodiging</button><p className="modal-footnote">Deze uitnodiging werkt 14 dagen. Jij kiest zelf aan wie je hem stuurt.</p></>}
      {modal === "recovery" && <><div className="modal-symbol"><LockKeyhole size={24} /></div><h2>Neem je gesprek mee.</h2><p>Bewaar deze persoonlijke code om op een andere computer of telefoon verder te gaan. Wie de code heeft, kan jouw privégesprek openen. Deel hem met niemand.</p><div className="copy-field"><input aria-label="Persoonlijke herstelcode" type="password" readOnly value={recovery} /><button className="icon-button" aria-label="Kopieer persoonlijke herstelcode" onClick={() => void copy(recovery)}><Copy size={18} /></button></div><p className="modal-footnote">Geldig voor 90 dagen. Je uitnodigingslink is een andere link.</p></>}
      {modal === "find" && <><div className="modal-symbol"><Users size={24} /></div><h2>Vind de ervaring<br />die je zoekt.</h2><p>Je proxy zoekt openbare professionele profielen op basis van deze anonieme vraag. Controleer de tekst vóór het zoeken.</p><label htmlFor="peer-brief">Welke ervaring zou je verder helpen?</label><textarea id="peer-brief" value={shareText} rows={4} maxLength={1200} onChange={e => { setShareText(e.target.value); setPreviewToken(""); setApproved(false); setExternalPeers([]); }} />{!previewToken ? <button className="outline-button full" disabled={!shareText.trim() || !!busy} onClick={() => void previewContribution()}>{busy === "preview" ? <Loader2 className="spin" size={16} /> : <ShieldCheck size={16} />} Controleer mijn zoekvraag met AI</button> : <><label className="checkbox-label"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} /><span>Gebruik deze gecontroleerde vraag voor een openbare webzoekopdracht.</span></label><button className="primary-button full" disabled={!approved || !!busy} onClick={() => void searchOutside()}>{busy === "find" ? <Loader2 className="spin" size={16} /> : <Users size={16} />} Vind passende mensen</button></>}{error && <div className="error">{error}</div>}{externalPeers.length > 0 && <div className="external-results"><p className="modal-footnote">Openbare bronnen, geen bevestigde deelnemers. Hun interesse of beschikbaarheid is nog onbekend.</p>{externalPeers.map(p => <article key={p.url}><a href={p.url} target="_blank" rel="noopener noreferrer">{p.title}<ArrowUpRight size={14} /></a><p>{p.excerpt}</p></article>)}{!introLink ? <button className="outline-button full" disabled={!!busy} onClick={() => void createIntro()}>Maak een uitnodiging</button> : <><div className="invite-preview"><p>Ik zoek iemand met ervaring rond deze vraag: {shareText} Wil je anoniem via de AI meedenken? Jij krijgt ook een eigen ruimte om jouw vraag te onderzoeken.</p></div><button className="primary-button full" onClick={() => void copy(`Ik zoek iemand met ervaring rond deze vraag: ${shareText} Wil je anoniem via de AI meedenken? Jij krijgt ook een eigen ruimte om jouw vraag te onderzoeken. ${introLink}`)}><Copy size={16} /> Kopieer uitnodiging</button></>}<p className="modal-footnote">Er is niets verstuurd. E-mail en sociale kanalen zijn nog niet gekoppeld.</p></div>}</>}
      {modal === "telegram" && <><div className="modal-symbol"><Bell size={24} /></div><h2>Verdergaan wanneer<br />het jou uitkomt.</h2><p>Bij een nieuwe reactie of een verzoek om jouw bijdrage kan de proxy je via Telegram waarschuwen. De melding bevat geen privégesprek, case-inhoud of persoonlijke beoordeling.</p>{state?.telegram?.connected ? <><div className="connected-notice"><Check size={17} /> Telegram-meldingen staan aan.</div><button className="outline-button full" onClick={() => void run("telegram", async () => { setState(await api("telegram-disconnect", {})); setModal(null); setNotice("Telegram-meldingen staan uit."); })}>Zet meldingen uit</button></> : state?.telegram?.available ? <><a className="primary-button full" href={shareLink || undefined} target="_blank" rel="noopener noreferrer" aria-disabled={!shareLink}>{busy === "telegram" ? <Loader2 className="spin" size={16} /> : <Send size={16} />} Open Telegram en zet meldingen aan</a><p className="modal-footnote">Telegram vraagt bij de eerste koppeling om op Start te drukken. Je kunt later uitzetten met /stop.</p></> : <div className="setup-notice"><strong>Eenmalige botkoppeling nog nodig</strong><p>De koppelflow is voorbereid. De beheerder moet de Telegram-bot nog activeren. Tot die tijd blijven alle reacties hier leesbaar.</p></div>}</>}
      {modal === "privacy" && <><div className="modal-symbol"><ShieldCheck size={24} /></div><h2>Vrij praten.<br />Zelf kiezen wat je deelt.</h2><div className="privacy-list"><article><LockKeyhole size={18} /><div><strong>Je begint privé</strong><p>Peers zien je privégesprek en terugblik niet. De dienst bewaart en analyseert je gesprek met AI om jou te helpen en de werking te verbeteren. De proxy gebruikt externe modelaanbieders. Privéteksten komen niet in gesprekken van anderen.</p></div></article><article><Users size={18} /><div><strong>Anoniem voor elkaar</strong><p>Je gebruikt een willekeurige naam. De dienst gebruikt een technische sessie. Details die je zelf noemt kunnen herkenbaar zijn; controleer je deelvoorstel.</p></div></article><article><Mic size={18} /><div><strong>Inspreken is optioneel</strong><p>Je browser zet spraak om in tekst en kan daarvoor zijn spraakdienst gebruiken. Wij bewaren in deze proef geen audio. Je controleert de tekst voordat je hem verstuurt.</p></div></article><article><Sparkles size={18} /><div><strong>Jouw spiegel blijft privé</strong><p>Geen openbare vaardigheidsranglijst. De terugblik gaat alleen over wat je werkelijk hebt laten zien en is geen gevalideerde meting.</p></div></article><article><Sparkles size={18} /><div><strong>We leren van gebruik</strong><p>Voor en tijdens je gesprek meten we stappen, timing, fouten en uitkomsten. Uit privétekst leiden we algemene signalen af, zoals een onduidelijke vraag of een misverstand. De leermeting bevat geen tekstfragmenten of inhoudelijke samenvattingen. Ruwe gebruiksevents bewaren we maximaal 90 dagen.</p><label className="measurement-choice"><input type="checkbox" checked={measurement} onChange={e => { setMeasurement(e.target.checked); setLearning(e.target.checked); if (state) void run("measurement", async () => setState(await api("measurement", { enabled: e.target.checked }))); }} /> Gebruiksmeting aan</label></div></article><article><EyeOff size={18} /><div><strong>Een besloten proef</strong><p>Cases zijn zichtbaar binnen je proefgroep. Er worden nu geen gesprekken of benchmarks verkocht. Je gesprek wordt bewaard zodat je later verder kunt gaan.</p></div></article></div><details className="access-details"><summary>Mijn eerdere gesprek herstellen</summary><p>Plak je persoonlijke herstelcode. Deel deze code met niemand.</p><textarea id="restore" aria-label="Persoonlijke herstelcode" value={restoreCode} onChange={e => setRestoreCode(e.target.value)} rows={2} /><button className="outline-button full" disabled={!restoreCode.trim() || !!busy} onClick={() => void run("restore", async () => { await api("recover", { code: restoreCode.trim() }); setState(await api("state")); setModal(null); })}>Herstel mijn gesprek</button></details><button className="primary-button full" onClick={() => setModal(null)}>Begrepen <Check size={16} /></button></>}
    </section></div>}
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
  </div>;
}


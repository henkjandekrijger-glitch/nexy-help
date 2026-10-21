# Peer Proxy — besloten proef

Anonieme gesprekken met een AI-proxy, gecontroleerd delen van cases, echte peerreacties, vertakkingen en privéreflectie. De gebruikersinterface volgt de rustige witte Outname-stijl. Werknaam: samen.

## Cloud
- Vercel project: peer-proxy (prj_VvqXzQEBdtqll7nxZ1jlJGy7Y9yx).
- Eigen private Vercel Blob store; geen privégesprekken in publieke blobs.
- eve 0.81.1 voor de duurzame proxy-agent; AI Gateway met Vercel OIDC.
- GitHub broncode op een afzonderlijke peer-proxy-branch, onder peer-proxy/.
- Geen afhankelijkheid van een draaiende laptop, chat of lokale schijf.

## Configuratie
PEER_SESSION_SECRET (server secret), PEER_ENTRY_TOKEN (eerste uitnodiging), PEER_TEST_ENTRY_TOKEN (apart QA-cohort), BLOB_READ_WRITE_TOKEN (automatisch gekoppeld). PEER_MAX_AI_CALLS_PER_DAY begrenst modelaanvragen; standaard 200. Waarden staan uitsluitend in de Vercel-omgeving. Zet geen sleutels in Git.

## Gedrag en grenzen
- Iedereen begint privé; alleen een apart gecontroleerd deelvoorstel wordt met het cohort gedeeld.
- Peerberichten zijn echte bijdragen met een willekeurige naam. Geen synthetische peers.
- Deelnemers kiezen zelf of zij aansluiten en een zijgesprek starten.
- Reacties blijven later beschikbaar. Aanwezigheid ververst circa elke tien seconden; dit is geen live audioverbinding.
- Spraak naar tekst gebruikt browserondersteuning. Typen werkt altijd. Audio wordt niet door de app bewaard.
- Herstelcode is een persoonlijke toegangscode; uitnodigingen bevatten geen privéreflectie.
- De privéspiegel beschrijft alleen getoonde aanpak en onzekerheden. Geen gevalideerde vaardigheidsscore of wereldbenchmark.
- Matching gebruikt onderwerp/zoekwoordoverlap; dit is nog geen gevalideerde semantische aanbevelingsmotor.
- Uitnodigingen registreren bron en generatie. Een nieuwe gebruiker is nog geen behouden of betalende gebruiker.
- Proeflimieten: 100 deelnemers per cohort, 25 proxybeurten per deelnemer, acht eigen cases, 180 berichten per gesprek.
- MVP gebruikt conditionele Blob-writes voor gedeelde toestand; voor grotere groepen hoort een transactiedatabase met realtime abonnementsverkeer de volgende stap te zijn.

## Controle
npm run typecheck
node --experimental-strip-types --test tests/core.test.ts
npm run build

Test privacy met minstens twee afzonderlijke cookiesessies en een apart QA-cohort: private inhoud en spiegels mogen niet terugkomen in de peerresponse, uitnodigingen of andere sessie.

## Nog te valideren
Werkelijk behouden vervolggebruik, uitnodigingsconversie over meerdere generaties, semantische matching, beoordelingskwaliteit en dagelijkse beheerkosten. Deze proef bewijst geen viraliteit of product-market fit.

## Asynchroon en Telegram
Een case kan op een reactie wachten; deelnemers kunnen expliciet een reactie vragen. Nieuwe bijdragen lossen een wachtverzoek op. De interface toont ongelezen reacties en aan wie een reactie is gevraagd.
Telegram heeft één knop in de chat; de eerste keer vereist Telegram zelf nog Start. De bot gebruikt een eenmalige koppelcode van 15 minuten. Geen privégesprek of case-inhoud in meldingen. /stop schakelt meldingen uit.
Nog eenmalig configureren: TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET. Registreer via Telegram setWebhook de productie-URL /api/telegram/webhook met dezelfde secret_token. Deel nooit de bot-token in de broncode of chat. De app toont de koppeling pas beschikbaar met alle drie de instellingen.
CRON_SECRET beveiligt /api/telegram/retry. De Cron herprobeert een mislukte melding maximaal vier keer, met tussenpozen van minimaal vijf minuten, binnen 24 uur. Een transporttimeout kan bij Telegram tot een dubbele melding leiden; er is geen exactly-once-garantie.



## Clean entry and learning (21 October 2026)
The entry has one primary CTA. The first chat stays private; all case publication requires an AI-filtered preview and approval bound to the exact text/topic with a signed, expiring token. Room contributions pass the same privacy filter before storage/delivery. Failed filtering never falls back to forwarding the raw text. AI filtering is fallible; do not promise absolute anonymity or zero spam.

Learning has three separate sources:
- Before and during use: first-party batches for views, entry clicks, focus, draft LENGTH buckets, scroll depth, voice use, view/modal changes, visible time, API timing/errors, matching impressions and invitation actions. No keystrokes, draft text, URLs, IPs or arbitrary DOM text in these event records. Browser/ad blocking or network loss can mean missing events; this is not literally every observation.
- Private conversation analysis: schema-constrained intent/clarity/friction/next-action categories, derived from the user's own private conversation. No quotations, names, free-text summaries or private content are reused in other conversations. Original chats stay in their existing private records. Derived labels are unverified model observations, separate from real outcomes.
- Server outcomes: deduplicated completed first AI exchange, first actual peer response received, return after at least 24h, errors and explicit usefulness feedback. A created invite or copied link is not a proven new user or paid outcome. Per-room usefulness feedback is deduplicated, with only a small bounded ranking adjustment after five ratings.

Private storage paths: `peer/v1/learning/events`, `learning/daily`, `learning/content-signals`, `learning/content-summary`, `learning/outcomes`, `learning/experiments`, `learning/reviews`. Raw usage events expire after 90 days via daily cleanup. Coarse aggregate counts are retained. QA cohorts remain separate from pilot experimentation. Client events are labelled client-reported; no claim of unique-human verification.

Two entry labels are initially assigned 50/50. Routing can move to 80/20 only after both arms have 40+ entry visits, 10+ real peer-response recipients, non-overlapping 95% Wilson intervals and error/return guardrails. These rules are heuristics, not proof of causality or mature revenue optimization. Until then no winner is declared. Abstract conversation signals may select one of three limited proxy styles only after 20 exchanges from five participants; private content is never copied into another user's context. Optional measurement can be disabled in privacy settings; that also disables content-derived learning for that person.

Daily `/api/learn/review` requires the existing `CRON_SECRET`, writes a private review and cleans expired raw events. No public analytics dashboard or tracking exports. Run the review through an authenticated administrator/cron request; never embed the secret in a link.

## Finding peers beyond the group
Internal matching uses actual private needs and only approved candidate cases; no fictional people or expertise. Optional external discovery requires a separately approved, AI-filtered search brief. Exa search runs through AI Gateway using the existing Vercel identity. Only source-returned HTTPS URLs and excerpts are shown; they are not confirmed interested participants. A user can create/copy an invitation. No automatic email, social DM or contact enrichment exists in this release, and nothing is sent to third parties automatically. Telegram still requires a one-time bot configuration before real alerts can be delivered.


## Nexy clean interface (21 October 2026)
Brand renamed to Nexy. The interface now follows the restrained Outnamed type, colour, spacing and field styles: one column, direct initial composer, no separate start screen, no dashboard/sidebar/stat tiles. Optional navigation and room management sit behind a single menu. Share approval is the explicit final “Deel deze tekst” action after the signed AI-filtered preview; there is no redundant checkbox. UX version clean-2 starts a fresh experiment on the initial input framing (the person who can help versus the need) to avoid mixing the previous layout with this one. Existing private records and matching/learning functions remain in the same cloud project.

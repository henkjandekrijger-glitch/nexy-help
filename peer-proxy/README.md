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

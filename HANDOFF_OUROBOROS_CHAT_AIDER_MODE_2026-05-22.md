# Handoff: Ouroboros Chat — Aider-modus is gebouwd maar nog niet wat de gebruiker wil

Datum: 2026-05-22 (na uren werk aan dev-team build-loop)
Werkruimte: `/home/pwintri2/WintripAI`
Standalone app: `/home/pwintri2/ouroboros-chat`
Voorgaande handoff: `HANDOFF_OUROBOROS_CHAT_DEVTEAM_LIGHT_MODELS_2026-05-21.md`

## De feedback van de gebruiker — letterlijk

> "We zijn er nog lang niet."

Eerder in de sessie:

> "Bouw met Team komt maar tot 1 itteratie. Het is de bedoeling dat het team de hele applicatie afbouwt, of een aanpassing tot een goed einde brengt of een reperatie afmaakt tot een goed einde."

> "Ik zie nog steeds geen gesprek ontstaan en er is nog steeds maar 1 itteratie. Ik krijg nu ook geen vragen meer."

> "Er wordt wat onzin gebabbeld, dan komt er een soort bouwprompt en na akkoord wordt het een Codex Job die eigenlijk een mock is. Dit is niet wat ik heb gevraagd. Ik wil dat de devellop agents zelf aan het bouwen gaan."

De gebruiker wil dat de vier persona's (voorzitter, developer, tester, criticus) **samen een applicatie afbouwen tot het werkt**. Tot nu toe komt de UX daar niet bij in de buurt — meestal omdat iets technisch hapert (timeouts, verkeerde defaults, geen feedback in de UI) waardoor de loop nooit echt z'n werk doet.

## Wat er WEL werkt vanavond (geverifieerd in de backend)

- `DevTeamBuildSession` orchestrator in `controller/dev_team_build.py` (~580 regels). Doet ECHT:
  - `<file path="...">...</file>` blokken extraheren uit Developer-turns en safely naar een sandbox-workspace schrijven (`data/ouroboros_chat/dev-team-builds/{session_id}/`)
  - `<cmd>...</cmd>` blok extraheren uit Tester-turns en uitvoeren via `sh -c` met 120s timeout
  - Een chair-review na elke groene test die in JSON antwoordt met DONE/CONTINUE+next_subtask
  - De CONTINUE-route appende de subtask aan de bouwprompt en gaat door
  - Stoppen op groen+DONE of op max_iterations
- 18 sandbox-tests in `test_dev_team_build.py` allemaal groen.
- Live curl-test eerder vanavond (chess CLI prompt → 2 iteraties → 17 pytest tests groen) bewees dat de loop werkt zoals bedoeld.
- Intake-endpoint reageert nu in ~300ms (forceert ouroboros:latest ipv devstral cold-start).
- Container is voorzien van pytest, python-chess, pygame, flask, hypothesis, typer (zowel persistent in `controller/requirements.txt` als live-geïnstalleerd in de draaiende container).

## Wat NIET werkt voor de gebruiker (vandaag observed)

1. **De UI laat het overleg niet zien tijdens het draaien.** `POST /api/ouroboros-chat/development-team` is een sync POST die 60-120s blokkeert; de gebruiker ziet alleen een spinner. Pas als het hele meeting-payload terugkomt, springen alle rounds tegelijk in beeld. Voor een mens voelt dat als "ik klik op start en dan gebeurt er niks". De `/meetings/stream` SSE-route bestaat al maar de Ontwikkelteam-tab gebruikt die niet.
2. **Eén iteratie in plaats van doorbouwen.** Twee oorzaken die we nog niet definitief weten:
   - Mogelijk timed het LLM nog steeds uit als de gebruiker een groot model heeft gekozen voor de echte rondes (developer/tester/criticus turns gebruiken de gekozen `devModel`). Cold-start van devstral is 40s, dat is langer dan onze 25s default timeout in `MeetingRunner._call_model`. De chair-review heeft dat geen probleem meer dankzij de intake-fix.
   - De chair-review kan onverdiend DONE zeggen als de eerste test al groen draait. We hebben geen min-iterations vloer ingebouwd. Voor complexe builds is dat te eager.
3. **Geen vragen verschijnen.** Voor de intake-fix-van-vanavond was dit zeker een devstral-cold-start probleem. Nu intake fast is, zou dit moeten werken — maar onbevestigd in een UI-test door de gebruiker. Hij draait waarschijnlijk de oude Tauri-binary nog door de single-instance plugin.
4. **`/codex` slash-handoff is in zijn setup een mock.** Niet kapot, gewoon: de Codex CLI is op zijn machine niet geconfigureerd, dus de agent-runtime job verschijnt wel maar levert geen output. Niet kritiek meer omdat we Aider-modus naast die route hebben gezet, maar visueel verwarrend. De "Start bouwen"-knop hoort eigenlijk weg of duidelijk omgelabeld als "/codex fallback (extern)".

## Mogelijke kernoorzaken die we NOG NIET hebben aangepakt

### 1. Tauri single-instance plugin verbergt de nieuwe code

Mijn vermoeden: de gebruiker test met een Tauri-binary-proces dat nog draait van eerder. Door de single-instance plugin focust een nieuwe launcher het oude proces, met de oude embedded `dist/`. Symptoom: "nog steeds 1 iteratie, geen vragen, geen gesprek" — gedrag van een commit van vóór de fixes van vanavond.

**Eerste actie volgende sessie:** vraag de gebruiker `pkill -f "target/release/ouroboros-chat"` te draaien en de app opnieuw te starten. Dan pas valt te beoordelen of de fixes effect hebben.

### 2. Sync meeting blokkeert de UI

De Ontwikkelteam-tab roept `/api/ouroboros-chat/development-team` (sync POST). De gebruiker ziet 60-120s lang niets, denkt dat er niks gebeurt, en concludeert "geen gesprek".

**Tweede actie volgende sessie:** rewire `runDevelopmentTeamMeeting` in `App.tsx` om de bestaande streaming endpoint `/api/ouroboros-chat/meetings/stream` te gebruiken met `meeting_type: "development_team"`. De `meeting_recorded` envelope levert al `build_prompt` op, dus de FE-logica blijft hetzelfde — alleen de meeting wordt live gerenderd zoals al gebeurt in de gewone meeting-workspace.

### 3. LLM-timeout te krap voor zware modellen

`MeetingRunner` default timeout = 25s (env `WINTRIP_OUROBOROS_CHAT_MEETING_TURN_TIMEOUT`). Een devstral cold-start is 40s. Sommige turns vallen daardoor terug op deterministische templates.

**Derde actie:** verhoog de default naar 90s of laat het pad door de fallback chain explicieter zijn (probeer eerst de zware kant, val terug op ouroboros bij timeout). Voor Aider-modus `DevTeamBuildSession._call_llm` heeft geen eigen timeout — die wacht net zo lang als Ollama erover doet. Misschien is dat juist het probleem.

### 4. Chair-review heeft geen min-iterations vloer

Voor simpele prompts ("schrijf add(a,b)") is "eerste groene = DONE" correct. Voor complexe ("bouw een schaakapp") is dat te eager. De chair krijgt nu workspace listing + werkhistorie mee maar geeft soms toch DONE bij minimale code.

**Vierde actie:** voeg `min_iterations` parameter toe (default 2 voor team_build). Tot die drempel forceert de loop CONTINUE ongeacht chair-verdict. Verzacht door de chair eerst DONE te laten zeggen en daarna de loop alsnog DOORZETTEN — vooral nuttig als de Tester slechts één simpele test heeft uitgevoerd.

### 5. De Developer schrijft soms ALLE files in iteratie 1

Een 23B model levert in één turn alle files perfect af. Tester draait pytest, alles groen, chair zegt DONE. Voor de gebruiker voelt dat als "geen gesprek" omdat er geen iteraties zijn. Dit is technisch correct — het bouwdoel is gerealiseerd — maar visueel teleurstellend.

Discussie nodig met de gebruiker: WIL hij meer iteraties bij simpele prompts ("3 functies")? Of wil hij dat de prompt complexer is en het team meerdere stappen aflegt?

Een gulden middenweg: voor `development_team` builds ALTIJD de chair laten reviewen of er belangrijke onderdelen nog ontbreken (testdekking, README, error handling, edge cases). Dat geeft natuurlijke iteraties.

## Architectuur zoals het nu staat

```
FE Ontwikkelteam-tab
├── Start team → POST /development-team/intake (300ms)
│   └── 0-3 verduidelijkingsvragen in goud kader
├── Beantwoord en start overleg → POST /development-team (60-120s sync)
│   └── Meeting met 4 personas + build_prompt als deliverable
├── (oude pad) Start bouwen → POST /api/cockpit/chat → /codex (mock in user setup)
└── (nieuwe pad) Bouw uit met team → POST /development-team/build (SSE)
    └── Live iteraties:
        ├── Developer schrijft files (<file>...</file>)
        ├── Tester draait command (<cmd>...</cmd>) in sandbox workspace
        ├── Test result (groen/rood + stdout/stderr)
        ├── Op rood: Criticus geeft fix-opdracht
        ├── Op groen: Chair zegt DONE of CONTINUE+next_subtask
        └── Loop tot DONE of max_iterations (default 4)
```

De sandbox workspace landt in `data/ouroboros_chat/dev-team-builds/{session_id}/` in de backend container. Bind-mounted op `/workspace`. Files survive container restart.

## Commits vanavond gepusht

`Ouroboros` (WintripAI), branch `codex/guided-behavioral-apprenticeship`:
- `40d5d67` Forceer light model voor dev-team intake (cold-start fix)
- `b4fea81` Dev-team build: sandbox tools + chair-review voor multi-iteratie
- `8b65bf4` Aider-modus: dev-team agents schrijven zelf code, draaien tests, itereren
- (eerder vandaag) `bdc85cb`, `c0df944`, `3925e0d`

`Ouroboros-chat`, branch `backup/ouroboros-chat-20260519-143915`:
- `9f944a9` FE default model: ouroboros:latest ipv devstral:latest
- `bd08cc0` Aider-modus FE: render chair-review verdict in elke iteratie
- `3d9cfb5` Aider-modus FE: 'Bouw uit met team' SSE consumer + live iteratie-render
- (eerder vandaag) `fe514ab`, `ecb3543`, `4dfb8fa`

## Concrete prioriteiten voor de volgende sessie

**Stap 0 — Verifieer of de gebruiker de nieuwe binary draait.** Voor je iets nieuws bouwt: laat hem `pkill -f "target/release/ouroboros-chat"` doen en opnieuw starten. Dan klikt hij "Start team" op de schaak-prompt. Eerst kijken of de fixes van vanavond effect hebben in zijn UI. **Veel kans dat veel van de symptomen weg zijn na een echte herstart.**

**Stap 1 — Rewire de Ontwikkelteam-meeting naar streaming.** Vervang `runDevelopmentTeamMeeting` in `App.tsx` zodat hij `/meetings/stream` aanroept met `meeting_type: "development_team"` en de persona-IDs als participants. Render de SSE events in de bestaande transcript-flow (zoals de gewone meeting-workspace al doet). Bij `meeting_recorded` event: zelfde build_prompt-card als nu. Dit alleen al lost "geen gesprek zichtbaar" volledig op — de gebruiker ziet elke turn live verschijnen.

**Stap 2 — Min-iterations + slimmere chair-review.** Voeg een `min_iterations` parameter toe aan `DevTeamBuildSession`. Default 2 voor `development_team` builds. Pas de chair-review prompt aan om voor complexe bouwdoelen sneller CONTINUE te zeggen door expliciet te vragen: "Is er ook README, error handling, edge case tests, en een werkbare hoofd-entrypoint?". Bij meer dan 1 ontbrekend onderdeel: CONTINUE.

**Stap 3 — Bump LLM timeout voor build-turns.** In `DevTeamBuildSession._call_llm` een expliciete subprocess-timeout van 90s. En in `MeetingRunner._call_model`: env-var override naar 60s default voor dev-team meetings (of geheel weghalen voor de Aider-modus die geen meeting-runner gebruikt).

**Stap 4 — Verwijder of relabel de "Start bouwen" knop.** Hij triggert nu `/codex` dat in de huidige setup mockt. Of weghalen, of duidelijk omlabelen als "Stuur naar externe agent (Codex CLI)" zodat de gebruiker niet denkt dat dát de echte bouwknop is.

**Stap 5 — Persona-context cache.** Elke iteratie schrijft de developer een complete file. Voor grote files is dat wasteful en risico op afwijking. Aider-style "in-place edit blocks" (search/replace) zou efficiënter zijn. **Pas later** — eerst de UX fixen.

**Stap 6 — Multi-file build-prompts.** De huidige flow is single-prompt. Voor "neem deze app en repareer X": de gebruiker zou een bestaande directory moeten kunnen aanwijzen die de Developer als startpunt gebruikt. Nu start elke build vanaf een lege workspace. **Pas later** — eerst zorgen dat de huidige flow goed werkt.

## Hoe de volgende agent NIET de tijd verspilt zoals ik vandaag

1. **Vraag bevestiging van de gebruiker dat hij de nieuwe binary draait** (geen single-instance ghost van een oude versie).
2. **Doe een live SSE-test eerst** voordat je gaat refactoren. Beide endpoints zijn herbruikbaar: `/development-team/intake`, `/development-team`, `/development-team/build`.
3. **Lees deze handoff in zijn geheel**, plus de voorganger. De architectuur is er; de UX-koppelingen zijn de bottleneck.
4. **Vraag explicit: wat voor PROMPT gebruikt de gebruiker bij zijn test?** Een "maak iets simpels"-prompt geeft 1 iteratie en is technisch correct. Een complexere prompt geeft multi-iter. Stem af.
5. **Behoud de bestaande Aider-modus** (`DevTeamBuildSession` + `/development-team/build`). Dat ding doet echt wat het belooft, zoals geverifieerd in `test_dev_team_build.py` en in een live chess CLI run. De bottleneck is niet daar.

## Hoe te draaien / debuggen

### Container heeft alles wat nodig is
```bash
docker --context desktop-linux exec wintripai-ouroboros-backend-1 python3 -c \
  "import pytest, chess, pygame, flask; print('OK')"
# verwacht: pytest 9.0.3, chess 1.11.2, pygame 2.6.1, flask 3.1.3
```

### Intake handmatig testen (verwacht <1s)
```bash
curl -sS -X POST http://127.0.0.1:8010/api/ouroboros-chat/development-team/intake \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Bouw X met Y"}' | python3 -m json.tool
```

### Aider-modus build streamen
```bash
curl -sS -X POST http://127.0.0.1:8010/api/ouroboros-chat/development-team/build \
  -H "Content-Type: application/json" --max-time 600 \
  -d '{"build_prompt":"<jouw prompt>","persona_ids":["de-voorzitter","de-developer","de-tester","de-criticus"],"max_iterations":4}'
```

### Tests
```bash
cd /home/pwintri2/WintripAI
python3 -m unittest sandbox_tests.test_dev_team_build sandbox_tests.test_ouroboros_chat_service \
  sandbox_tests.test_ouroboros_chat_routes sandbox_tests.test_ouroboros_chat_personas_meetings \
  sandbox_tests.test_ouroboros_chat_cline
# verwacht: 78 ran (60+18), 10 skipped, 0 failures
```

### Tauri release-binary verbruiken
Niet vanzelfsprekend:
- `vite build` → maakt nieuwe `dist/` (snel)
- `tauri build --no-bundle` → bouwt binary met dist embedded (~60s)
- **APP MOET ECHT GEKILLT WORDEN** vóór een nieuwe launch (single-instance plugin)

## Bestanden die je gaat aanraken

- `controller/dev_team_build.py` (~580 regels) — kernlogica, OK
- `controller/ouroboros_chat.py` — service + routes (let op: enorm bestand)
- `controller/requirements.txt` — sandbox tools, in commits
- `sandbox_tests/test_dev_team_build.py` — 18 tests, OK
- `/home/pwintri2/ouroboros-chat/src/App.tsx` — FE workspace (3800+ regels)
- `/home/pwintri2/ouroboros-chat/src/styles.css` — alle CSS

## Slot

De infrastructuur staat. De agents kunnen écht bouwen (live geverifieerd met een CLI schaakprogramma — 17 pytest tests groen vanaf nul). Maar de gebruiker krijgt dat momenteel niet te zien omdat:

1. De UI laat de meeting niet zien tijdens het draaien (sync POST)
2. Wellicht draait hij nog de oude binary
3. Voor simpele prompts klapt het team in één iteratie dicht

Volgende sessie: **streaming + min-iterations + verifieer dat de nieuwe binary daadwerkelijk in gebruik is**. Dan is het écht wat de gebruiker vraagt.

Succes.

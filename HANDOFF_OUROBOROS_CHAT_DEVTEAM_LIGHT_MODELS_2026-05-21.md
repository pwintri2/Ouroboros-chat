# Handoff: Ouroboros Chat — Ontwikkelteam moet ECHT bouwen

Datum: 2026-05-21 (laatste update na de quick-wins fix)
Werkruimte: `/home/pwintri2/WintripAI`
Standalone app: `/home/pwintri2/ouroboros-chat`
Voorganger: `HANDOFF_OUROBOROS_CHAT_VISIBLE_META_LEAK_2026-05-20.md`

## De feedback van de gebruiker (samenvatting)

> "Er wordt wat onzin gebabbeld, dan komt er een soort bouwprompt en na akkoord wordt het een Codex Job die eigenlijk een mock is. Dit is niet wat ik heb gevraagd. Ik wil dat de devellop agents zelf aan het bouwen gaan. Ik heb ook geen vragen van de voorzitter gehad."

Wat hij eigenlijk wil:

1. De voorzitter stelt verduidelijkingsvragen als de opdracht vaag is — en die kan de gebruiker beantwoorden.
2. De vier persona's (voorzitter, developer, tester, criticus) overleggen écht inhoudelijk.
3. De **developer schrijft zelf code naar files**, de **tester draait de tests zelf**, de **criticus leest de test-output en geeft de developer een nieuwe opdracht**.
4. Dit gebeurt in Docker-isolated sandbox zodat het nooit de host raakt.
5. Loopt door **net zo lang totdat de tests groen zijn** (max N iteraties).
6. Geen externe `/codex` mock; het dev-team voert het uit.

## Status na deze sessie

Wat in deze sessie geland is (quick wins op de bestaande flow):

- **Vier defaults vergrendeld** in de Ontwikkelteam-tab. `resolveDevPersonaIds` valt nu terug op `[de-voorzitter, de-developer, de-tester, de-criticus]` tenzij de gebruiker expliciet één van die vier in een override meegeeft. De meeting-tab seleccies (Nina, Poocky, ouroboros-engineer, ...) leaken niet meer door naar het dev-team.
- **Developer-prompt geescaleerd**: zijn system_prompt eist nu letterlijk dat elke beurt minstens één concreet file path EN één symbol-naam bevat, met een voorbeeld erbij. Het agenda-instructieblok voor `implementation-route` dwingt het ook af. Max words verhoogd van 80 naar 100 zodat hij genoeg ruimte heeft.
- **Rollback-regex robuuster**: `_extract_build_prompt._balanced_rollback_match` houdt nu backticks bij zodat `src/foo.py`-style paden niet meer halverwege afgekapt worden. Plus `_strip_inline_rollback` haalt de inline-rollback-claim uit Wijzigingen/Acceptatie zodat hij niet dubbel verschijnt. **Bekend issue**: in productie zie ik nog een edge case waar het pad toch klipt — vermoedelijk door triple-backtick code-fences elders in de Tester-tekst die de balanced state verstoren. In isolatie werkt de parser correct; productie-trace nodig in de volgende sessie.
- **Beschikbaar voor verificatie** via een live SSE-test: na deze fixes zegt de Developer expliciet "in `chess_app/main.py`, functie `parse_and_validate()`: extraheer 4-5-karakter patronen via `re.findall(r'[a-h][1-8][a-h][1-8][qrbn]?', response)`..." — concrete files en symbols.

Wat **niet** in deze sessie geland is — en wat eigenlijk *moet* gebeuren:

- **Aider-modus**: het dev-team voert geen code uit. Het levert nog steeds een bouwprompt en handt over aan `/codex` via de Cockpit slash-agent route. Die route werkt technisch (subprocess call naar Codex CLI of bridge), maar zonder de Codex CLI lokaal geconfigureerd doet hij niets zichtbaars — vandaar de "mock" indruk.

## Architectuur die we NU moeten bouwen — Aider-modus

De missende capaciteit: een **bouwlus** waarin de LLM-output van Developer en Tester direct vertaald wordt naar bestandsmutaties en testuitvoer in een geïsoleerde sandbox, met de Criticus die de test-output leest en de volgende beurt aanstuurt. Schets:

```
┌──────────────────────────────────────────────────────────────────────┐
│  DevTeamBuildSession (per build, leeft tot tests groen of N=4)       │
│                                                                       │
│  • workspace = tempdir of bind-mount in agent-runtime Docker job     │
│  • iteration_log: list[{phase, content, files_written, test_result}] │
│                                                                       │
│  Iteratie i:                                                          │
│    1. Developer-turn (LLM) — krijgt:                                  │
│         - build_prompt + clarifications                              │
│         - iteration_log van vorige rondes (test-output incluis)      │
│         - convention: schrijf code in <file path="X">...</file>      │
│           blokken; bestaande files lezen via leesopdracht aan tester │
│       Extractor: parse <file>-blokken, schrijf naar workspace        │
│       Event: {type:"files_written", paths:[...], iteration:i}        │
│                                                                       │
│    2. Tester-turn (LLM) — krijgt zelfde context + de files die       │
│       net geschreven zijn. Output:                                    │
│         - testcommando als <cmd>...</cmd>                            │
│       Backend draait commando in workspace via subprocess (Docker).  │
│       Event: {type:"test_run", exit_code, stdout, stderr,             │
│              duration_s, iteration:i}                                 │
│                                                                       │
│    3. Beoordeling:                                                    │
│       - exit_code == 0 → groen, klaar (chair summary, einde)         │
│       - exit_code != 0 → naar Criticus-turn                          │
│                                                                       │
│    4. Criticus-turn (LLM) — krijgt test-output, geeft een gerichte   │
│       opdracht: "Developer, in <file> regel N is het issue X, fix    │
│       door Y." Event: {type:"critic_feedback", iteration:i}          │
│                                                                       │
│    5. i += 1, loop tot N of groen.                                    │
│                                                                       │
│  Eindstaat:                                                           │
│    - workspace artifacts (alle files), persisted onder               │
│      data/dev-team-builds/<id>/                                       │
│    - finalized event {type:"build_complete"|"build_exhausted",       │
│      iterations:i, last_test_result, workspace_path}                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Implementatieplan (volgende sessie, ~4-6 uur)

**Backend (`controller/ouroboros_chat.py` + nieuw module `dev_team_build.py`):**

1. **Nieuwe module `controller/dev_team_build.py`** met `DevTeamBuildSession` klasse. Verantwoordelijkheden:
   - `workspace_dir`: tempdir + cleanup, bv. `data/dev-team-builds/{session_id}/`.
   - `extract_file_blocks(content) -> list[(path, code)]`: regex op `<file path="...">...</file>` of fenced ` ```python:path.py ` patronen. Veiligheidscheck: paths mogen niet escapen uit workspace.
   - `write_files(blocks) -> list[Path]`: schrijven, parents maken, ReadOnly bind-mount voor bestaande files indien al aanwezig.
   - `run_test_command(cmd, timeout=120) -> TestResult{exit_code, stdout, stderr, duration_s}`: subprocess in workspace; voor Docker isolatie via `docker run --rm -v {workspace}:/work --workdir /work python:3.12 sh -c "{cmd}"` of via een persistente buildbox container.
   - `iterate(initial_prompt, max_iterations) -> Iterator[event]`: orchestreert de cyclus.

2. **Nieuwe endpoint `POST /api/ouroboros-chat/development-team/build`** met SSE stream-response, payload `{session_id, build_prompt, clarifications, max_iterations}`. Yieldt:
   - `dev_turn` (developer's content)
   - `files_written` (paths)
   - `tester_turn` (tester's content)
   - `test_run` (exit code + output, gestripte)
   - `critic_turn` (feedback)
   - `build_complete` | `build_exhausted` | `build_error`

3. **Promptaanpassingen**:
   - Developer's system_prompt: voeg toe "Lever je code als `<file path=\"...\">...</file>` blokken. Pak alleen de files die echt veranderen."
   - Tester's system_prompt: voeg toe "Lever je testcommando in `<cmd>...</cmd>` tags; één regel, idempotent vanaf schone state."
   - Criticus's system_prompt: voeg toe "Lees de meegegeven test-output (stdout/stderr) en geef De Developper een gerichte fix-opdracht."

4. **MeetingRunner.iterate_dev_build(...)** wrapper die per beurt zelf de LLM aanroept en de file/cmd-extractors gebruikt, los van het bestaande `MeetingRunner.run`.

**Docker / sandbox:**

5. **Drie isolatiemodes** (config-flagged):
   - `inline`: subprocess in tempdir van de host (snelst, lekkagerisico).
   - `runtime`: docker run --rm via de bestaande agent-runtime adapter (correct gebruik van bestaande infra).
   - `dedicated_container`: persistente `python:3.12-slim` buildbox met bind-mount, herstart bij init.

   Default `runtime`. De buildbox-image moet minimaal `python3 pytest pygame python-chess requests` voorhanden hebben — provisie via `docker build` van een kleine Dockerfile in `containers/dev-team-buildbox/`.

**Frontend (`ouroboros-chat/src/App.tsx`):**

6. **Nieuw view-mode `development_team_build`** of een uitgebreide variant van de huidige tab. Renderlijst:
   - Per iteratie een blok: developer-turn (met geschreven files als chips), files_written event, tester-turn (met cmd), test_run event (groen/rood badge + collapsible stdout/stderr), critic-turn.
   - Live SSE consumer voor de events.
   - Onderaan: workspace-pad knop ("Open workspace") en eindstatus.

7. **Vervang `/codex`-handoff door directe build** in de Ontwikkelteam-tab. De huidige bouwprompt-card wordt: "Bouw nu uit" knop die de nieuwe `/build` endpoint streamt.

**Tests:**

8. Sandbox-test:
   - `test_dev_team_build_writes_files_and_runs_tests`: stubt een LLM die `<file>...</file>` blokken + een `<cmd>pytest</cmd>` levert, controleert dat de files op disk staan en de subprocess wordt aangeroepen.
   - `test_dev_team_build_iterates_on_red_test`: stubt eerste pytest-call met exit=1, tweede met exit=0, verwacht twee Developer-iteraties.
   - `test_dev_team_build_stops_at_max_iterations`: alle tests rood, verwacht `build_exhausted` event na N iteraties.

### Geschatte tijd

- Module + extractor + sandbox + endpoint: 2 uur
- Docker isolatie + buildbox image: 1 uur
- FE rewrite voor build-view: 1.5 uur
- Tests + smoketest: 0.5 uur
- Polishing + handoff: 0.5 uur

Totaal: 5-6 uur.

## Wat NU werkt (en getest mag worden)

Na deze sessie's commit:

1. Quit de Ouroboros Chat app helemaal (right-click op het icoon → Quit, of `pkill -f "target/release/ouroboros-chat"`). De Tauri single-instance plugin betekent dat een nieuwe launch een actief proces alleen focust — herstart dus volledig.
2. Start opnieuw. Het binary van vanavond bevat de nieuwste FE-code.
3. Ga naar Ontwikkelteam-tab. Vul prompt: "Maak een eenvoudig 2d schaak programmaatje waarmee je kunt schaken tegen ollama modellen."
4. Klik "Start team".
5. **Verwacht**: de chair stelt 1-3 verduidelijkingsvragen (gouden card met textareas). Beantwoord ze of klik "Sla over".
6. **Verwacht**: het overleg loopt met de vier defaults (voorzitter, developer, tester, criticus) — geen Nina/Poocky meer.
7. **Verwacht**: Developer noemt concrete files (`src/...`, `tests/...`) en symbolen.
8. **Verwacht**: build_prompt-card eindigt netjes met `Rollback: ...` zonder midden-in-pad-truncatie.
9. **Wat nog niet werkt**: de `/codex` handoff doet niets zichtbaars. Klik "Start bouwen" en je krijgt een job-ID terug die nergens code produceert. Dit is de mock-symptoom die de Aider-modus gaat oplossen.

## Open punten

In aflopende prioriteit:

1. **Aider-modus** (kernpunt, hierboven uitgewerkt) — de volgende grote bouwopdracht.
2. **Rollback-regex edge case** — productie-trace nodig: bij triple-backtick code-fences elders in de Tester-tekst breekt de balanced-state toch. Mogelijk fix: parse hele tekst in segmenten, of: detecteer code-fences afzonderlijk.
3. **Streaming dev-team meeting** — nu wacht de gebruiker 60-90s op een synchrone POST zonder live progress. Switch naar `/meetings/stream` met `meeting_type:"development_team"`.
4. **Cockpit-binding / Docker isolatie verifiëren** — los van Aider-modus, ook voor de bestaande `/codex` handoff zou je willen dat hij in een Docker-job draait. Audit op `controller/agent_runtime/adapters/*.py` of de codex-adapter daadwerkelijk container-isolatie afdwingt.
5. **Lichte modellen die files weigeren te noemen** — als bij llama3:3b de Developer nog steeds vaag blijft, kan een fallback handgemaakte file-path-injectie helpen (op basis van topic-keyword → directory-mapping).

## Commits in deze sessie

- `Ouroboros` (WintripAI), branch `codex/guided-behavioral-apprenticeship`:
  - `c0df944` Ontwikkelteam: echte vier-rol meeting + clarification intake
  - `bdc85cb` Dev-team quick wins: force defaults, demand file paths, robuuster rollback
- `Ouroboros-chat`, branch `backup/ouroboros-chat-20260519-143915`:
  - `4dfb8fa` Fix prompt textarea overlap in development team workspace
  - `ecb3543` Ontwikkelteam: intake-Q&A en bewerkbare bouwprompt in de FE
  - `fe514ab` Dev-team: forceer de vier canonieke rollen in de Ontwikkelteam-tab

## Te onthouden voor de volgende agent

- De backend container `wintripai-ouroboros-backend-1` heeft `/home/pwintri2/WintripAI → /workspace` bind-mounted; herstart pakt code-wijzigingen op.
- De Tauri release-binary is bind-mounted dist? Nee — dist is *embedded* at build-time. Voor FE-wijzigingen MOET je `vite build` + `tauri build --no-bundle` doen. **EN** de app daadwerkelijk killen + opnieuw starten, want single-instance plugin pakt het oude proces.
- Test-sweep voor backend duurt ~110s door echte meetings met FakeOllama.
- De gebruiker werkt strikt in `/home/pwintri2/ouroboros-chat` — niet in `WintripAI/ouroboros_cockpit`.
- 44/44 chat-tests groen.
- Volgende sessie: start met de Aider-modus implementatie. Read deze handoff helemaal, dan dev_team_build.py als skeleton, daarna de endpoint en FE.

Succes.

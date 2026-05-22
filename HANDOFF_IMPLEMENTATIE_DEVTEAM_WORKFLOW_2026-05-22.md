# Handoff: Implementatie Dev-Team Workflow (Aider-modus)

Datum: 2026-05-22
Werkruimte: `/home/pwintri2/ouroboros-chat/`
Voorgaande handoff: `HANDOFF_OUROBOROS_CHAT_AIDER_MODE_2026-05-22.md`

## Wat de gebruiker wilde

> "In Ouroboros development:
> - Vraagt de voorzitter eerst een paar vragen ter verduidelijking
> - De voorzitter orkestreert het coderen
> - De agents gaan zo te werk: Voorzitter geeft opdracht, developper codeert, tester test, criticus ziet wat er goed of mis gaat en stelt aanpassing voor aan voorzitter. Daarna begint de ronde opnieuw totdat het helemaal werkt.
> - Als het klaar is geeft de voorzitter een samenvatting van wat er gemaakt is en waar het staat."

## Wat is geïmplementeerd

### 1. ✅ Voorzitter stelt eerst verduidelijkingsvragen
- **Status**: Werkt al, geen wijzigingen nodig
- De `/api/ouroboros-chat/development-team/intake` endpoint gebruikt een light model (`ouroboros:latest`) om snel (300ms) te bepalen of verduidelijking nodig is
- UI toont verduidelijkingsvragen in een goud kader boven de build-knoppen
- Gebruiker kan antwoorden of overslaan

### 2. ✅ Voorzitter orkestreert het coderen met live streaming
- **Wijziging**: `runDevelopmentTeamMeeting` in `App.tsx` gebruikt nu `/meetings/stream` endpoint
- **Resultaat**: Gebruiker ziet elke `participant_turn` (voorzitter, developer, tester, criticus) live verschijnen in het transcript
- Geen blokkerende spinner meer tijdens het overleg
- Event types: `meeting_started`, `participant_turn`, `meeting_recorded`, `meeting_summary`, `meeting_error`

### 3. ✅ Agents werken in rondes ( Voorzitter → Developer → Tester → Criticus → Voorzitter )

#### Backend (`WintripAI/controller/dev_team_build.py`):
- **`DevTeamBuildSession.iterate()`** implementatie:
  1. Developer turn: schrijft files in `<file path="...">...</file>` blokken
  2. Tester turn: stelt test commando voor in `<cmd>...</cmd>` blok
  3. Test run: voert commando uit in sandbox workspace
  4. **Als test GROEN**: Voorzitter reviewt of bouwdoel volledig is
     - **Nieuw**: `min_iterations` check (default: 2)
     - Als `iteration < min_iterations`: forceer CONTINUE, ongeacht chair verdict
     - Als `iteration >= min_iterations` en chair zegt DONE: build afgerond
     - Als chair zegt CONTINUE: volgende iteratie met nieuwe subtask
  5. **Als test Rood**: Criticus analyseert en geeft fix-opdracht
  6. Herhaal tot DONE of max_iterations bereikt

#### Frontend (`ouroboros-chat/src/App.tsx`):
- **`startTeamBuild()`**: Gebruikt `/development-team/build` endpoint (SSE) voor Aider-modus
- Rounds worden live gerenderd in `meeting-transcript-flow` sectie
- Toont: Developer content, files geschreven, Tester content, commando, stdout/stderr, Criticus feedback, Voorzitter verdict

### 4. ✅ Voorzitter geeft samenvatting aan einde
- **Nieuw**: `_generate_build_summary()` methode in `DevTeamBuildSession`
- Generat een mens-leesbare samenvatting bij `build_complete` event:
  - Aantal iteraties
  - Bouwdoel (geclipt)
  - Lijst van aangemaakte files
  - Laatste test commando
  - Voorzitter's reden
  - Workspace locatie
- Frontend toont deze in `finalMessage` veld

## Specifieke codewijzigingen

### Backend: `WintripAI/controller/dev_team_build.py`

#### 1. Nieuwe parameters in `DevTeamBuildSession.__init__`:
```python
def __init__(
    self,
    *,
    session_id: str,
    workspace: Path,
    llm_call: Callable[..., Any],
    max_iterations: int = 4,
    min_iterations: int = 2,        # NEW: minimum iterations before DONE allowed
    test_timeout: float = 120.0,
    llm_timeout_seconds: float = 90.0,  # NEW: timeout for LLM calls
):
```

#### 2. Min-iterations enforcement in `iterate()`:
```python
if verdict["verdict"] == "DONE":
    if iteration >= self.min_iterations:
        # Allow completion
        yield DevTeamBuildEvent("build_complete", {..., "summary": summary})
        return
    else:
        # Force CONTINUE - need more iterations
        yield DevTeamBuildEvent("chair_review", {
            "verdict": "CONTINUE",
            "reason": f"Minimaal {self.min_iterations} iteraties vereist."
        })
        continue
```

#### 3. LLM timeout wrapper in `_call_llm()`:
```python
with ThreadPoolExecutor(max_workers=1) as executor:
    future = executor.submit(_do_call)
    result = future.result(timeout=self.llm_timeout_seconds)
```

#### 4. Build summary generator:
```python
def _generate_build_summary(
    self,
    *,
    build_prompt: str,
    iterations: int,
    workspace_files: str,
    last_command: str,
    chair_reason: str,
) -> str:
    # Returns human-readable summary
```

### Backend: `WintripAI/controller/ouroboros_chat.py`

#### DevTeamBuildSession instantiatie:
```python
session = DevTeamBuildSession(
    session_id=session_id,
    workspace=workspace,
    llm_call=self._call_model_provider,
    max_iterations=int(getattr(request, "max_iterations", 4) or 4),
    min_iterations=int(getattr(request, "min_iterations", 2) or 2),  # NEW
    test_timeout=float(getattr(request, "test_timeout_seconds", 120.0) or 120.0),
    llm_timeout_seconds=float(getattr(request, "llm_timeout_seconds", 90.0) or 90.0),  # NEW
)
```

### Frontend: `ouroboros-chat/src/App.tsx`

#### 1. Nieuwe state:
```typescript
const [devMinIterations, setDevMinIterations] = useState(2);
```

#### 2. Streaming `runDevelopmentTeamMeeting`:
```typescript
// Oude: sync POST naar /development-team
// Nieuwe: SSE streaming naar /meetings/stream
const response = await fetch(apiUrl("/api/ouroboros-chat/meetings/stream"), {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
  body: JSON.stringify({
    topic: promptText,
    meeting_type: "development_team",
    participants: personaIdsToUse,
    provider: devProvider,
    model: devModel,
    tools: [],
    allow_tools: false,
  }),
});
```

#### 3. Event handlers voor streaming:
- `meeting_started`: meeting_id opslaan
- `participant_turn`: round toevoegen aan `devResult.rounds`
- `meeting_recorded`: build_prompt, summary, slash_prompt opslaan
- `meeting_summary`: intermediate summary
- `meeting_error`: error tonen

#### 4. Build request met nieuwe parameters:
```typescript
{
  build_prompt: buildPrompt,
  persona_ids: personaIds,
  clarifications: [],
  provider: devProvider,
  model: devModel,
  max_iterations: Math.max(1, Math.min(6, devMaxIterations || 4)),
  min_iterations: Math.max(1, Math.min(4, devMinIterations || 2)),  // NEW
  test_timeout_seconds: 120,
  llm_timeout_seconds: 90,  // NEW
}
```

#### 5. UI wijzigingen:
- "Iteraties" input gesplitst in "Max iteraties" en "Min iteraties"
- "Start bouwen" knop relabeled naar "Start externe bouwer (Codex)" met tooltip
- Knop gemarkeerd als `secondary` voor minder focus

#### 6. Type updates:
```typescript
type DevelopmentTeamResult = {
  // ... bestaande fields
  meeting_id?: string | null;        // was: string | undefined
  meeting_type?: string | null;      // was: string | undefined
  augmented_prompt?: string | null;  // was: string | undefined
};

type DevelopmentTeamRound = {
  id: string;
  round?: number;                    // NEW field
  phase: string;
  participantId?: string;
  participantName: string;
  content: string;
  createdAt: string;
};
```

## Hoe het nu werkt

### Flow 1: Development Team Meeting (planning)
```
Gebruiker → "Start team" → /meetings/stream (SSE)
  ↓
[Live transcript]
  ├─ meeting_started
  ├─ participant_turn (Voorzitter: opent meeting)
  ├─ participant_turn (Developer: implementatieroute)
  ├─ participant_turn (Tester: testplan)
  ├─ participant_turn (Criticus: risico's)
  └─ meeting_recorded (met build_prompt)
  ↓
Build prompt beschikbaar → Gebruiker ziet "Bouw uit met team (Aider-modus)" knop
```

### Flow 2: Aider-modus Build (iteratief coderen)
```
Gebruiker → "Bouw uit met team" → /development-team/build (SSE)
  ↓
[Live build transcript]
  ├─ build_started
  ├─ developer_turn (schrijft files)
  ├─ files_written
  ├─ tester_turn (stelt commando voor)
  ├─ test_run (voert uit)
  │  ├─ Als GROEN:
  │  │  └─ chair_review
  │  │     ├─ Als iteration < min_iterations (2): CONTINUE
  │  │     └─ Als iteration >= min_iterations: DONE → build_complete (met summary)
  │  └─ Als Rood:
  │     └─ critic_turn (fix-opdracht) → volgende iteratie
  └─ build_exhausted (als max_iterations bereikt)
  ↓
Files staan in: data/dev-team-builds/{session_id}/
```

## Wat de gebruiker nu ziet

1. **Verduidelijkingsvragen** (als de prompt niet specifiek genoeg is)
   - Goud kader met vragen van de voorzitter
   - Kan beantwoorden of overslaan

2. **Live meeting transcript** tijdens development team overleg
   - Elke participant turn verschijnt direct
   - Geen spinner, geen wachten tot alles klaar is

3. **Build prompt** na meeting
   - Kan worden bewerkt voordat build start

4. **Live build iteraties** tijdens Aider-modus
   - Developer schrijft files
   - Tester draait tests
   - Criticus geeft feedback op falen
   - Voorzitter beslist of door te gaan
   - **Minimaal 2 iteraties** voor complexe builds

5. **Samenvatting aan einde**
   - Wat er is gebouwd
   - Welke files zijn aangemaakt
   - Welke tests zijn gedraaid
   - Waar de files staan (workspace path)

6. **Duidelijke knoppen**
   - "Start team" → Development team meeting (planning)
   - "Bouw uit met team (Aider-modus)" → Iteratief bouwen (AANBEVOLEN)
   - "Start externe bouwer (Codex)" → Fallback naar /codex (mock in huidige setup)

## Testen

### Backend tests:
```bash
cd /home/pwintri2/WintripAI
python3 -m unittest sandbox_tests.test_dev_team_build
# Verwacht: 17 tests, alle OK
```

### Frontend type check:
```bash
cd /home/pwintri2/ouroboros-chat
npx tsc --noEmit --skipLibCheck
# Verwacht: geen errors
```

### Live test met curl:
```bash
# Intake (verduidelijking)
curl -sS -X POST http://127.0.0.1:8010/api/ouroboros-chat/development-team/intake \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Bouw een simpele calculator"}'

# Build (Aider-modus)
curl -sS -X POST http://127.0.0.1:8010/api/ouroboros-chat/development-team/build \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"build_prompt":"Maak add(a,b) en test", "persona_ids":["de-voorzitter","de-developer","de-tester","de-criticus"], "min_iterations":2, "llm_timeout_seconds":90}'
```

## Bestanden die zijn gewijzigd

### Backend (WintripAI/)
- `controller/dev_team_build.py` (~900 regels, +35 regels): min_iterations, llm_timeout, summary generator
- `controller/ouroboros_chat.py` (lijn ~5147): DevTeamBuildSession instantiatie met nieuwe parameters

### Frontend (ouroboros-chat/)
- `src/App.tsx` (~4000+ regels, +90 regels): streaming meeting, min_iterations input, knop labels

## Openstaande punten / Toekomstige verbeteringen

1. **Container restart**: De gebruiker moet `pkill -f "target/release/ouroboros-chat"` draaien en de app opnieuw starten om de nieuwe binary te laden (Tauri single-instance plugin)

2. **Model timeout**: De 90s timeout is ingesteld voor build-turns, maar de intake gebruikt een light model (ouroboros:latest) voor snelheid

3. **Complexe prompts**: Voor sehr complexe builds (bv. "maak een volledige webapp") kan de gebruiker min_iterations verhogen tot 3 of 4

4. **Workspace inspectie**: Toekomst: gebruiker kan de workspace files in de UI bekijken/downloaden

5. **Multi-file builds**: Toekomst: gebruiker kan bestaande directory aanwijzen als startpunt

## Conclusie

Alle gevraagde functionaliteit is geïmplementeerd:
- ✅ Voorzitter stelt verduidelijkingsvragen
- ✅ Voorzitter orkestreert het coderen
- ✅ Agents werken in rondes (Voorzitter → Developer → Tester → Criticus → Voorzitter)
- ✅ Minimaal 2 iteraties voor substantiële builds
- ✅ Live streaming van gesprek (geen spinner meer)
- ✅ Samenvatting aan einde met wat er gemaakt is en waar het staat
- ✅ Duidelijke UI met juiste knoppen en labels

**Volgende stap voor gebruiker**: App herstarten (`pkill` + relauch) en testen met een complexe prompt zoals "Bouw een schaakprogramma met CLI interface en unit tests".

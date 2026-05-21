# Handoff: Ouroboros Chat vergadering lekt interne regie in zichtbare tekst

Datum: 2026-05-20  
Werkruimte: `/home/pwintri2/WintripAI`  
Gerelateerde standalone app: `/home/pwintri2/ouroboros-chat`

## Korte diagnose

De vergadering is nog niet geschikt om ontwikkelagenten op te laten bouwen. Niet omdat de beurtvolgorde stuk is, maar omdat de zichtbare bijdragen interne vergaderregels, guardrails en fallback-templates oplepelen alsof ze inhoudelijke gedachten zijn.

De meest recente output is ordelijker dan eerder, maar inhoudelijk nog verkeerd. Voorbeelden:

```text
Criticus toetst spoor telemetry-JSONL
Bewijs dat ik wil zien...

De ontwerper kiest spoor statuspaneel
Eerste bewijs...

Nina verdiept spoor modelpoort-circuitbreaker
Acceptatie blijft...

De voorzitter
Ik kies de bouwvolgorde...
De volgende spreker verdiept zijn eigen spoor...

Bouwticket
read-only stabiliteitsmonitor...
Approvalpoort...
```

Dit is meta-taal. Het toont de interne regie-machine: `spoor`, `deep think`, `acceptatie blijft`, `bewijs dat ik wil zien`, `bouwticket`, `approvalpoort`. De gebruiker ziet daardoor geen natuurlijke vergadering over de opdracht, maar een formulier dat zijn eigen regels hardop voorleest.

## Belangrijk: dit is niet alleen derde persoon

De vorige correctie richtte zich op:

- voorzitter geeft expliciet het woord;
- persona blijft op hetzelfde oplossingsspoor;
- minder herhaling;
- concrete brainstorm-sporen bij een opdracht.

Dat hielp deels, maar de kernfout bleef: de fallback-output is gebouwd vanuit interne instructies en labels. Daardoor spreken deelnemers over hun toegewezen rol/spoor/procedure, niet over het onderwerp zelf.

Niet alleen dit moet eruit:

```text
Nina kiest spoor modelpoort-circuitbreaker
```

Maar ook dit soort zichtbare proceswoorden:

```text
spoor
deep think
acceptatie blijft
bewijs dat ik wil zien
approvalpoort
patchbaar experiment
de volgende spreker verdiept zijn eigen spoor
```

Die begrippen mogen intern sturend blijven, maar mogen niet in de zichtbare vergaderingstekst terechtkomen.

## Gewenst zichtbaar gedrag

Een bijdrage moet klinken alsof iemand inhoudelijk aan tafel spreekt.

Slecht:

```text
Nina verdiept spoor modelpoort-circuitbreaker: laat fallback alleen de beurt redden en markeer hem zichtbaar als fallback in telemetry. Acceptatie blijft...
```

Goed:

```text
Als een modelcall te lang duurt, mag de vergadering niet vastlopen. Ik zou de beurt afronden met een korte fallback, de provider als traag markeren en de foutcode apart loggen.
```

Slecht:

```text
De ontwerper kiest spoor statuspaneel: het eerste scherm toont backend, Tauri, modelpoort, opslag en GPU...
```

Goed:

```text
De gebruiker moet in één oogopslag zien welke laag hapert: backend, Tauri, modelpoort, opslag of GPU. Houd dat compact, met details pas op klik.
```

Slecht:

```text
Bouwticket: read-only stabiliteitsmonitor. Eerste patch...
```

Goed:

```text
Mijn voorstel: begin met een read-only monitor die niets herstart. Eerst meten en tonen; herstelknoppen komen pas daarna.
```

## Waarschijnlijk foutgebied

Hoofdbestand:

- `controller/ouroboros_chat.py`

Belangrijke functies:

- `MeetingRunner._fallback_turn`
- `MeetingRunner._distinctive_fallback_turn`
- `MeetingRunner._fallback_summary`
- `MeetingRunner._chair_floor_control_event`
- `MeetingRunner._brainstorm_agenda`
- `MeetingRunner._assignment_solution_tracks`
- `MeetingRunner._assignment_track_for_persona_identity`

De huidige fallback voor opdracht-brainstorms gebruikt nu vaste tracks zoals:

- `telemetry-JSONL`
- `statuspaneel`
- `modelpoort-circuitbreaker`
- `herstelcontroller`
- `watchdog-service`
- `rollback-register`

Die tracks zijn nuttig als intern plan, maar de zichtbare tekst moet ze vertalen naar natuurlijke inhoud. Het label zelf moet meestal niet uitgesproken worden.

## Tests: huidige tests borgen deels het verkeerde

Bestand:

- `sandbox_tests/test_ouroboros_chat_service.py`

Recent toegevoegde test:

- `test_brainstorm_assignment_chair_and_personas_keep_the_same_solution_track`

Deze test was bedoeld om te voorkomen dat de voorzitter spoor A noemt en de persona spoor B uitvoert. Dat is nog steeds belangrijk, maar de test assert nu expliciet zinnen zoals:

```text
De ontwerper kiest spoor statuspaneel
Nina kiest spoor modelpoort-circuitbreaker
Nina maakt spoor modelpoort-circuitbreaker patchbaar
```

Dat is inmiddels onderdeel van het probleem. De test moet worden vervangen of aangescherpt:

- wel borgen dat de inhoud consistent blijft per deelnemer;
- niet eisen dat interne labels zichtbaar zijn;
- juist asserties toevoegen dat woorden als `spoor`, `deep think`, `acceptatie blijft`, `approvalpoort`, `bewijs dat ik wil zien` niet in deelnemerbijdragen verschijnen.

Let op: `Akkoord` mag zichtbaar zijn waar het echt om action gating gaat, maar niet als reflexmatig vergaderlabel in elke output.

## Aanpak voor volgende agent

1. Maak een scheiding tussen intern plan en publieke uiting.

   Intern mag een turn context hebben als:

   ```json
   {
     "track": "modelpoort-circuitbreaker",
     "phase": "research-layer",
     "acceptance": "kunstmatige timeout levert fallback en foutcode op"
   }
   ```

   Maar de zichtbare bijdrage moet worden gerenderd als normale spreektaal zonder labels.

2. Voeg een kleine renderer toe voor opdracht-brainstorm fallback turns.

   Bijvoorbeeld intern:

   - `research`: concrete observatie of voorstel;
   - `research-layer`: trade-off of risico in spreektaal;
   - `solution-dive`: klein bouwvoorstel in spreektaal.

   Niet:

   - `"{name} kiest spoor {title}"`
   - `"{name} verdiept spoor {title}"`
   - `"Acceptatie blijft: ..."`

3. Houd de naam uit de content.

   De UI toont de spreker al. De content moet niet beginnen met `Nina ...`, `Criticus ...`, `De ontwerper ...`.

4. Houd voorzitter-regie kort en natuurlijk.

   De voorzitter mag zeggen:

   ```text
   Dank. Ik geef nu het woord aan Nina.
   ```

   Of:

   ```text
   Dank. Nina, kijk vooral naar wat er gebeurt als het model traag wordt.
   ```

   Maar niet:

   ```text
   Ik geef nu het woord aan Nina voor deep think op modelpoort-circuitbreaker.
   ```

5. Synthese moet inhoudelijk zijn, geen ticket-template.

   Goed:

   ```text
   We beginnen met meten zonder herstelacties. Eerst health per laag en metadata-only logging; pas daarna bouwen we herstelknoppen.
   ```

   Niet:

   ```text
   Bouwticket: read-only stabiliteitsmonitor. Eerste patch...
   ```

## Status van repo en runtime

Worktree is dirty en bevat veel bestaande wijzigingen buiten deze specifieke meetingfix. Niet blind revert doen.

Relevante gewijzigde bestanden voor deze probleemlijn:

- `controller/ouroboros_chat.py`
- `sandbox_tests/test_ouroboros_chat_service.py`

Laatste bekende gerichte test-run vóór deze handoff:

```bash
python3 -m py_compile controller/ouroboros_chat.py
python3 -m unittest sandbox_tests.test_ouroboros_chat_service sandbox_tests.test_ouroboros_chat_routes sandbox_tests.test_ouroboros_chat_personas_meetings
```

Resultaat toen: `Ran 35 tests OK (skipped=9)`.

Maar: die groene testset is niet voldoende, omdat hij deels de verkeerde zichtbare meta-taal accepteert.

Backend is eerder herstart via:

```bash
docker --context desktop-linux restart wintripai-ouroboros-backend-1
```

En `/health` was daarna online. Herstart opnieuw na codewijzigingen, bij voorkeur met expliciete `desktop-linux` context, omdat de Docker default/context eerder verwarring gaf.

## Niet vergeten

De gebruiker wil dat dit team uiteindelijk veilig kan coderen. Daarom moet de vergadering niet alleen netjes ogen, maar inhoudelijk betrouwbaar zijn:

- geen interne guardrails oplepelen;
- geen procedurelabels als inhoud;
- geen derde-persoons zelfbeschrijving;
- geen herhaling;
- kritiek als verdieping, niet als blokkade;
- bouwen of externe acties pas na expliciet `Akkoord`.

De volgende fix moet dus niet meer protocol toevoegen. Hij moet de protocoltekst uit de publieke meeting halen.

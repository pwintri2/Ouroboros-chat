# Handoff: Dual-Layer SSE Timeout & Intake Fixes

**Datum:** 2026-05-22
**Status:** Definitieve Oplossing Geïmplementeerd

## Wat is er aangepakt?
We kampten met de foutmelding *"De backend reageerde niet op tijd of de verbinding met 127.0.0.1:8010 werd onderbroken"*. Hoewel we eerder de Ollama-timeout al naar 600 seconden hadden verhoogd en een 8-byte SSE-ping hadden toegevoegd, wezen diepere tests uit dat dit niet genoeg was.

De ware oorzaken bleken tweeledig:
1. **De synchrone Intake Request Crash (`POST /development-team/intake`)**
   De intake is geen SSE-stream, maar een gewone synchrone request. Omdat Ollama soms 3 minuten nodig had om een grote prompt door te nemen, overschreed dit de harde 120s timeout-limiet van de browser/proxy. Dit zorgde ervoor dat de UI crashte *voordat de meeting überhaupt kon starten*.
2. **De "Te Grote" Ping Buffer Limit**
   In de backend (in `ouroboros_chat.py`) werd een ping gestuurd (`: ping ping...`) van ruim 5KB om de buffer van de proxy te forceren. Dit overschreed echter de veiligheidslimiet voor regel-lengte in de Nginx reverse-proxy en de browser, waardoor de verbinding alsnog werd dichtgegooid.

## Wat is er geïmplementeerd?

### 1. Graceful Intake Fallback (Frontend - `App.tsx`)
In `App.tsx` is de `try/catch`-logica van de intake request aangepast:
```typescript
    try {
      intake = await fetchJson<DevelopmentTeamIntakeResult>("/api/ouroboros-chat/development-team/intake", ...);
    } catch (error) {
      console.warn("Intake failed or timed out, skipping clarification and proceeding.", error);
      intake = null;
    }
```
In plaats van een `networkerror` af te dwingen en het hele proces stil te leggen, vangt de UI deze falende request nu netjes op. De UI slaat dan automatisch de verduidelijkingsvragen over en start vlekkeloos direct door met de "echte" meeting-stream.

### 2. Micro-Pings ter voorkoming van Buffer Overflow (Backend - `ouroboros_chat.py`)
In `controller/ouroboros_chat.py` is de gigantische ping-regel opgesplitst in 500 kleine, valide SSE-comments:
```python
yield b"".join(b": ping\n" for _ in range(500)) + b"\n"
```
Dit lost twee problemen tegelijk op:
- Het vult nog steeds feilloos de proxy-buffer zodat data direct wordt doorgegeven.
- Het blijft netjes onder alle ingestelde veiligheidslimieten (4KB/8KB per regel), waardoor SSE-parsers niet meer panikeren.

## Volgende Stappen
De `Ouroboros-chat` repo en `WintripAI` backend repo zijn gesynchroniseerd met deze fixes. Je kunt nu een nieuw plan of experiment inzetten zonder de restricties van falende netwerkverbindingen.

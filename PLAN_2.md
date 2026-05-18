# Buildplan: Ouroboros Chat Naar Helder Productmodel

## Summary
Herbouw de huidige UI-state rond vier strikt gescheiden domeinen: `Persona`, `Thread`, `Meeting` en `AgentTask`. Stop met globale persona/chat/meeting-state die elkaar beïnvloedt. De visuele stijl blijft behouden, maar de interne flow wordt opnieuw georganiseerd zodat `New chat`, persona-chat en meeting table voorspelbaar werken.

Belangrijkste doel:
- `New chat` is altijd neutraal.
- Persona-chat is een eigen thread met eigen persona.
- Persona builder wijzigt nooit actieve chats.
- Meeting table is een aparte workspace voor persona’s.
- Agents zijn alleen follow-up uitvoerders na een meeting.

## Agent Ownership

### Agent A: State Model & Frontend Architectuur
Ownership: `/home/pwintri2/ouroboros-chat/src/App.tsx`

Taken:
- Vervang losse globale state door één genormaliseerd frontend-model:
  - `personasById`
  - `threadIds`
  - `threadsById`
  - `activeThreadId`
  - `meetingsById`
  - `activeMeetingId`
  - `draftPersona`
  - `builderMode`
- Definieer types:
  - `ThreadType = "neutral" | "persona"`
  - `ViewMode = "chat" | "persona_builder" | "meeting" | "settings"`
  - `MeetingStatus = "draft" | "running" | "completed" | "error"`
- Maak selectors:
  - `activeThread`
  - `activeThreadPersona`
  - `activeMeeting`
  - `savedPersonas`
- Verwijder impliciete afhankelijkheid van globale `activePersona` voor chatgedrag.

Acceptatie:
- Een thread bepaalt zelf welke persona/model/messages hij heeft.
- Wisselen van persona verandert bestaande threads niet.
- Builder-typing wijzigt geen chatheader of message labels.

### Agent B: Chat & Thread Workflows
Ownership: chat/thread UI en send-flow in `App.tsx`

Taken:
- `New chat` maakt altijd een neutrale thread:
  - `type: "neutral"`
  - geen `personaId`
  - model `ollama / ouroboros:latest`
- Klik op persona links:
  - zoekt bestaande persona-thread of maakt nieuwe `type: "persona"` thread.
  - activeert alleen die thread.
- `sendMessage()` gebruikt uitsluitend `activeThread`.
- Message labels komen uit `activeThread.personaSnapshot?.name` of `Ouroboros`.

Acceptatie:
- Chat met Monique blijft Monique.
- `New chat` daarna is neutraal.
- Terugklikken naar Monique-thread toont weer Monique.
- Provider/model-wijzigingen gelden alleen voor de actieve thread.

### Agent C: Persona Builder
Ownership: persona create/edit/import/export UI

Taken:
- Builder gebruikt alleen `draftPersona`.
- `Create persona` slaat draft op en voegt toe aan persona-lijst, maar selecteert hem niet automatisch voor chat.
- `Save changes` past opgeslagen persona aan; bestaande threads houden hun snapshot totdat expliciet “Use updated persona in this thread” wordt gekozen.
- Voeg duidelijke acties toe:
  - `Create persona`
  - `Save changes`
  - `Save as new`
  - `Use in new chat`
  - `Add to meeting`
- Kennisbestanden, avatar, tools en memory blijven aan draft/saved persona gekoppeld.

Acceptatie:
- Naam typen in builder verandert nooit actieve chat.
- Nieuwe persona verschijnt links na opslaan.
- Pas na `Use in new chat` ontstaat een persona-thread.

### Agent D: Meeting Workspace
Ownership: meeting table UI en meeting state

Taken:
- Maak meetings los van normale chatthreads:
  - `Meeting { id, topic, personaIds, agentIds, transcript, status }`
- Klik op `Meeting` opent een meeting workspace, geen gewone chat.
- Persona’s staan primair bovenaan en zijn verplicht voor `Start meeting`.
- Agents staan apart onder “Agents voor vervolgtaken”.
- `Start meeting` stuurt alleen personaIds naar `/api/ouroboros-chat/meetings`.
- Meeting transcript wordt in de meeting workspace getoond.
- Na meeting kan `Create agent task` een `/agents` prompt voorbereiden met gekozen agents.

Acceptatie:
- Meeting kan niet starten zonder persona’s.
- Agents worden niet als meeting-deelnemers behandeld.
- Meeting transcript staat los van chatthreads.
- Agent task is expliciet vervolgwerk, geen onderdeel van persona-overleg.

### Agent E: Backend Alignment
Ownership: `controller/ouroboros_chat.py` en stores

Taken:
- Laat bestaande persona/conversation endpoints intact.
- Voeg alleen toe als nodig:
  - `POST /api/ouroboros-chat/meetings` blijft persona-only.
  - response bevat `meeting_id`, `events`, `participants`, `summary`.
- Conversation/chat endpoint accepteert:
  - `thread_id` of bestaande `conversation_id`
  - optioneel `persona_id`
  - neutrale chat gebruikt geen persona-id of valt server-side terug op Ouroboros.
- Geen agents uitvoeren vanuit meeting endpoint; alleen voorstellen/metadata teruggeven.

Acceptatie:
- Backend voert geen Cline/shell/browser/agent tools uit vanuit meetings.
- Neutrale chats blijven `ollama / ouroboros:latest`.
- Persona prompts blijven via `PromptAssembler`.

### Agent F: QA & Workflow Tests
Ownership: tests en handmatige acceptance checklist

Taken:
- Voeg Playwright of lightweight UI smoke tests toe als haalbaar; anders minimaal scripted build checks plus handmatige checklist.
- Backend regressie blijft:
  - `python3 -m unittest sandbox_tests.test_ouroboros_chat_service`
- Frontend:
  - `npm --prefix /home/pwintri2/ouroboros-chat run build`
- Acceptance scenarios:
  1. Maak persona `Monique Botje`.
  2. Typ in builder; actieve chat verandert niet.
  3. Sla op; Monique verschijnt links.
  4. Klik Monique; Monique-thread opent.
  5. Klik `New chat`; neutrale Ouroboros-thread opent.
  6. Terug naar Monique-thread; Monique-context blijft.
  7. Open Meeting; selecteer Monique + tweede persona.
  8. Start meeting; transcript verschijnt in meeting workspace.
  9. Selecteer Codex/Roo als follow-up agents; maak agent-task prompt.
  10. Geen agent wordt uitgevoerd zonder expliciete approval-flow.

## Implementation Order
1. Agent A maakt state model en selectors.
2. Agent B migreert chat/thread flows naar dat model.
3. Agent C koppelt persona builder aan `draftPersona`.
4. Agent D bouwt meeting workspace op eigen meeting-state.
5. Agent E past backend alleen aan waar frontend-contract ontbreekt.
6. Agent F draait tests en valideert de 10 workflow-scenario’s.

## Assumptions
- Visuele stijl blijft zoals nu; dit is primair een state/workflow-refactor.
- `/home/pwintri2/ouroboros-chat` blijft de frontend workspace.
- WintripAI backend blijft source of truth voor personas, conversations, memory, knowledge en meetings.
- Agents zoals Codex/Roo/Atlas worden alleen als follow-up taken voorbereid, niet automatisch uitgevoerd.

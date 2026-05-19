Lees alles in /home/pwintri2/ouroboros-chat/
Baseer alle backend koppelingen op de koppelingen in /home/pwintri2/WintripAI/ zoals koppelingen met cli

Kun je het onderstaande plan zo uitvoeren dat vergaderingen / meetings in een apart tablad zijn te initialiseren en plaatsvinden?

📝 Het Build Plan: "Ouroboros Meeting Engine v1"

  Dit plan dient als een alles-in-één prompt om de vergaderfunctie volledig operationeel te maken.

  1. Core State & Domain (Frontend)
   * Action: Implementeer de meetingsById en activeMeetingId volledig in App.tsx.
   * Data Model: Een meeting bevat id, topic, participants (persona objecten), rounds (array van bijdragen), en
     summary.
   * Separatie: Zorg dat de chat-main sectie volledig switcht naar een MeetingWorkspace component wanneer viewMode ===
     'meeting'.

  2. Socially Aware Prompting (AI Logic)
   * Persona Awareness: Voor elke deelnemer in de meeting, genereer een tijdelijke System Prompt:

   1     Je bent in een Ouroboros Vergadering.
   2     Onderwerp: {topic}
   3     Andere aanwezigen: {list_of_other_personas_and_roles}
   4     Jouw Rol: {persona.role}
   5     Jouw Regels: {persona.rules}
   6     Instructie: Reageer op het onderwerp en de input van anderen vanuit jouw specifieke expertise.
   * Context Window: Stuur bij elke beurt de volledige transcriptie van de huidige vergadering mee naar de betreffende
     persona.

  3. De Backend Meeting Runner (Python/FastAPI)
   * Endpoint: POST /api/ouroboros-chat/meetings
   * Logic:
       1. Ontvang participants en topic.
       2. Initialiseer MeetingState.
       3. Ronde 1 (Brainstorm): Vraag elke persona om een initiële reactie op het onderwerp.
       4. Ronde 2 (Discussie): Toon de reacties van anderen aan elke persona en vraag om een verdieping of
          tegenargument.
       5. Synthese: Gebruik een laatste LLM-call om een 'Consensus & Actiepunten' lijst te genereren.

  4. UI "Cockpit" Features
   * Participant Bar: Een horizontale balk bovenaan de workspace met avatars. Een pulserende gloed rond een avatar
     geeft aan dat die persona 'denkt'.
   * Transcript Flow: Berichten verschijnen met duidelijke labels en de specifieke 'tone' van de persona.
   * Action Bridge: Voeg de "Create Agent Task" functionaliteit toe. Dit neemt de samenvatting van de meeting en
     bereidt een /agents prompt voor in de composer.

  ---

  🚀 De Master Prompt voor de Implementatie

  Gebruik de onderstaande prompt om de volledige functie in één keer (of in fasen) te laten bouwen door een agent:

  > Prompt: "Herbouw de Ouroboros Meeting functie volgens de volgende specificaties:
  > 1. State: Maak Meeting een onafhankelijk domein in de frontend. Gebruik de activeMeetingId om een speciale
  MeetingWorkspace te tonen die de reguliere chat vervangt.
  > 2. Backend Logic: Implementeer een Python MeetingRunner die persona's sequentieel aanroept. Zorg dat elke persona
  in zijn prompt wordt geïnformeerd over de aanwezigheid en rollen van de andere deelnemers ('Social Awareness').
  > 3. Persona Integrity: Gebruik de volledige metadata (tone, rules, systemPrompt) van de StoredPersona bij elke stap
  in de vergadering.
  > 4. Workflow: Een vergadering moet resulteren in een 'Consensus Summary'. Voeg een knop toe om deze samenvatting om
  te zetten in een /agents opdracht voor vervolgacties door technische agents.
  > 5. UI: Toon een live transcript in de MeetingWorkspace en visuele feedback voor welke persona op dat moment aan
  het woord is."

  Dit plan zorgt ervoor dat de vergaderingen niet meer aanvoelen als een serie losse chats, maar als een echt overleg
  waar persona's op elkaar reageren vanuit hun eigen identiteit.
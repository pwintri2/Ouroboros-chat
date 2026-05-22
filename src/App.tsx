import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, KeyboardEvent, SetStateAction } from "react";
import {
  AlertCircle,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Code2,
  Command,
  FileText,
  Globe2,
  Image,
  Loader2,
  MessageSquare,
  Mic,
  PanelRight,
  Paperclip,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import ouroborosLogo from "./assets/ouroboros-logo.png";

const DEFAULT_BACKEND_BASE = "http://127.0.0.1:8010";
const DEFAULT_PROVIDER = "ollama";
const DEFAULT_MODEL = "ouroboros:latest";
const INITIAL_THREAD_ID = "thread-home";

const BACKEND_BASE = (
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.TAURI_BACKEND_URL ||
  DEFAULT_BACKEND_BASE
).replace(/\/+$/, "");

type AttachmentKind = "doc" | "code" | "image";
type AttachmentStatus = "uploading" | "ready" | "error";
type MessageRole = "user" | "assistant";

type UploadedAttachment = {
  id: string;
  name: string;
  size: number;
  kind: AttachmentKind;
  status: AttachmentStatus;
  path?: string;
  error?: string;
};

type ChatMessage = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  status?: "pending" | "error" | "ready";
  attachments?: UploadedAttachment[];
  meta?: {
    provider?: string;
    model?: string;
    route?: string;
  };
};

type ChatThread = {
  id: string;
  type: ThreadType;
  personaId?: string;
  personaName?: string;
  provider?: string;
  modelName?: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  messages: ChatMessage[];
};

type BackendConversation = {
  id: string;
  persona_id: string;
  title: string;
  messages?: Array<{ id?: string; role?: string; content?: string; created_at?: string; createdAt?: string }>;
  updated_at?: string;
};

type Persona = {
  id?: string;
  name: string;
  description: string;
  role: string;
  introduction: string;
  tone: string;
  language: string;
  rules: string[];
  memoryMode: "off" | "light" | "full";
  memoryEnabled: boolean;
  systemPrompt: string;
  model: string;
  modelSettings: {
    provider: string;
    name: string;
    temperature: number;
    max_tokens: number;
    fallback_model: string;
  };
  tools: Record<string, boolean>;
  avatar: {
    kind: "initials" | "image";
    color: string;
    path?: string;
    filename?: string;
    previewUrl?: string;
  };
  knowledgeFiles: PersonaKnowledgeFile[];
  knowledgeSources: PersonaKnowledgeSource[];
};

type PersonaKnowledgeFile = {
  path: string;
  label: string;
  filename?: string;
  size?: number;
  kind?: string;
};

type PersonaKnowledgeSource = {
  url: string;
  label: string;
  note?: string;
};

type StoredPersona = {
  id: string;
  name: string;
  description?: string;
  role?: string;
  introduction?: string;
  instructions?: string;
  system_prompt?: string;
  tone?: string;
  language?: string;
  rules?: string[];
  tools?: Record<string, boolean>;
  memory?: { enabled?: boolean; scope?: string };
  model?: string;
  model_settings?: Persona["modelSettings"];
  avatar?: Persona["avatar"];
  knowledge_files?: PersonaKnowledgeFile[];
  knowledge_sources?: PersonaKnowledgeSource[];
  builtin?: boolean;
  archived?: boolean;
  created_at?: string;
  updated_at?: string;
};

type MemoryItem = {
  id: string;
  persona_id?: string | null;
  scope: string;
  content: string;
  tags?: string[];
  importance?: number;
  updated_at?: string;
};

type SlashOption = {
  command: string;
  title: string;
  description: string;
  agent?: string;
  source?: string;
};

type BackendState = {
  status: "checking" | "online" | "offline";
  label: string;
};

type ViewMode = "chat" | "persona_builder" | "meeting" | "development_team" | "settings";
type BuilderMode = "create" | "edit" | null;
type ThreadType = "neutral" | "persona";
type MeetingStatus = "draft" | "running" | "completed" | "error";
type MeetingType = "team" | "sprint_planning" | "brainstorm";

type MeetingRound = {
  id: string;
  round?: number;
  phase: string;
  participantId?: string;
  participantName: string;
  role?: string;
  tone?: string;
  content: string;
  createdAt: string;
  assignmentTrackKey?: string;
  nextSpeakerId?: string;
  previousSpeakerId?: string;
  topicIntent?: string;
  isFloorControl?: boolean;
  isIntervention?: boolean;
};

type Meeting = {
  id: string;
  backendMeetingId?: string;
  topic: string;
  meetingType: MeetingType;
  participants: StoredPersona[];
  personaIds: string[];
  agentIds: string[];
  rounds: MeetingRound[];
  summary: string;
  transcript?: string;
  status: MeetingStatus;
  updatedAt: string;
  error?: string;
  saved?: boolean;
};

type SavedMeetingRecord = {
  meeting_id: string;
  topic?: string;
  meeting_type?: MeetingType;
  status?: string;
  summary?: string;
  updated_at?: string;
  participants?: Array<{ id?: string; name?: string; role?: string }>;
  agent_ids?: string[];
};

type DevelopmentTeamRound = {
  id: string;
  round?: number;
  phase: string;
  participantId?: string;
  participantName: string;
  content: string;
  createdAt: string;
};

type DevelopmentTeamResult = {
  status: string;
  execution?: string;
  approval_required?: boolean;
  approval_phrase?: string;
  provider?: string;
  model?: string;
  agent_command?: string;
  slash_prompt?: string;
  safety_note?: string;
  rounds?: DevelopmentTeamRound[];
  build_prompt?: string;
  summary?: string;
  meeting_id?: string | null;
  meeting_type?: string | null;
  augmented_prompt?: string | null;
};

type DevelopmentTeamIntakeResult = {
  status: string;
  needs_clarification: boolean;
  questions: string[];
  prompt: string;
  provider?: string;
  model?: string;
};

type ClarificationAnswer = { question: string; answer: string };

type BuildFileWrite = { path: string; bytes_written: number; truncated?: boolean };

type BuildIteration = {
  iteration: number;
  developer?: string;
  tester?: string;
  critic?: string;
  files?: BuildFileWrite[];
  command?: string;
  exit_code?: number;
  stdout?: string;
  stderr?: string;
  duration_s?: number;
  green?: boolean;
  timed_out?: boolean;
  chair_verdict?: string;
  chair_reason?: string;
  chair_next?: string;
};

type BuildSessionState = {
  session_id?: string;
  workspace_path?: string;
  max_iterations?: number;
  iterations: Record<number, BuildIteration>;
  order: number[];
  status: "running" | "complete" | "exhausted" | "error" | "idle";
  finalMessage?: string;
  error?: string;
  startedAt?: string;
};

type MeetingMember = {
  id: string;
  name: string;
  handle: string;
  selected: boolean;
  online: boolean;
  source: "agent" | "persona";
  avatar?: Persona["avatar"];
};

type MeetingTextBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "keyValue"; label: string; text: string }
  | { type: "bulletList"; items: string[] }
  | { type: "numberedList"; items: string[] };

type UploadResponse = {
  files?: Array<{
    filename?: string;
    path?: string;
    size?: number;
    status?: string;
    error?: string;
    reason?: string;
    kind?: string;
    mime_type?: string;
  }>;
  attachments?: Array<{
    filename?: string;
    path?: string;
    size?: number;
    kind?: string;
    mime_type?: string;
  }>;
};

type ModelProviderOption = {
  id: string;
  label: string;
  models: string[];
  default_model?: string;
  configured?: boolean;
  local_only?: boolean;
  key_source?: string;
  auth_mode?: string;
  direct_chat?: boolean;
  agent_runtime_only?: boolean;
};

type ModelOptionsResponse = {
  providers?: ModelProviderOption[];
  brave?: { configured?: boolean; key_source?: string };
};

const DEFAULT_TOOLS: Record<string, boolean> = {
  web_search: false,
  file_search: true,
  code_execution: false,
  calendar_email: false,
  local_shell: false,
  image_generation: false,
  document_generation: false,
};

const FALLBACK_SLASH_OPTIONS: SlashOption[] = [
  {
    command: "/codex",
    title: "Codex",
    description: "Run Codex CLI against WintripAI.",
    agent: "codex",
    source: "fallback",
  },
  {
    command: "/roo",
    title: "Roo",
    description: "Start Roo Code adapters or an agent-runtime job.",
    agent: "roo",
    source: "fallback",
  },
  {
    command: "/deepseek",
    title: "DeepSeek",
    description: "Ask the DeepSeek CLI through the host bridge.",
    agent: "deepseek",
    source: "fallback",
  },
  {
    command: "/atlas",
    title: "Atlas",
    description: "Ask Atlas in the WintripAI workspace.",
    agent: "atlas",
    source: "fallback",
  },
  {
    command: "/ruflo",
    title: "Ruflo",
    description: "Start Ruflo swarm coordination.",
    agent: "ruflo",
    source: "fallback",
  },
  {
    command: "/claude",
    title: "Claude",
    description: "Run Claude Code when host auth is present.",
    agent: "claude",
    source: "fallback",
  },
  {
    command: "/agents",
    title: "Agents",
    description: "Show the Cockpit slash-agent catalog.",
    agent: "agents",
    source: "fallback",
  },
];

const INITIAL_MEMBERS: MeetingMember[] = [
  { id: "codex", name: "Codex", handle: "/codex", selected: false, online: true, source: "agent" },
  { id: "roo", name: "Roo", handle: "/roo", selected: false, online: true, source: "agent" },
  { id: "atlas", name: "Atlas", handle: "/atlas", selected: false, online: true, source: "agent" },
  { id: "deepseek", name: "DeepSeek", handle: "/deepseek", selected: false, online: true, source: "agent" },
];

const FALLBACK_MODEL_OPTIONS: ModelProviderOption[] = [
  {
    id: "ollama",
    label: "Ollama local",
    models: [DEFAULT_MODEL, "gpt-oss:120b-cloud", "llama3.2:latest", "mistral:latest", "qwen2.5:latest", "deepseek-coder:latest", "devstral:latest"],
    default_model: DEFAULT_MODEL,
    configured: true,
    local_only: true,
  },
  {
    id: "anthropic",
    label: "Claude via Cockpit API key",
    models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-latest"],
    default_model: "claude-sonnet-4-6",
    configured: false,
  },
  {
    id: "chatgpt_codex",
    label: "ChatGPT-Codex abonnement",
    models: ["gpt-5.2-codex", "gpt-5.1-codex", "gpt-5.0-codex", "o3", "o3-mini", "o4-mini"],
    default_model: "gpt-5.2-codex",
    configured: false,
    auth_mode: "oauth_shared_file",
    direct_chat: false,
  },
  {
    id: "openai",
    label: "OpenAI via Cockpit API key",
    models: ["gpt-5.4-mini", "gpt-5.4", "gpt-5.3-codex"],
    default_model: "gpt-5.4-mini",
    configured: false,
  },
  {
    id: "deepseek",
    label: "DeepSeek via Cockpit API key",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    default_model: "deepseek-chat",
    configured: false,
  },
  {
    id: "google",
    label: "Gemini via Cockpit API key",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    default_model: "gemini-2.5-flash",
    configured: false,
  },
  {
    id: "xai",
    label: "Grok/xAI via Cockpit API key",
    models: ["grok-3", "grok-3-mini", "grok-3-latest", "grok-2-latest"],
    default_model: "grok-3",
    configured: false,
  },
  {
    id: "mistral",
    label: "Mistral via Cockpit API key",
    models: ["mistral-large-latest", "mistral-medium-latest", "mistral-small-latest"],
    default_model: "mistral-large-latest",
    configured: false,
  },
];

const DEFAULT_PERSONA_ORDER = ["de-voorzitter", "de-developer", "de-tester", "de-criticus", "de-ontwerper"];
const MEETING_TYPE_OPTIONS: Array<{ id: MeetingType; label: string; hint: string; icon: "team" | "sprint" | "brainstorm" }> = [
  { id: "team", label: "Team vergadering", hint: "keuze + eigenaar", icon: "team" },
  { id: "sprint_planning", label: "Sprint planning", hint: "taak + test + rollback", icon: "sprint" },
  { id: "brainstorm", label: "Brainstormsessie", hint: "deep search + deep think", icon: "brainstorm" },
];
const DEVELOPMENT_PROVIDER_IDS = ["chatgpt_codex", "openai", "google", "ollama"];

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${BACKEND_BASE}${path}`;
}

function uploadUrl(path?: string, filename?: string): string | undefined {
  const name = filename || (path ? path.split("/").pop() : "");
  return name ? apiUrl(`/api/ouroboros-chat/uploads/${encodeURIComponent(name)}`) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  const text = await response.text();
  let payload: unknown = {};

  if (text.trim()) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { response: text };
    }
  }

  if (!response.ok) {
    const record = asRecord(payload);
    const detail = record?.detail || record?.error || record?.reason || response.statusText;
    throw new Error(String(detail || `HTTP ${response.status}`));
  }

  return payload as T;
}

function friendlyErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "Onbekende fout");
  if (/load failed|failed to fetch|networkerror/i.test(message)) {
    return "De backend reageerde niet op tijd of de verbinding met 127.0.0.1:8010 werd onderbroken. Probeer opnieuw; trage modelcalls vallen nu terug op transcript-fallbacks.";
  }
  return message;
}

function makeWelcomeMessage(personaName = "Ouroboros", introduction = ""): ChatMessage {
  return {
    id: "assistant-welcome",
    role: "assistant",
    content:
      introduction.trim() ||
      `${personaName} is geselecteerd. Stel je vraag en deze persona antwoordt met de eigen instructies, kennis en memory-instellingen.`,
    createdAt: nowIso(),
    status: "ready",
    meta: { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL, route: "local_ui" },
  };
}

function normalizeSlashMenu(payload: unknown): SlashOption[] {
  const record = asRecord(payload);
  let rawItems: unknown[] = [];

  if (Array.isArray(payload)) {
    rawItems = payload;
  } else if (record) {
    const candidates = [record.items, record.options, record.commands, record.menu, record.slash_agents];
    const foundArray = candidates.find(Array.isArray);
    if (Array.isArray(foundArray)) {
      rawItems = foundArray;
    } else if (asRecord(record.slash_agents)) {
      rawItems = Object.entries(asRecord(record.slash_agents) || {}).map(([key, value]) => ({
        command: key.startsWith("/") ? key : `/${key}`,
        ...(asRecord(value) || {}),
      }));
    }
  }

  const normalized = rawItems
    .map((item, index): SlashOption | null => {
      if (typeof item === "string") {
        const command = item.startsWith("/") ? item : `/${item}`;
        return {
          command,
          title: command.slice(1) || `Option ${index + 1}`,
          description: "Cockpit slash command.",
          source: "backend",
        };
      }

      const itemRecord = asRecord(item);
      if (!itemRecord) {
        return null;
      }

      const commandValue =
        itemRecord.command || itemRecord.name || itemRecord.prefix || itemRecord.value || itemRecord.agent;
      const command = String(commandValue || "").trim();
      if (!command) {
        return null;
      }

      const normalizedCommand = command.startsWith("/") ? command : `/${command}`;
      return {
        command: normalizedCommand,
        title: String(itemRecord.title || itemRecord.label || itemRecord.agent || normalizedCommand.slice(1)),
        description: String(itemRecord.description || itemRecord.summary || "Cockpit slash command."),
        agent: itemRecord.agent ? String(itemRecord.agent) : normalizedCommand.slice(1),
        source: "backend",
      };
    })
    .filter((item): item is SlashOption => Boolean(item));

  return normalized.length ? normalized : FALLBACK_SLASH_OPTIONS;
}

function extractResponseText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  const record = asRecord(payload);
  if (!record) {
    return "The backend returned an empty response.";
  }

  for (const key of ["response", "message", "content", "answer", "output", "text", "reason"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  for (const key of ["result", "data"]) {
    const nested = record[key];
    const text = extractResponseText(nested);
    if (text && text !== "The backend returned an empty response.") {
      return text;
    }
  }

  return JSON.stringify(payload, null, 2);
}

function extractMeta(payload: unknown): ChatMessage["meta"] {
  const record = asRecord(payload);
  if (!record) {
    return undefined;
  }
  return {
    provider: typeof record.provider === "string" ? record.provider : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    route: typeof record.route === "string" ? record.route : undefined,
  };
}

function classifyFile(file: File): AttachmentKind {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp|svg|bmp|avif)$/.test(name)) {
    return "image";
  }
  if (/\.(ts|tsx|js|jsx|py|rs|go|java|c|cc|cpp|h|hpp|css|scss|html|json|yaml|yml|toml|sh|sql)$/.test(name)) {
    return "code";
  }
  return "doc";
}

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function attachmentIcon(kind: AttachmentKind) {
  if (kind === "image") {
    return <Image size={16} />;
  }
  if (kind === "code") {
    return <Code2 size={16} />;
  }
  return <FileText size={16} />;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : (parts[0] || "O").slice(0, 2);
  return text.toUpperCase();
}

function slugId(value: string, fallback = "persona"): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 64);
  return slug || fallback;
}

function timestampValue(value?: string): number {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function providerOptionLabel(option: ModelProviderOption): string {
  const suffix = option.agent_runtime_only
    ? " (OAuth agent)"
    : option.configured === false && option.auth_mode?.includes("oauth")
      ? " (login missing)"
    : option.configured === false && !option.local_only
      ? " (key missing)"
      : option.auth_mode && option.auth_mode !== "api_key_from_subscription" && option.direct_chat === false
        ? ` (${option.auth_mode})`
        : "";
  return `${option.label || option.id}${suffix}`;
}

function defaultPersona(): Persona {
  return {
    id: undefined,
    name: "Ouroboros",
    description: "Lokale Ouroboros persona",
    role: "Local assistant",
    introduction: "Ik ben Ouroboros, je lokale assistent.",
    tone: "Grounded, practical, inspectable",
    language: "nl",
    rules: [],
    memoryMode: "light",
    memoryEnabled: true,
    systemPrompt:
      "Stay grounded, auditable, reversible, and safe. Treat symbolic language as metaphor unless the user explicitly asks for documentation tone.",
    model: DEFAULT_MODEL,
    modelSettings: {
      provider: DEFAULT_PROVIDER,
      name: DEFAULT_MODEL,
      temperature: 0.7,
      max_tokens: 2000,
      fallback_model: DEFAULT_MODEL,
    },
    tools: { ...DEFAULT_TOOLS },
    avatar: { kind: "initials", color: "#7bdcc3" },
    knowledgeFiles: [],
    knowledgeSources: [],
  };
}

function neutralChatPersona(): Persona {
  return {
    ...defaultPersona(),
    id: undefined,
    name: "Ouroboros",
    description: "Neutrale lokale Ouroboros chat",
    role: "Local assistant",
    introduction: "Nieuwe neutrale Ouroboros-chat. Kies links een persona als je met een specifiek profiel wilt praten.",
  };
}

function personaFromStored(record: StoredPersona): Persona {
  return {
    id: record.id,
    name: record.name || "Ouroboros",
    description: record.description || "",
    role: record.role || "",
    introduction: record.introduction || "",
    tone: record.tone || "Grounded, practical, inspectable",
    language: record.language || "nl",
    rules: Array.isArray(record.rules) ? record.rules : [],
    memoryMode: "light",
    memoryEnabled: record.memory?.enabled !== false,
    systemPrompt: record.instructions || record.system_prompt || "",
    model: record.model || DEFAULT_MODEL,
    modelSettings: {
      provider: record.model_settings?.provider || DEFAULT_PROVIDER,
      name: record.model_settings?.name || record.model || DEFAULT_MODEL,
      temperature: Number(record.model_settings?.temperature ?? 0.7),
      max_tokens: Number(record.model_settings?.max_tokens ?? 2000),
      fallback_model: record.model_settings?.fallback_model || DEFAULT_MODEL,
    },
    tools: { ...DEFAULT_TOOLS, ...(record.tools || {}) },
    avatar: record.avatar?.kind === "image" || record.avatar?.kind === "initials"
      ? {
        kind: record.avatar.kind,
        color: record.avatar.color || "#7bdcc3",
        path: record.avatar.path,
        filename: record.avatar.filename,
        previewUrl: record.avatar.previewUrl || uploadUrl(record.avatar.path, record.avatar.filename),
      }
      : { kind: "initials", color: "#7bdcc3" },
    knowledgeFiles: Array.isArray(record.knowledge_files) ? record.knowledge_files : [],
    knowledgeSources: Array.isArray(record.knowledge_sources) ? record.knowledge_sources : [],
  };
}

function memberFromPersona(record: StoredPersona, selected = false): MeetingMember {
  return {
    id: record.id,
    name: record.name,
    handle: `persona:${record.id}`,
    selected,
    online: true,
    source: "persona",
    avatar: record.avatar,
  };
}

function composeSystemPrompt(persona: Persona): string {
  const parts = [
    persona.systemPrompt.trim(),
    persona.role ? `Role: ${persona.role}` : "",
    persona.introduction ? `Introduction: ${persona.introduction}` : "",
    persona.description ? `Description: ${persona.description}` : "",
    persona.rules.length ? `Rules:\n${persona.rules.map((rule) => `- ${rule}`).join("\n")}` : "",
    persona.knowledgeFiles.length
      ? `Knowledge files available: ${persona.knowledgeFiles.map((file) => file.label || file.filename || file.path).join(", ")}.`
      : "",
    persona.knowledgeSources.length
      ? `Knowledge links available: ${persona.knowledgeSources.map((source) => `${source.label || source.url}: ${source.url}`).join(", ")}.`
      : "",
    `Persona: ${persona.name}. Tone: ${persona.tone}. Language: ${persona.language}. Memory: ${persona.memoryEnabled ? persona.memoryMode : "off"}.`,
  ].filter(Boolean);
  return parts.join("\n");
}

function meetingParticipantFromEvent(event: Record<string, unknown>): Record<string, unknown> {
  return asRecord(event.participant) || {};
}

function meetingRoundsFromEvents(events: unknown[], fallbackParticipants: StoredPersona[]): MeetingRound[] {
  return events
    .map((event, index): MeetingRound | null => {
      const record = asRecord(event);
      if (!record) {
        return null;
      }
      const looksLikeSavedRound =
        typeof record.content === "string" &&
        (typeof record.participantName === "string" ||
          typeof record.participant_name === "string" ||
          typeof record.participantId === "string" ||
          typeof record.participant_id === "string");
      if (record.type !== "participant_turn" && record.type !== "participant_note" && !looksLikeSavedRound) {
        return null;
      }
      const participant = meetingParticipantFromEvent(record);
      const participantId = participant.id
        ? String(participant.id)
        : record.participantId || record.participant_id
          ? String(record.participantId || record.participant_id)
          : undefined;
      const fallback = fallbackParticipants.find((item) => item.id === participantId);
      const promptContext = asRecord(record.prompt_context) || asRecord(record.promptContext) || {};
      const phase = String(record.phase || "round");
      return {
        id: String(record.id || `${record.meeting_id || "meeting"}-${record.round || 0}-${participantId || index}-${index}`),
        round: typeof record.round === "number" ? record.round : Number(record.round || 0) || undefined,
        phase,
        participantId,
        participantName: String(record.participantName || record.participant_name || participant.name || fallback?.name || participantId || "Persona"),
        role: String(record.role || participant.role || fallback?.role || ""),
        tone: String(record.tone || participant.tone || fallback?.tone || ""),
        content: String(record.content || ""),
        createdAt: String(record.createdAt || record.created_at || record.timestamp || nowIso()),
        assignmentTrackKey: promptContext.assignment_track_key ? String(promptContext.assignment_track_key) : undefined,
        nextSpeakerId: promptContext.next_speaker ? String(promptContext.next_speaker) : undefined,
        previousSpeakerId: promptContext.previous_speaker ? String(promptContext.previous_speaker) : undefined,
        topicIntent: promptContext.topic_intent ? String(promptContext.topic_intent) : undefined,
        isFloorControl: phase === "floor-control" || Boolean(promptContext.floor_control),
        isIntervention: phase === "intervention" || promptContext.intervention_reason === "anti_parroting",
      };
    })
    .filter((round): round is MeetingRound => Boolean(round));
}

function meetingSummaryFromPayload(payload: Record<string, unknown>, events: unknown[]): string {
  if (typeof payload.summary === "string" && payload.summary.trim()) {
    return payload.summary.trim();
  }
  const summaryEvent = events
    .map((event) => asRecord(event))
    .find((event) => event?.type === "meeting_summary");
  return String(summaryEvent?.summary || summaryEvent?.content || "").trim();
}

function meetingTranscriptFromRounds(rounds: MeetingRound[], summary: string): string {
  const body = rounds
    .map((round) => {
      const label = round.round ? `Ronde ${round.round} / ${round.phase}` : round.phase;
      return `${round.participantName} (${label}):\n${round.content}`;
    })
    .join("\n\n");
  return [body, summary ? `Consensus & Actiepunten:\n${summary}` : ""].filter(Boolean).join("\n\n---\n\n");
}

function isChairParticipant(id?: string, name = "", role = ""): boolean {
  const normalizedId = String(id || "").toLowerCase();
  const normalizedName = name.toLowerCase();
  const normalizedRole = role.toLowerCase();
  return normalizedId === "de-voorzitter" || normalizedName.includes("voorzitter") || normalizedRole.includes("facilitator");
}

function formatMeetingType(type?: string): string {
  return MEETING_TYPE_OPTIONS.find((option) => option.id === type)?.label || "Team vergadering";
}

function asMeetingType(value?: string): MeetingType {
  return MEETING_TYPE_OPTIONS.some((option) => option.id === value) ? (value as MeetingType) : "team";
}

function formatMeetingPhase(phase: string): string {
  const labels: Record<string, string> = {
    opening: "opent",
    input: "brengt in",
    "chair-bridge": "vat samen",
    "floor-control": "geeft woord",
    intervention: "grijpt in",
    "anti-parrot-redo": "herformuleert",
    reply: "reageert",
    closing: "sluit af",
    "plan-slice": "plant",
    "plan-bridge": "ordent plan",
    "plan-check": "checkt plan",
    research: "verkent",
    "research-bridge": "clustert",
    "research-layer": "verdiept aanname",
    "solution-dive": "stelt voor",
    "research-synthesis": "synthese",
    intake: "start",
    "implementation-route": "route",
    "test-plan": "testplan",
    "loop-guard": "bewaakt",
    brainstorm: "brengt in",
    discussion: "reageert",
    round: "spreekt",
    saved: "notitie",
  };
  return labels[phase] || phase;
}

const MEETING_PHASE_TIMELINE: Record<MeetingType, Array<{ phase: string; label: string; hint: string }>> = {
  team: [
    { phase: "opening", label: "Opening", hint: "doel en eerste spreker" },
    { phase: "input", label: "Inbreng", hint: "standpunt per deelnemer" },
    { phase: "chair-bridge", label: "Tussenstand", hint: "keuze en spanning" },
    { phase: "reply", label: "Antwoord", hint: "accepteren, aanpassen, parkeren" },
    { phase: "closing", label: "Besluit", hint: "eigenaar en volgende stap" },
  ],
  sprint_planning: [
    { phase: "opening", label: "Opening", hint: "sprintdoel en timebox" },
    { phase: "plan-slice", label: "Plan-slice", hint: "taak, acceptatie, test" },
    { phase: "plan-bridge", label: "Concept-bord", hint: "volgorde en rollback" },
    { phase: "plan-check", label: "Delivery-check", hint: "ontbrekende grens" },
    { phase: "closing", label: "Sprintkaart", hint: "wanneer een agent mag bouwen" },
  ],
  brainstorm: [
    { phase: "opening", label: "Opening", hint: "onderzoekscontract" },
    { phase: "research", label: "Verkenning", hint: "bronlaag per persona" },
    { phase: "research-bridge", label: "Clustering", hint: "lagen naast elkaar" },
    { phase: "research-layer", label: "Verdieping", hint: "aanname en alternatief" },
    { phase: "solution-dive", label: "Voorstel", hint: "kleine concrete patch" },
    { phase: "research-synthesis", label: "Synthese", hint: "bouwvolgorde" },
    { phase: "closing", label: "Afronding", hint: "wat na Akkoord pas mag" },
  ],
};

const ASSIGNMENT_TRACK_LABELS: Record<string, string> = {
  watchdog: "Monitoring-laag",
  telemetry: "Telemetrie",
  recovery: "Herstelroute",
  "status-ui": "Statuspaneel",
  rollback: "Rollback-register",
  "circuit-breaker": "Modelpoort",
  "vertical-slice": "Verticale slice",
  "contract-first": "Contract-first",
};

function meetingPhaseTimeline(type: MeetingType): Array<{ phase: string; label: string; hint: string }> {
  return MEETING_PHASE_TIMELINE[type] || MEETING_PHASE_TIMELINE.team;
}

function trackLabelFor(key?: string): string {
  if (!key) return "";
  return ASSIGNMENT_TRACK_LABELS[key] || key.replace(/[-_]/g, " ");
}

function cleanMeetingText(value: string): string {
  return value
    .replace(/^\s*[-*]\s*\*\*(.+?)\*\*:\s*/u, "$1: ")
    .replace(/^\s*\*\*(.+?)\*\*\s*$/u, "$1")
    .replace(/^\s*\*\*(.+?)\*\*:\s*/u, "$1: ")
    .trim();
}

function parseMeetingKeyValue(line: string): { label: string; text: string } | null {
  if (line.includes("://")) return null;
  const match = line.match(/^([^:：]{3,48})[:：]\s+(.+)$/u);
  if (!match) return null;
  const label = cleanMeetingText(match[1]);
  const text = cleanMeetingText(match[2]);
  if (!label || !text) return null;
  return { label, text };
}

function parseMeetingText(text: string): MeetingTextBlock[] {
  const lines = text.split(/\r?\n/u);
  const blocks: MeetingTextBlock[] = [];
  let paragraph: string[] = [];
  let list: Extract<MeetingTextBlock, { type: "bulletList" | "numberedList" }> | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    blocks.push(list);
    list = null;
  };

  for (const rawLine of lines) {
    const line = cleanMeetingText(rawLine);
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.+)$/u);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: cleanMeetingText(heading[1]) });
      continue;
    }

    const bullet = line.match(/^(?:[-*•])\s+(.+)$/u);
    if (bullet) {
      flushParagraph();
      if (!list || list.type !== "bulletList") {
        flushList();
        list = { type: "bulletList", items: [] };
      }
      list.items.push(cleanMeetingText(bullet[1]));
      continue;
    }

    const numbered = line.match(/^\d+[\.)]\s+(.+)$/u);
    if (numbered) {
      flushParagraph();
      if (!list || list.type !== "numberedList") {
        flushList();
        list = { type: "numberedList", items: [] };
      }
      list.items.push(cleanMeetingText(numbered[1]));
      continue;
    }

    const keyValue = parseMeetingKeyValue(line);
    if (keyValue) {
      flushParagraph();
      flushList();
      blocks.push({ type: "keyValue", ...keyValue });
      continue;
    }

    if (line.endsWith(":") && line.length <= 72 && !line.includes("://")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: line.slice(0, -1).trim() });
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: "paragraph", text: text.trim() }];
}

function StructuredMeetingText({ text, summary = false }: { text: string; summary?: boolean }) {
  const blocks = parseMeetingText(text);
  return (
    <div className={`structured-meeting-text ${summary ? "summary-text" : ""}`}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h3 key={`${block.type}-${index}`}>{block.text}</h3>;
        }
        if (block.type === "keyValue") {
          return (
            <div className="meeting-kv" key={`${block.type}-${index}`}>
              <strong>{block.label}</strong>
              <span>{block.text}</span>
            </div>
          );
        }
        if (block.type === "bulletList") {
          return (
            <ul key={`${block.type}-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "numberedList") {
          return (
            <ol key={`${block.type}-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${itemIndex}-${item}`}>{item}</li>
              ))}
            </ol>
          );
        }
        return <p key={`${block.type}-${index}`}>{block.text}</p>;
      })}
    </div>
  );
}

function meetingThoughtFlow(member: MeetingMember | undefined, type: MeetingType): Array<{ label: string; detail: string }> {
  const isChair = isChairParticipant(member?.id, member?.name);
  if (isChair) {
    return [
      { label: "Opent", detail: "doel, contract en eerste spreker" },
      { label: "Geeft woord", detail: "gerichte beurt met eigen opdracht" },
      { label: "Sluit", detail: "besluit, plan of onderzoekstap" },
    ];
  }
  if (type === "sprint_planning") {
    return [
      { label: "Taak", detail: "kleinste bouwstap met eigenaar" },
      { label: "Test", detail: "acceptatiecriterium en smoke-run" },
      { label: "Grens", detail: "rollback, afhankelijkheid, stopregel" },
    ];
  }
  if (type === "brainstorm") {
    return [
      { label: "Verkent", detail: "bronlaag, waarneming, onzekerheid" },
      { label: "Verdiept", detail: "aanname, alternatief, tegenvoorbeeld" },
      { label: "Stelt voor", detail: "kritiek omzetten in oplossingstest" },
    ];
  }
  return [
    { label: "Kiest", detail: "standpunt of beslisspanning" },
    { label: "Weegt", detail: "bewijs, risico, open vraag" },
    { label: "Besluit", detail: "eigenaar of vervolgstap" },
  ];
}

function meetingThoughtNarrative(member: MeetingMember | undefined, type: MeetingType): string {
  const name = member?.name || "De volgende spreker";
  const isChair = isChairParticipant(member?.id, member?.name);
  if (isChair) {
    if (type === "sprint_planning") {
      return `${name} opent het sprintcontract, geeft elke beurt een delivery-opdracht en sluit af met taak, test en rollback.`;
    }
    if (type === "brainstorm") {
      return `${name} opent de onderzoeksruimte, stuurt van verkennen naar verdiepen en maakt kritiek productief.`;
    }
    return `${name} opent de teamvergadering, bewaakt de besliskeuze en geeft expliciet de volgende spreker het woord.`;
  }
  if (type === "brainstorm") {
    return `${name} verkent eerst de bronlaag en gaat daarna dieper in op aannames, alternatieven en een klein oplossingsexperiment.`;
  }
  if (type === "sprint_planning") {
    return `${name} maakt het voorstel bouwbaar: taak, acceptatiecriterium, testcommando, rollback en stopregel.`;
  }
  return `${name} helpt de tafel kiezen met een standpunt, risico, eigenaar of besluitbare vervolgstap.`;
}

function chairLedSpeakerTimeline(members: MeetingMember[], type: MeetingType): string[] {
  const ids = members.map((member) => member.id).filter(Boolean);
  const chair = members.find((member) => isChairParticipant(member.id, member.name));
  if (!chair) return ids;
  const contributors = members.filter((member) => member.id !== chair.id);
  if (!contributors.length) return [chair.id];
  const timeline = [chair.id];
  contributors.forEach((member) => {
    timeline.push(member.id, chair.id);
  });
  if (type === "brainstorm") {
    contributors.forEach((member) => {
      timeline.push(member.id, chair.id);
    });
  }
  return timeline;
}

function meetingDevelopmentPrompt(meeting: Meeting): string {
  const transcript = meeting.rounds
    .map((round) => `${round.participantName} (${formatMeetingPhase(round.phase)}): ${round.content}`)
    .join("\n")
    .slice(0, 5000);
  const agentIds = meeting.agentIds.length ? meeting.agentIds.map((id) => `/${id}`).join(", ") : "/codex";
  return [
    `Ontwikkel/coderequest op basis van consensus: ${meeting.topic}`,
    `Vergadertype: ${formatMeetingType(meeting.meetingType)}`,
    `Voorkeursagents: ${agentIds}`,
    "",
    "Consensus:",
    meeting.summary || "Geen consensus beschikbaar.",
    "",
    "Transcriptkern:",
    transcript || "Geen transcript beschikbaar.",
    "",
    "Voer dit uit als Ouroboros development team: maak eerst een kort implementatieplan, wijzig klein, draai gerichte tests, laat de voorzitter stoppen bij herhaling of test-loops, en rapporteer bestanden plus verificatie.",
  ].join("\n");
}

function App() {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("chat");
  const [slashOptions, setSlashOptions] = useState<SlashOption[]>(FALLBACK_SLASH_OPTIONS);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [modelOptions, setModelOptions] = useState<ModelProviderOption[]>(FALLBACK_MODEL_OPTIONS);
  const [braveConfigured, setBraveConfigured] = useState(false);
  const [backendState, setBackendState] = useState<BackendState>({
    status: "checking",
    label: "checking",
  });

  // Normalized State
  const [personasById, setPersonasById] = useState<Record<string, StoredPersona>>({});
  const [threadIds, setThreadIds] = useState<string[]>([INITIAL_THREAD_ID]);
  const [threadsById, setThreadsById] = useState<Record<string, ChatThread>>({
    [INITIAL_THREAD_ID]: {
      id: INITIAL_THREAD_ID,
      type: "neutral",
      personaId: undefined,
      personaName: "Ouroboros",
      provider: DEFAULT_PROVIDER,
      modelName: DEFAULT_MODEL,
      title: "Local Ouroboros",
      subtitle: `${DEFAULT_PROVIDER} / ${DEFAULT_MODEL}`,
      updatedAt: nowIso(),
      messages: [makeWelcomeMessage()]
    }
  });
  const [activeThreadId, setActiveThreadId] = useState<string>(INITIAL_THREAD_ID);

  const [meetingsById, setMeetingsById] = useState<Record<string, Meeting>>({});
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  const [draftPersona, setDraftPersona] = useState<Persona>(() => defaultPersona());
  const [builderMode, setBuilderMode] = useState<BuilderMode>(null);

  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaNotice, setPersonaNotice] = useState("");
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [knowledgeLinkDraft, setKnowledgeLinkDraft] = useState("");

  // Meeting specific workspace state
  const [meetingRunning, setMeetingRunning] = useState(false);
  const [meetingSaving, setMeetingSaving] = useState(false);
  const [thinkingPersonaId, setThinkingPersonaId] = useState<string | null>(null);
  const [meetingMembers, setMeetingMembers] = useState<MeetingMember[]>(INITIAL_MEMBERS);
  const [meetingTopic, setMeetingTopic] = useState("Review this thread and propose next actions.");
  const [meetingType, setMeetingType] = useState<MeetingType>("team");
  const [savedMeetings, setSavedMeetings] = useState<SavedMeetingRecord[]>([]);
  const [devPrompt, setDevPrompt] = useState("Maak een robuuste implementatie, overleg, test en stop bij herhaling.");
  const [devProvider, setDevProvider] = useState("ollama");
  // Default to the lightweight local ouroboros model. A 23B "devstral" cold-start can take
  // 30-60s, which makes the intake + meeting feel unresponsive. The user can opt up to a
  // bigger model from the dropdown when they're prepared to wait for it.
  const [devModel, setDevModel] = useState("ouroboros:latest");
  const [devMaxIterations, setDevMaxIterations] = useState(3);
  const [devMinIterations, setDevMinIterations] = useState(2);
  const [devRunning, setDevRunning] = useState(false);
  const [devResult, setDevResult] = useState<DevelopmentTeamResult | null>(null);
  const [devError, setDevError] = useState("");
  const [devApproval, setDevApproval] = useState("");
  const [devClarificationQuestions, setDevClarificationQuestions] = useState<string[]>([]);
  const [devClarificationAnswers, setDevClarificationAnswers] = useState<Record<string, string>>({});
  const [devIntakeRunning, setDevIntakeRunning] = useState(false);
  const [devEditableBuildPrompt, setDevEditableBuildPrompt] = useState("");
  const [devTeamBuildRunning, setDevTeamBuildRunning] = useState(false);
  const [devTeamBuild, setDevTeamBuild] = useState<BuildSessionState>({
    iterations: {},
    order: [],
    status: "idle",
  });
  const [devTeamBuildError, setDevTeamBuildError] = useState("");
  const [devLaunchRunning, setDevLaunchRunning] = useState(false);
  const [devLaunchResult, setDevLaunchResult] = useState<Record<string, unknown> | null>(null);
  const [devLaunchError, setDevLaunchError] = useState("");
  const personasCountRef = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const importPersonaRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const personaPanelRef = useRef<HTMLElement>(null);
  const personaNameRef = useRef<HTMLInputElement>(null);
  const meetingPanelRef = useRef<HTMLElement>(null);
  const meetingTopicRef = useRef<HTMLTextAreaElement>(null);
  const statusPanelRef = useRef<HTMLElement>(null);
  const modelInputRef = useRef<HTMLSelectElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const meetingTranscriptRef = useRef<HTMLElement>(null);
  const meetingTranscriptEndRef = useRef<HTMLDivElement>(null);

  const currentThread = threadsById[activeThreadId];
  const activeMeeting = activeMeetingId ? meetingsById[activeMeetingId] : undefined;
  const messages = currentThread?.messages || [];
  const savedPersonas = useMemo(() => Object.values(personasById).sort((left, right) => {
    const leftDefault = DEFAULT_PERSONA_ORDER.indexOf(left.id);
    const rightDefault = DEFAULT_PERSONA_ORDER.indexOf(right.id);
    if (leftDefault >= 0 || rightDefault >= 0) {
      return (leftDefault >= 0 ? leftDefault : 99) - (rightDefault >= 0 ? rightDefault : 99);
    }
    if (left.builtin !== right.builtin) {
      return left.builtin ? -1 : 1;
    }
    return timestampValue(right.updated_at || right.created_at) - timestampValue(left.updated_at || left.created_at);
  }), [personasById]);

  function personaForId(personaId?: string, fallback = draftPersona): Persona {
    const record = personasById[personaId || ""];
    if (record) return personaFromStored(record);
    if (!personaId) return fallback;
    return { ...defaultPersona(), id: personaId, name: personaId === "ouroboros" ? "Ouroboros" : personaId };
  }

  function personaForThread(thread?: ChatThread): Persona {
    if (!thread || !thread.personaId) return { ...neutralChatPersona(), name: thread?.personaName || "Ouroboros" };
    const p = personaForId(thread.personaId);
    return { ...p, id: thread.personaId, name: thread.personaName || p.name };
  }

  const currentChatPersona = personaForThread(currentThread);
  const currentProvider = currentThread?.provider || currentChatPersona.modelSettings.provider || provider || DEFAULT_PROVIDER;
  const currentModel = currentThread?.modelName || currentChatPersona.modelSettings.name || currentChatPersona.model || model || DEFAULT_MODEL;
  const currentProviderOption = modelOptions.find((option) => option.id === currentProvider) || modelOptions[0];
  const currentModelChoices = Array.from(new Set([...(currentProviderOption?.models || []), currentModel].filter(Boolean)));
  const draftProviderOption = modelOptions.find((option) => option.id === draftPersona.modelSettings.provider) || modelOptions[0];
  const draftModelChoices = Array.from(new Set([...(draftProviderOption?.models || []), draftPersona.modelSettings.name].filter(Boolean)));
  const developmentProviderOptions = modelOptions.filter((option) => DEVELOPMENT_PROVIDER_IDS.includes(option.id));
  const developmentProviders = developmentProviderOptions.length ? developmentProviderOptions : modelOptions;
  const devProviderOption = developmentProviders.find((option) => option.id === devProvider) || developmentProviders[0];
  const devModelChoices = Array.from(new Set([...(devProviderOption?.models || []), devModel].filter(Boolean)));
  const chatgptCodexOption = modelOptions.find((option) => option.id === "chatgpt_codex");
  const readyFilePaths = attachments
    .filter((attachment) => attachment.status === "ready" && attachment.path)
    .map((attachment) => String(attachment.path));

  const slashQuery = useMemo(() => {
    if (!prompt.startsWith("/")) {
      return "";
    }
    return prompt.slice(1).split(/\s+/)[0].toLowerCase();
  }, [prompt]);

  const filteredSlashOptions = useMemo(() => {
    if (!slashQuery && !prompt.startsWith("/")) {
      return slashOptions;
    }
    return slashOptions.filter((option) => {
      const haystack = `${option.command} ${option.title} ${option.description} ${option.agent || ""}`.toLowerCase();
      return haystack.includes(slashQuery);
    });
  }, [prompt, slashOptions, slashQuery]);

  const slashVisible = (slashOpen || prompt.startsWith("/")) && filteredSlashOptions.length > 0;
  const personaMeetingMembers = meetingMembers.filter((member) => member.source === "persona");
  const agentMeetingMembers = meetingMembers.filter((member) => member.source === "agent");
  const selectedPersonaMembers = personaMeetingMembers.filter((member) => member.selected);
  const selectedAgentMembers = agentMeetingMembers.filter((member) => member.selected);
  const activeSpeakerMembers = activeMeeting?.participants.length
    ? activeMeeting.participants.map((record) => memberFromPersona(record, true))
    : selectedPersonaMembers;
  const activeSpeakerIds = chairLedSpeakerTimeline(activeSpeakerMembers, activeMeeting?.meetingType || meetingType);
  const activeSpeakerKey = activeSpeakerIds.join("|");
  const draftPersonaAvatarSrc = draftPersona.avatar.previewUrl || uploadUrl(draftPersona.avatar.path, draftPersona.avatar.filename);
  const builderTitle =
    builderMode === "create"
      ? "Create persona"
      : builderMode === "edit"
        ? `Edit ${draftPersona.name || "persona"}`
        : "Persona builder";

  useEffect(() => {
    if (!meetingRunning) return;
    const ids = activeSpeakerKey.split("|").filter(Boolean);
    if (!ids.length) return;
    let position = 0;
    setThinkingPersonaId(ids[position]);
    const timer = window.setInterval(() => {
      position = (position + 1) % ids.length;
      setThinkingPersonaId(ids[position] || ids[0]);
    }, 2600);
    return () => window.clearInterval(timer);
  }, [activeSpeakerKey, meetingRunning]);

  useEffect(() => {
    personasCountRef.current = Object.keys(personasById).length;
  }, [personasById]);

  useEffect(() => {
    let cancelled = false;

    async function refreshBackendStatus() {
      try {
        const payload = await fetchJson<Record<string, unknown>>("/api/cockpit/config");
        if (!cancelled) {
          const status = String(payload.status || "online");
          setBackendState({ status: "online", label: status });
          if (personasCountRef.current === 0) {
            void loadPersonas().catch(() => undefined);
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "offline";
          setBackendState({ status: "offline", label: message || "offline" });
        }
      }
    }

    void refreshBackendStatus();
    const backendTimer = window.setInterval(() => {
      void refreshBackendStatus();
    }, 7000);

    fetchJson<unknown>("/api/ouroboros-chat/slash-menu")
      .then((payload) => {
        if (!cancelled) {
          setSlashOptions(normalizeSlashMenu(payload));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSlashOptions(FALLBACK_SLASH_OPTIONS);
        }
      });

    fetchJson<ModelOptionsResponse>("/api/ouroboros-chat/model-options")
      .then((payload) => {
        if (!cancelled) {
          const providers = Array.isArray(payload.providers) && payload.providers.length ? payload.providers : FALLBACK_MODEL_OPTIONS;
          setModelOptions(providers);
          setBraveConfigured(Boolean(payload.brave?.configured));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setModelOptions(FALLBACK_MODEL_OPTIONS);
          setBraveConfigured(false);
        }
      });

    loadSavedMeetings().catch(() => undefined);
    loadPersonas().catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearInterval(backendTimer);
    };
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeThreadId, isSending]);

  useEffect(() => {
    if (viewMode !== "meeting") return;
    const node = meetingTranscriptEndRef.current;
    if (!node) return;
    node.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeMeeting?.rounds.length, activeMeeting?.summary, viewMode]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery, slashOptions.length]);

  useEffect(() => {
    if (draftPersona.id && builderMode === "edit") {
      loadMemory(draftPersona.id).catch(() => setMemoryItems([]));
    } else {
      setMemoryItems([]);
    }
  }, [builderMode, draftPersona.id]);

  function mergeMeetingPersonas(personaRecords: StoredPersona[], selectedPersonaId?: string) {
    setMeetingMembers((previous) => {
      const previousSelected = new Map(previous.map((member) => [member.id, member.selected]));
      const personaMembers = personaRecords
        .filter((record) => !record.archived)
        .map((record) => memberFromPersona(record, previousSelected.get(record.id) ?? (record.id === selectedPersonaId || DEFAULT_PERSONA_ORDER.includes(record.id))));
      const agentMembers = INITIAL_MEMBERS.map((member) => ({
        ...member,
        selected: previousSelected.get(member.id) ?? member.selected,
      }));
      return [...personaMembers, ...agentMembers];
    });
  }

  function activateChatPersona(nextPersona: Persona) {
    // setActivePersona is removed. A thread handles its own persona.
    setProvider(nextPersona.modelSettings.provider || DEFAULT_PROVIDER);
    setModel(nextPersona.modelSettings.name || nextPersona.model || DEFAULT_MODEL);
  }

  function mergeThreads(nextThreads: ChatThread[], options: { focusId?: string } = {}) {
    setThreadsById((prev) => {
      const next = { ...prev };
      nextThreads.forEach(t => next[t.id] = { ...next[t.id], ...t });
      return next;
    });
    setThreadIds((prev) => {
      const set = new Set([...nextThreads.map(t => t.id), ...prev]);
      return Array.from(set).sort((a, b) => {
        // Sorting logic could go here, but for now we just keep them unique.
        return 0;
      });
    });
    if (options.focusId) {
      setActiveThreadId(options.focusId);
    }
  }

  async function loadPersonas() {
    const payload = await fetchJson<{ personas?: StoredPersona[] }>("/api/ouroboros-chat/personas");
    const records = (payload.personas || []).filter((record) => record.id && !record.archived);

    setPersonasById((prev) => {
      const next = { ...prev };
      records.forEach(r => next[r.id] = r);
      return next;
    });
    mergeMeetingPersonas(records);
  }

  async function loadMemory(personaId: string) {
    const payload = await fetchJson<{ memory?: MemoryItem[] }>(`/api/ouroboros-chat/memory?persona_id=${encodeURIComponent(personaId)}`);
    setMemoryItems(payload.memory || []);
  }

  async function loadSavedMeetings() {
    const payload = await fetchJson<{ meetings?: SavedMeetingRecord[] }>("/api/ouroboros-chat/meetings");
    setSavedMeetings(payload.meetings || []);
  }

  async function openSavedMeeting(meetingId: string) {
    const payload = await fetchJson<Record<string, unknown>>(`/api/ouroboros-chat/meetings/${encodeURIComponent(meetingId)}`);
    const events = Array.isArray(payload.events) ? payload.events : [];
    const record = asRecord(payload.record) || {};
    const rawParticipants = Array.isArray(payload.participants)
      ? payload.participants
      : Array.isArray(record.participants)
        ? record.participants
        : [];
    const eventParticipants = events
      .map((event) => meetingParticipantFromEvent(asRecord(event) || {}))
      .filter((item) => item.id || item.name);
    const participantRecords = (rawParticipants.length ? rawParticipants : eventParticipants)
      .map((item) => asRecord(item))
      .filter((item): item is Record<string, unknown> => Boolean(item))
      .map((item): StoredPersona => ({
        id: String(item.id || slugId(String(item.name || "persona"))),
        name: String(item.name || item.id || "Persona"),
        role: String(item.role || ""),
        tone: String(item.tone || ""),
        rules: Array.isArray(item.rules) ? item.rules.map(String) : [],
        system_prompt: String(item.system_prompt || ""),
      }));
    const rounds = meetingRoundsFromEvents(events, participantRecords);
    const fallbackRounds = Array.isArray(payload.rounds)
      ? meetingRoundsFromEvents(payload.rounds, participantRecords)
      : [];
    const summary = meetingSummaryFromPayload(payload, events) || String(record.summary || "");
    const startedEvent = events.map((event) => asRecord(event)).find((event) => event?.type === "meeting_started");
    const topic = String(record.topic || startedEvent?.topic || "Saved meeting");
    const savedType = asMeetingType(String(record.meeting_type || startedEvent?.meeting_type || "team"));
    const id = uid("meeting");
    setMeetingsById((prev) => ({
      ...prev,
      [id]: {
        id,
        backendMeetingId: meetingId,
        topic,
        meetingType: savedType,
        participants: participantRecords,
        personaIds: participantRecords.map((item) => item.id),
        agentIds: Array.isArray(record.agent_ids) ? record.agent_ids.map(String) : [],
        rounds: rounds.length ? rounds : fallbackRounds,
        summary,
        transcript: String(record.transcript || meetingTranscriptFromRounds(rounds.length ? rounds : fallbackRounds, summary)),
        status: "completed",
        updatedAt: String(record.updated_at || nowIso()),
        saved: true,
      },
    }));
    setActiveMeetingId(id);
    setMeetingTopic(topic);
    setMeetingType(savedType);
    setViewMode("meeting");
  }

  function applyPersonaSelection(record: StoredPersona): Persona {
    const nextPersona = personaFromStored(record);
    activateChatPersona(nextPersona);
    setPersonaNotice("");
    return nextPersona;
  }

  async function loadPersonaConversations(personaId: string, personaName?: string, personaIntro = "") {
    const safeName = personaName || currentChatPersona.name;
    const payload = await fetchJson<{ conversations?: BackendConversation[] }>(`/api/ouroboros-chat/conversations?persona_id=${encodeURIComponent(personaId)}`);
    const conversations = payload.conversations || [];
    const conversationPersona = personaForId(personaId);
    if (!conversations.length) {
      const existingThread = Object.values(threadsById).find((thread) => thread.personaId === personaId);
      if (existingThread) {
        setActiveThreadId(existingThread.id);
        activateChatPersona(conversationPersona);
        setThreadsById((prev) => {
          const thread = prev[existingThread.id];
          if (!thread) return prev;
          return {
            ...prev,
            [existingThread.id]: {
              ...thread,
              messages: thread.messages.length ? thread.messages : [makeWelcomeMessage(safeName, personaIntro)]
            }
          };
        });
        return;
      }
      const id = uid("thread");
      mergeThreads(
        [
          {
            id,
            type: "persona",
            personaId,
            personaName: safeName,
            provider: conversationPersona.modelSettings.provider,
            modelName: conversationPersona.modelSettings.name,
            title: "New thread",
            subtitle: `${safeName} / ${conversationPersona.modelSettings.name || DEFAULT_MODEL}`,
            updatedAt: nowIso(),
            messages: [makeWelcomeMessage(safeName, personaIntro)]
          },
        ],
        { focusId: id },
      );
      return;
    }

    // Check if these conversations actually have the type mapped.
    const mapped = conversations.map((conversation): ChatThread => ({
      id: conversation.id,
      type: conversation.persona_id ? "persona" : "neutral",
      personaId: conversation.persona_id,
      personaName: safeName,
      provider: conversationPersona.modelSettings.provider,
      modelName: conversationPersona.modelSettings.name,
      title: conversation.title || "Thread",
      subtitle: `${safeName} / ${conversationPersona.modelSettings.name || DEFAULT_MODEL}`,
      updatedAt: conversation.updated_at || nowIso(),
      messages: [] // Will fetch on open
    }));
    mergeThreads(mapped, { focusId: mapped[0].id });
    await openConversation(mapped[0].id);
  }

  async function openConversation(conversationId: string) {
    setActiveThreadId(conversationId);
    try {
      const payload = await fetchJson<{ conversation?: BackendConversation }>(`/api/ouroboros-chat/conversations/${encodeURIComponent(conversationId)}`);
      const conversation = payload.conversation;
      const fallbackThread = threadsById[conversationId];
      const personaId = conversation?.persona_id || fallbackThread?.personaId;
      const threadPersona = personaId ? personaForId(personaId) : neutralChatPersona();

      activateChatPersona(threadPersona);
      const messages: ChatMessage[] = (payload.conversation?.messages || []).map((message) => ({
        id: message.id || uid("message"),
        role: message.role === "user" ? "user" : "assistant",
        content: message.content || "",
        createdAt: message.createdAt || message.created_at || nowIso(),
        status: "ready",
      }));

      mergeThreads([
        {
          id: conversationId,
          type: personaId ? "persona" : "neutral",
          personaId,
          personaName: threadPersona.name,
          provider: threadPersona.modelSettings.provider,
          modelName: threadPersona.modelSettings.name,
          title: conversation?.title || fallbackThread?.title || "New thread",
          subtitle: `${threadPersona.name} / ${threadPersona.modelSettings.name || DEFAULT_MODEL}`,
          updatedAt: conversation?.updated_at || fallbackThread?.updatedAt || nowIso(),
          messages: messages.length ? messages : fallbackThread?.messages || [makeWelcomeMessage(threadPersona.name, threadPersona.introduction)],
        },
      ]);
    } catch {
      const fallbackThread = threadsById[conversationId];
      const threadPersona = personaForThread(fallbackThread);
      activateChatPersona(threadPersona);
      // Let it remain what it was
    }
  }

  async function addMemory() {
    if (!draftPersona.id || !memoryDraft.trim()) return;
    const payload = await fetchJson<{ memory: MemoryItem }>("/api/ouroboros-chat/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona_id: draftPersona.id,
        scope: "persona",
        content: memoryDraft.trim(),
        importance: 3,
        tags: ["manual"],
      }),
    });
    setMemoryItems((previous) => [payload.memory, ...previous]);
    setMemoryDraft("");
  }

  async function deleteMemory(memoryId: string) {
    await fetchJson(`/api/ouroboros-chat/memory/${encodeURIComponent(memoryId)}`, { method: "DELETE" });
    setMemoryItems((previous) => previous.filter((item) => item.id !== memoryId));
  }

  function updateCurrentMessages(updater: (current: ChatMessage[]) => ChatMessage[]) {
    setThreadsById((prev) => {
      const thread = prev[activeThreadId];
      if (!thread) return prev;
      return {
        ...prev,
        [activeThreadId]: {
          ...thread,
          messages: updater(thread.messages)
        }
      };
    });
  }

  function startNewThread() {
    const neutral = neutralChatPersona();
    const id = uid("thread");
    const thread: ChatThread = {
      id,
      type: "neutral",
      personaId: undefined,
      personaName: neutral.name,
      provider: DEFAULT_PROVIDER,
      modelName: DEFAULT_MODEL,
      title: "New thread",
      subtitle: `${neutral.name} / ${DEFAULT_MODEL}`,
      updatedAt: nowIso(),
      messages: [makeWelcomeMessage(neutral.name, neutral.introduction)]
    };

    setThreadsById(prev => ({ ...prev, [id]: thread }));
    setThreadIds(prev => [id, ...prev]);
    setActiveThreadId(id);

    activateChatPersona(neutral);
    setProvider(DEFAULT_PROVIDER);
    setModel(DEFAULT_MODEL);
    setPrompt("");
    setAttachments([]);
    setSlashOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function updateThreadAfterSend(threadId: string, text: string) {
    setThreadsById(prev => {
      const thread = prev[threadId];
      if (!thread) return prev;
      const shortTitle = text.trim().replace(/\s+/g, " ").slice(0, 42);
      return {
        ...prev,
        [threadId]: {
          ...thread,
          title: thread.title === "New thread" || thread.title === "Local Ouroboros" ? shortTitle || thread.title : thread.title,
          personaId: currentChatPersona.id || thread.personaId,
          personaName: currentChatPersona.name,
          provider: currentProvider,
          modelName: currentModel,
          subtitle: `${currentChatPersona.name} / ${currentModel}`,
          updatedAt: nowIso(),
        }
      };
    });
  }

  function updateCurrentThreadSettings(next: { provider?: string; modelName?: string }) {
    setThreadsById(prev => {
      const thread = prev[activeThreadId];
      if (!thread) return prev;
      return {
        ...prev,
        [activeThreadId]: {
          ...thread,
          provider: next.provider ?? thread.provider,
          modelName: next.modelName ?? thread.modelName,
          subtitle: `${thread.personaName || currentChatPersona.name} / ${next.modelName ?? thread.modelName ?? currentModel}`,
        }
      };
    });
  }

  async function handleFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }

    const entries = files.map((file) => ({
      file,
      attachment: {
        id: uid("file"),
        name: file.name,
        size: file.size,
        kind: classifyFile(file),
        status: "uploading" as AttachmentStatus,
      },
    }));

    setAttachments((previous) => [...previous, ...entries.map((entry) => entry.attachment)]);

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));

    try {
      const result = await fetchJson<UploadResponse>("/api/ouroboros-chat/upload", {
        method: "POST",
        body: formData,
      });
      const uploaded = Array.isArray(result.files) ? result.files : [];

      setAttachments((previous) =>
        previous.map((attachment) => {
          const index = entries.findIndex((entry) => entry.attachment.id === attachment.id);
          if (index < 0) {
            return attachment;
          }
          const serverFile = uploaded[index];
          if (!serverFile || serverFile.status !== "ok" || !serverFile.path) {
            return {
              ...attachment,
              status: "error",
              error: serverFile?.error || serverFile?.reason || "Upload failed",
            };
          }
          return {
            ...attachment,
            status: "ready",
            path: serverFile.path,
            size: typeof serverFile.size === "number" ? serverFile.size : attachment.size,
          };
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setAttachments((previous) =>
        previous.map((attachment) =>
          entries.some((entry) => entry.attachment.id === attachment.id)
            ? { ...attachment, status: "error", error: message }
            : attachment,
        ),
      );
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function removeAttachment(id: string) {
    setAttachments((previous) => previous.filter((attachment) => attachment.id !== id));
  }

  async function uploadPersonaAvatar(fileList: FileList | null) {
    const file = Array.from(fileList || [])[0];
    if (!file) return;
    setPersonaNotice("Avatar uploaden...");
    const formData = new FormData();
    formData.append("files", file);
    try {
      const result = await fetchJson<UploadResponse>("/api/ouroboros-chat/upload", {
        method: "POST",
        body: formData,
      });
      const serverFile = result.files?.[0];
      if (!serverFile || serverFile.status !== "ok" || !serverFile.path) {
        throw new Error(serverFile?.reason || serverFile?.error || "Avatar upload failed");
      }
      const previewUrl = URL.createObjectURL(file);
      setDraftPersona((current) => ({
        ...current,
        avatar: {
          kind: "image",
          color: current.avatar.color,
          path: serverFile.path,
          filename: serverFile.filename || file.name,
          previewUrl,
        },
      }));
      setPersonaNotice("Avatar toegevoegd.");
    } catch (error) {
      setPersonaNotice(error instanceof Error ? error.message : "Avatar upload failed");
    } finally {
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function uploadPersonaKnowledge(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setPersonaNotice("Kennisbestanden uploaden...");
    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    try {
      const result = await fetchJson<UploadResponse>("/api/ouroboros-chat/upload", {
        method: "POST",
        body: formData,
      });
      const uploaded = (result.files || [])
        .filter((file) => file.status === "ok" && file.path)
        .map((file): PersonaKnowledgeFile => ({
          path: String(file.path),
          label: file.filename || String(file.path).split("/").pop() || "knowledge file",
          filename: file.filename,
          size: file.size,
          kind: file.kind,
        }));
      if (!uploaded.length) {
        const reason = result.files?.find((file) => file.reason || file.error);
        throw new Error(reason?.reason || reason?.error || "Geen kennisbestand opgeslagen.");
      }
      setDraftPersona((current) => ({
        ...current,
        knowledgeFiles: [...current.knowledgeFiles, ...uploaded],
      }));
      setPersonaNotice(`${uploaded.length} kennisbestand(en) toegevoegd.`);
    } catch (error) {
      setPersonaNotice(error instanceof Error ? error.message : "Kennisupload mislukt.");
    } finally {
      if (knowledgeInputRef.current) knowledgeInputRef.current.value = "";
    }
  }

  function removePersonaKnowledge(path: string) {
    setDraftPersona((current) => ({
      ...current,
      knowledgeFiles: current.knowledgeFiles.filter((file) => file.path !== path),
    }));
  }

  function addPersonaKnowledgeLink() {
    const raw = knowledgeLinkDraft.trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    let label = url;
    try {
      label = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      label = raw;
    }
    setDraftPersona((current) => ({
      ...current,
      knowledgeSources: [...current.knowledgeSources, { url, label }],
    }));
    setKnowledgeLinkDraft("");
    setPersonaNotice("Kennislink toegevoegd.");
  }

  function removePersonaKnowledgeLink(url: string) {
    setDraftPersona((current) => ({
      ...current,
      knowledgeSources: current.knowledgeSources.filter((source) => source.url !== url),
    }));
  }

  async function savePersona({ asNew = false }: { asNew?: boolean } = {}) {
    if (!draftPersona.name.trim() || personaSaving) return;
    setPersonaSaving(true);
    setPersonaNotice(asNew ? "Nieuwe persona opslaan..." : "Persona opslaan...");
    try {
      const shouldCreate = asNew || builderMode === "create" || !draftPersona.id;
      const nextId = shouldCreate ? `${slugId(draftPersona.name)}-${Date.now().toString(36)}` : draftPersona.id;
      const payload = await fetchJson<{ persona: StoredPersona }>("/api/ouroboros-chat/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: nextId,
          name: draftPersona.name,
          description: draftPersona.description,
          role: draftPersona.role,
          introduction: draftPersona.introduction,
          instructions: draftPersona.systemPrompt,
          system_prompt: draftPersona.systemPrompt,
          tone: draftPersona.tone,
          language: draftPersona.language,
          rules: draftPersona.rules,
          tools: draftPersona.tools,
          memory: { enabled: draftPersona.memoryEnabled, scope: "persona" },
          model: draftPersona.modelSettings.name || draftPersona.model || model || DEFAULT_MODEL,
          model_settings: draftPersona.modelSettings,
          avatar: draftPersona.avatar,
          knowledge_files: draftPersona.knowledgeFiles,
          knowledge_sources: draftPersona.knowledgeSources,
          capabilities: Object.entries(draftPersona.tools).filter(([, enabled]) => enabled).map(([key]) => key),
          tags: ["custom"],
        }),
      });
      const saved = payload.persona;
      const savedPersona = personaFromStored(saved);
      setDraftPersona(savedPersona);
      setBuilderMode("edit");

      // Update personasById
      setPersonasById((prev) => {
        const next = { ...prev, [saved.id]: saved };
        mergeMeetingPersonas(Object.values(next), saved.id);
        return next;
      });

      setPersonaNotice(shouldCreate ? "Nieuwe persona gemaakt en links toegevoegd." : "Persona opgeslagen.");
    } catch (error) {
      setPersonaNotice(error instanceof Error ? error.message : "Persona opslaan mislukt.");
    } finally {
      setPersonaSaving(false);
    }
  }

  function newPersonaDraft() {
    const draftNumber = Math.max(1, Object.keys(personasById).length + 1);
    setDraftPersona({
      ...defaultPersona(),
      id: undefined,
      name: `Nieuwe persona ${draftNumber}`,
      description: "",
      role: "",
      introduction: "",
      tone: "Grounded, practical, inspectable",
      language: "nl",
      rules: [],
      memoryEnabled: true,
      systemPrompt: "",
      model: model || DEFAULT_MODEL,
      modelSettings: {
        provider,
        name: model || DEFAULT_MODEL,
        temperature: 0.7,
        max_tokens: 2000,
        fallback_model: DEFAULT_MODEL,
      },
      tools: { ...DEFAULT_TOOLS },
      avatar: { kind: "initials", color: "#f2c97d" },
      knowledgeFiles: [],
      knowledgeSources: [],
    });
    setBuilderMode("create");
    setPersonaNotice("");
    activateRail("persona_builder");
  }

  function editStoredPersona(record: StoredPersona) {
    const nextPersona = personaFromStored(record);
    setDraftPersona(nextPersona);
    setBuilderMode("edit");
    setViewMode("persona_builder");
  }

  function chatWithPersona(record: StoredPersona) {
    const nextPersona = applyPersonaSelection(record);
    setViewMode("chat");
    void loadPersonaConversations(record.id, record.name, nextPersona.introduction);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function seatPersonaAtMeeting(record: StoredPersona) {
    mergeMeetingPersonas(savedPersonas, record.id);
    openMeetingTable(record.id);
    window.setTimeout(() => meetingTopicRef.current?.focus(), 0);
  }

  function useDraftInChat() {
    if (!draftPersona.id) return;
    const record = personasById[draftPersona.id];
    if (record) {
      chatWithPersona(record);
      return;
    }
    activateChatPersona(draftPersona);
    setViewMode("chat");
    void loadPersonaConversations(draftPersona.id, draftPersona.name, draftPersona.introduction);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function openMeetingTable(selectedPersonaId?: string) {
    if (selectedPersonaId) {
      mergeMeetingPersonas(savedPersonas, selectedPersonaId);
    }
    if (!activeMeetingId) {
      const newId = uid("meeting");
      setMeetingsById(prev => ({
        ...prev,
        [newId]: {
          id: newId,
          topic: "Review this thread and propose next actions.",
          meetingType,
          participants: [],
          personaIds: [],
          agentIds: [],
          rounds: [],
          summary: "",
          status: "draft",
          updatedAt: nowIso(),
        }
      }));
      setActiveMeetingId(newId);
    }
    setViewMode("meeting");
    window.setTimeout(() => meetingTopicRef.current?.focus(), 0);
  }

  async function duplicatePersona() {
    if (!draftPersona.id) return;
    const payload = await fetchJson<{ persona: StoredPersona }>(`/api/ouroboros-chat/personas/${encodeURIComponent(draftPersona.id)}/duplicate`, {
      method: "POST",
    });
    const next = payload.persona;
    setPersonasById(prev => {
      const p = { ...prev, [next.id]: next };
      mergeMeetingPersonas(Object.values(p), next.id);
      return p;
    });
    const nextPersona = personaFromStored(next);
    setDraftPersona(nextPersona);
    setBuilderMode("edit");
    setPersonaNotice("Persona gedupliceerd.");
  }

  async function deletePersona() {
    if (!draftPersona.id || draftPersona.id === "ouroboros") return;
    await fetchJson(`/api/ouroboros-chat/personas/${encodeURIComponent(draftPersona.id)}`, { method: "DELETE" });
    setPersonasById(prev => {
      const p = { ...prev };
      delete p[draftPersona.id!];
      mergeMeetingPersonas(Object.values(p));
      return p;
    });
    setDraftPersona(defaultPersona());
    setBuilderMode("create");
    setPersonaNotice("Persona gearchiveerd.");
  }

  async function exportPersona() {
    if (!draftPersona.id) return;
    const payload = await fetchJson<{ persona: StoredPersona }>(`/api/ouroboros-chat/personas/${encodeURIComponent(draftPersona.id)}/export`);
    const blob = new Blob([JSON.stringify(payload.persona, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${draftPersona.id}.persona.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importPersona(fileList: FileList | null) {
    const file = Array.from(fileList || [])[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text()) as StoredPersona;
      const payload = await fetchJson<{ persona: StoredPersona }>("/api/ouroboros-chat/personas/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(imported),
      });
      const next = payload.persona;
      setPersonasById(prev => {
        const p = { ...prev, [next.id]: next };
        mergeMeetingPersonas(Object.values(p), next.id);
        return p;
      });
      const importedPersona = personaFromStored(payload.persona);
      setDraftPersona(importedPersona);
      setBuilderMode("edit");
      setPersonaNotice("Persona geimporteerd.");
    } catch (error) {
      setPersonaNotice(error instanceof Error ? error.message : "Import mislukt.");
    } finally {
      if (importPersonaRef.current) importPersonaRef.current.value = "";
    }
  }

  function setTool(toolId: string, enabled: boolean) {
    setDraftPersona((current) => ({ ...current, tools: { ...current.tools, [toolId]: enabled } }));
  }

  function selectSlashOption(option: SlashOption) {
    setPrompt(`${option.command} `);
    setSlashOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape" && slashVisible) {
      event.preventDefault();
      setSlashOpen(false);
      return;
    }

    if (slashVisible && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setSlashIndex((previous) => {
        const offset = event.key === "ArrowDown" ? 1 : -1;
        const count = filteredSlashOptions.length;
        return (previous + offset + count) % count;
      });
      return;
    }

    if (slashVisible && event.key === "Enter" && !event.shiftKey && prompt.trim().split(/\s+/).length <= 1) {
      event.preventDefault();
      selectSlashOption(filteredSlashOptions[slashIndex] || filteredSlashOptions[0]);
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  async function sendMessage() {
    const text = prompt.trim();
    if ((!text && !readyFilePaths.length) || isSending) {
      return;
    }

    const threadId = activeThreadId;
    const outgoingAttachments = attachments.filter((attachment) => attachment.status === "ready");
    const userMessage: ChatMessage = {
      id: uid("user"),
      role: "user",
      content: text || "Attached files",
      createdAt: nowIso(),
      attachments: outgoingAttachments,
      status: "ready",
    };
    const assistantId = uid("assistant");
    const pendingMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: nowIso(),
      status: "pending",
      meta: {
        provider: currentProvider,
        model: currentModel,
        route: "pending",
      },
    };
    const history = messages
      .filter((message) => message.status !== "pending" && message.id !== "assistant-welcome")
      .map((message) => ({ role: message.role, content: message.content }));

    setPrompt("");
    setSlashOpen(false);
    setAttachments([]);
    setIsSending(true);
    updateThreadAfterSend(threadId, text);

    setThreadsById((prev) => {
      const thread = prev[threadId];
      if (!thread) return prev;
      return {
        ...prev,
        [threadId]: {
          ...thread,
          messages: [...thread.messages, userMessage, pendingMessage]
        }
      };
    });

    try {
      const chatEndpoint = text.startsWith("/") ? "/api/cockpit/chat" : "/api/ouroboros-chat/chat";
      const payload = await fetchJson<unknown>(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: currentProvider,
          model: currentModel,
          prompt: text,
          persona_id: currentChatPersona.id || currentThread?.personaId || undefined,
          conversation_id: threadId,
          history,
          files: readyFilePaths.length ? readyFilePaths : undefined,
          system_prompt: currentChatPersona.id ? undefined : composeSystemPrompt(currentChatPersona),
          role: currentChatPersona.name,
          include_tools: text.startsWith("/"),
        }),
      });

      const responseText = extractResponseText(payload);
      const responseMeta = extractMeta(payload) || { provider: currentProvider, model: currentModel };

      setThreadsById((prev) => {
        const thread = prev[threadId];
        if (!thread) return prev;
        return {
          ...prev,
          [threadId]: {
            ...thread,
            messages: thread.messages.map((message) =>
              message.id === assistantId ? { ...message, content: responseText, status: "ready", meta: responseMeta } : message
            )
          }
        };
      });
    } catch (error) {
      const message = friendlyErrorMessage(error);
      setThreadsById((prev) => {
        const thread = prev[threadId];
        if (!thread) return prev;
        return {
          ...prev,
          [threadId]: {
            ...thread,
            messages: thread.messages.map((item) =>
              item.id === assistantId ? { ...item, content: message, status: "error", meta: { provider: currentProvider, model: currentModel, route: "error" } } : item
            )
          }
        };
      });
    } finally {
      setIsSending(false);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    }
  }

  function insertMeetingPrompt() {
    const handles = selectedAgentMembers.map((member) => member.handle).join(", ");
    const personaNames = selectedPersonaMembers.map((member) => member.name).join(", ");
    const topic = activeMeeting?.topic || meetingTopic.trim() || "Review this thread and propose next actions.";
    const summary = activeMeeting?.summary || activeMeeting?.transcript || "Er is nog geen consensus-samenvatting.";
    setPrompt(`/agents ${topic}\n\nPersona meeting: ${formatMeetingType(activeMeeting?.meetingType || meetingType)} met ${personaNames || "geen persona's geselecteerd"}.\nFollow-up agents: ${handles || "none"}.\n\nConsensus summary:\n${summary}`);
    setViewMode("chat");
    setSlashOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function startPersonaMeeting() {
    const topic = meetingTopic.trim() || "Review this thread and propose next actions.";
    const selectedParticipants = selectedPersonaMembers.map((member) => member.id);
    const participants =
      personasById["de-voorzitter"] && !selectedParticipants.includes("de-voorzitter")
        ? ["de-voorzitter", ...selectedParticipants]
        : selectedParticipants;
    if (!participants.length || meetingRunning) return;
    const selectedParticipantRecords = participants
      .map((id) => personasById[id])
      .filter((record): record is StoredPersona => Boolean(record));
    setMeetingRunning(true);
    setThinkingPersonaId(participants[0] || null);
    setViewMode("meeting");

    let meetingId = activeMeetingId;
    if (!meetingId) {
      meetingId = uid("meeting");
      setActiveMeetingId(meetingId);
    }

    setMeetingsById((prev) => ({
      ...prev,
      [meetingId as string]: {
        id: meetingId as string,
        topic,
        meetingType,
        participants: selectedParticipantRecords,
        personaIds: participants,
        agentIds: selectedAgentMembers.map((m) => m.id),
        rounds: [],
        summary: "",
        status: "running",
        updatedAt: nowIso(),
        transcript: "Meeting started... Waiting for responses...\n"
      }
    }));

    const finalizeFromResult = (result: Record<string, unknown>) => {
      const events = Array.isArray(result.events) ? result.events : [];
      const rounds = meetingRoundsFromEvents(events, selectedParticipantRecords);
      const summary = meetingSummaryFromPayload(result, events);
      const agentFollowUp = selectedAgentMembers.length
        ? `\n\nFollow-up agents selected for tasks after the meeting: ${selectedAgentMembers.map((member) => member.handle).join(", ")}. Use the Agent task button to prepare an approval-gated task prompt.`
        : "";
      const content = `${meetingTranscriptFromRounds(rounds, summary) || extractResponseText(result)}${agentFollowUp}`;
      setMeetingsById((prev) => ({
        ...prev,
        [meetingId as string]: {
          ...prev[meetingId as string],
          backendMeetingId: typeof result.meeting_id === "string" ? result.meeting_id : prev[meetingId as string]?.backendMeetingId,
          meetingType: asMeetingType(String(result.meeting_type || meetingType)),
          status: "completed",
          rounds,
          summary,
          transcript: content,
          updatedAt: nowIso(),
          saved: true,
        }
      }));
    };

    const recordError = (message: string) => {
      setMeetingsById((prev) => ({
        ...prev,
        [meetingId as string]: {
          ...prev[meetingId as string],
          status: "error",
          error: message,
          transcript: `Error: ${message}`,
          updatedAt: nowIso(),
        }
      }));
    };

    try {
      const streamed = await streamPersonaMeeting({
        topic,
        participants,
        meetingType,
        participantRecords: selectedParticipantRecords,
        meetingId: meetingId as string,
        setThinkingPersonaId,
        setMeetingsById,
      });
      if (streamed && streamed.finalResult) {
        finalizeFromResult(streamed.finalResult);
      } else if (!streamed) {
        // Streaming not available — fall back to the legacy synchronous endpoint.
        const result = await fetchJson<Record<string, unknown>>("/api/ouroboros-chat/meetings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            meeting_type: meetingType,
            participants,
            model: model || DEFAULT_MODEL,
            provider: DEFAULT_PROVIDER,
            tools: [],
            allow_tools: false,
          }),
        });
        finalizeFromResult(result);
      } else {
        // Stream ended without a `meeting_recorded` envelope — close out with what we have.
        setMeetingsById((prev) => {
          const existing = prev[meetingId as string];
          if (!existing) return prev;
          return {
            ...prev,
            [meetingId as string]: {
              ...existing,
              status: "completed",
              updatedAt: nowIso(),
            },
          };
        });
      }
      void loadSavedMeetings();
    } catch (error) {
      recordError(friendlyErrorMessage(error));
    } finally {
      setMeetingRunning(false);
      setThinkingPersonaId(null);
    }
  }

  async function streamPersonaMeeting(params: {
    topic: string;
    participants: string[];
    meetingType: MeetingType;
    participantRecords: StoredPersona[];
    meetingId: string;
    setThinkingPersonaId: (id: string | null) => void;
    setMeetingsById: Dispatch<SetStateAction<Record<string, Meeting>>>;
  }): Promise<{ finalResult: Record<string, unknown> | null } | null> {
    const { topic, participants, meetingType: mt, participantRecords, meetingId, setThinkingPersonaId: setThinking, setMeetingsById: setMeetings } = params;
    let response: Response;
    try {
      response = await fetch(apiUrl("/api/ouroboros-chat/meetings/stream"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          topic,
          meeting_type: mt,
          participants,
          model: model || DEFAULT_MODEL,
          provider: DEFAULT_PROVIDER,
          tools: [],
          allow_tools: false,
        }),
      });
    } catch {
      return null;
    }
    if (!response.ok || !response.body) {
      // Backend probably doesn't expose the streaming endpoint — caller should fall back.
      return response.status === 404 ? null : (() => { throw new Error(`Streaming meeting failed: HTTP ${response.status}`); })();
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const eventsSoFar: Record<string, unknown>[] = [];
    let finalResult: Record<string, unknown> | null = null;

    const handleEvent = (eventName: string, payload: Record<string, unknown>) => {
      const type = String(payload.type || eventName || "");
      if (type === "meeting_recorded") {
        // The recorded envelope carries the full final result (events + summary + record path).
        finalResult = payload;
        setThinking(null);
        return;
      }
      if (type === "meeting_error") {
        throw new Error(String(payload.error || "Streaming meeting failed."));
      }
      eventsSoFar.push(payload);
      const rounds = meetingRoundsFromEvents(eventsSoFar, participantRecords);
      const summary = meetingSummaryFromPayload({}, eventsSoFar);
      setMeetings((prev) => {
        const existing = prev[meetingId];
        if (!existing) return prev;
        return {
          ...prev,
          [meetingId]: {
            ...existing,
            backendMeetingId:
              typeof payload.meeting_id === "string" ? String(payload.meeting_id) : existing.backendMeetingId,
            rounds,
            summary,
            updatedAt: nowIso(),
          },
        };
      });

      if (type === "participant_turn") {
        const participantId =
          (payload.participant && typeof (payload.participant as Record<string, unknown>).id === "string"
            ? String((payload.participant as Record<string, unknown>).id)
            : "") || "";
        const phase = String(payload.phase || "");
        const promptContext = (payload.prompt_context as Record<string, unknown>) || {};
        if (phase === "floor-control" && typeof promptContext.next_speaker === "string") {
          setThinking(String(promptContext.next_speaker));
        } else if (participantId) {
          setThinking(participantId);
        }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        let eventName = "";
        let dataPayload = "";
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith("data:")) {
            dataPayload += line.slice(5).trimStart();
          }
        }
        if (!dataPayload) continue;
        try {
          const parsed = JSON.parse(dataPayload) as Record<string, unknown>;
          handleEvent(eventName, parsed);
        } catch (parseError) {
          console.warn("Failed to parse SSE frame", parseError);
        }
      }
    }

    return { finalResult };
  }

  async function saveActiveMeeting() {
    const meeting = activeMeeting;
    if (!meeting || meetingSaving) return;
    const backendMeetingId = meeting.backendMeetingId || uid("manual-meeting");
    setMeetingSaving(true);
    try {
      const payload = await fetchJson<Record<string, unknown>>(`/api/ouroboros-chat/meetings/${encodeURIComponent(backendMeetingId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontend_id: meeting.id,
          topic: meeting.topic,
          meeting_type: meeting.meetingType,
          participants: meeting.participants,
          participant_ids: meeting.personaIds,
          agent_ids: meeting.agentIds,
          rounds: meeting.rounds,
          summary: meeting.summary,
          transcript: meeting.transcript || meetingTranscriptFromRounds(meeting.rounds, meeting.summary),
          status: meeting.status === "error" ? "error" : "saved",
        }),
      });
      const savedId = typeof payload.meeting_id === "string" ? payload.meeting_id : backendMeetingId;
      setMeetingsById((prev) => ({
        ...prev,
        [meeting.id]: {
          ...meeting,
          backendMeetingId: savedId,
          saved: true,
          updatedAt: nowIso(),
        },
      }));
      await loadSavedMeetings();
    } finally {
      setMeetingSaving(false);
    }
  }

  function toggleMeetingMember(id: string) {
    setMeetingMembers((previous) =>
      previous.map((member) => (member.id === id ? { ...member, selected: !member.selected } : member)),
    );
  }

  function updateMeetingTopic(value: string) {
    setMeetingTopic(value);
    if (!activeMeetingId) return;
    setMeetingsById((prev) => {
      const meeting = prev[activeMeetingId];
      if (!meeting || meeting.status !== "draft") return prev;
      return {
        ...prev,
        [activeMeetingId]: {
          ...meeting,
          topic: value,
          updatedAt: nowIso(),
        },
      };
    });
  }

  function updateMeetingType(value: MeetingType) {
    setMeetingType(value);
    if (!activeMeetingId) return;
    setMeetingsById((prev) => {
      const meeting = prev[activeMeetingId];
      if (!meeting || meeting.status !== "draft") return prev;
      return {
        ...prev,
        [activeMeetingId]: {
          ...meeting,
          meetingType: value,
          updatedAt: nowIso(),
        },
      };
    });
  }

  function updateDevProvider(value: string) {
    const option = developmentProviders.find((item) => item.id === value);
    setDevProvider(value);
    setDevModel(option?.default_model || option?.models[0] || devModel || DEFAULT_MODEL);
  }

  const DEV_TEAM_DEFAULT_PERSONA_IDS = ["de-voorzitter", "de-developer", "de-tester", "de-criticus"];

  function resolveDevPersonaIds(personaOverride?: string[]): string[] {
    // The dev-team workspace must run the four canonical roles — voorzitter, developer,
    // tester, criticus — even when the user has unrelated personas (Nina, Poocky, ...)
    // ticked on the meeting tab. Only a personaOverride that explicitly contains one of
    // the dev-team personas counts as a deliberate change; otherwise we always seed the
    // four defaults.
    const explicit = (personaOverride || []).filter(Boolean);
    const explicitHasDevTeam = explicit.some((id) => DEV_TEAM_DEFAULT_PERSONA_IDS.includes(id));
    if (explicit.length && explicitHasDevTeam) {
      return personasById["de-voorzitter"] && !explicit.includes("de-voorzitter")
        ? ["de-voorzitter", ...explicit]
        : explicit;
    }
    return DEV_TEAM_DEFAULT_PERSONA_IDS.filter((id) => Boolean(personasById[id]));
  }

  async function startDevelopmentTeam(promptOverride?: string, personaOverride?: string[], agentOverride?: string[]) {
    const promptText = promptOverride?.trim() || devPrompt.trim() || meetingTopic.trim() || "Maak een robuuste implementatie en draai tests.";
    const agentIds = agentOverride?.length ? agentOverride : selectedAgentMembers.length ? selectedAgentMembers.map((member) => member.id) : ["codex"];
    setDevError("");
    setDevLaunchError("");
    setDevLaunchResult(null);
    setDevClarificationAnswers({});
    setDevClarificationQuestions([]);
    setDevResult(null);
    setDevEditableBuildPrompt("");
    setViewMode("development_team");

    // Step 1 — Intake: chair LLM decides whether the prompt needs clarification before the
    // four-persona meeting kicks off.
    setDevIntakeRunning(true);
    let intake: DevelopmentTeamIntakeResult | null = null;
    try {
      intake = await fetchJson<DevelopmentTeamIntakeResult>("/api/ouroboros-chat/development-team/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          provider: devProvider,
          model: devModel,
        }),
      });
    } catch (error) {
      setDevIntakeRunning(false);
      setDevError(`Intake mislukt: ${friendlyErrorMessage(error)}`);
      return;
    }
    setDevIntakeRunning(false);

    if (intake?.needs_clarification && intake.questions?.length) {
      // Show the clarification form. The user fills the answers, clicks "Beantwoord en start
      // overleg" which calls `runDevelopmentTeamMeeting` with the Q&A bundle.
      setDevClarificationQuestions(intake.questions);
      const seeded: Record<string, string> = {};
      intake.questions.forEach((q) => {
        seeded[q] = "";
      });
      setDevClarificationAnswers(seeded);
      return;
    }

    // No clarification needed — go straight to the four-persona meeting.
    await runDevelopmentTeamMeeting(promptText, resolveDevPersonaIds(personaOverride), agentIds, []);
  }

  async function runDevelopmentTeamMeeting(
    promptText: string,
    personaIds: string[],
    agentIds: string[],
    clarifications: ClarificationAnswer[]
  ) {
    setDevRunning(true);
    setDevError("");
    setDevResult((prev) => prev ? { ...prev, rounds: [] } : null);
    
    const personaIdsToUse = personaIds.length ? personaIds : ["de-voorzitter", "de-developer", "de-tester", "de-criticus"];
    
    try {
      // Use streaming endpoint for live updates
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
      
      if (!response.ok || !response.body) {
        const detail = response.status === 404
          ? "De streaming endpoint ontbreekt — herbouw de backend."
          : `Meeting start mislukt: HTTP ${response.status}`;
        setDevError(detail);
        setDevRunning(false);
        return;
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let meetingId: string | null = null;
      let buildPromptFromMeeting = "";
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let dataPayload = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("data:")) {
              dataPayload += line.slice(5).trimStart();
            }
          }
          if (!dataPayload) continue;
          try {
            const event = JSON.parse(dataPayload);
            const type = String(event.type || "");
            
            // Handle meeting events
            if (type === "meeting_started") {
              meetingId = String(event.meeting_id || "");
              // Update devResult with meeting started info
              setDevResult((prev) => ({
                ...(prev || {} as DevelopmentTeamResult),
                meeting_id: meetingId,
                meeting_type: "development_team",
                status: "running",
                rounds: prev?.rounds || [],
              }));
            } else if (type === "participant_turn") {
              // This is the main event type for meeting rounds
              const participant = event.participant || {};
              const round: DevelopmentTeamRound = {
                id: String(event.meeting_id || meetingId || Date.now()),
                round: event.round !== undefined ? Number(event.round) : undefined,
                phase: String(event.phase || ""),
                participantId: String(participant.id || participant.name || ""),
                participantName: String(participant.name || participant.id || ""),
                content: String(event.content || ""),
                createdAt: String(event.timestamp || nowIso()),
              };
              // Update devResult with the new round
              setDevResult((prev) => {
                const existingRounds = prev?.rounds || [];
                // Check if this round already exists (same round number and participant)
                const exists = existingRounds.some(
                  (r) => r.participantId === round.participantId && r.phase === round.phase
                );
                if (exists) {
                  return prev || null;
                }
                return {
                  ...(prev || {} as DevelopmentTeamResult),
                  meeting_id: meetingId,
                  meeting_type: "development_team",
                  status: "running",
                  rounds: [...existingRounds, round],
                };
              });
            } else if (type === "meeting_recorded") {
              // Final event with build_prompt
              buildPromptFromMeeting = String(event.build_prompt || event.summary || "");
              const summary = String(event.summary || "");
              const augmentedTopic = String(event.augmented_topic || event.topic || promptText);
              
              setDevResult((prev) => ({
                ...(prev || {} as DevelopmentTeamResult),
                status: "planned",
                execution: "not_executed_by_ouroboros_chat_router",
                approval_required: true,
                approval_phrase: "Akkoord",
                approval_supplied: false,
                prompt: promptText,
                build_prompt: buildPromptFromMeeting,
                augmented_prompt: augmentedTopic,
                summary: summary,
                meeting_id: meetingId,
                meeting_type: "development_team",
                agent_command: "/codex",
                slash_prompt: `/codex ${buildPromptFromMeeting}\n\n---\nOuroboros development protocol:\n- Build in Docker-isolated sandbox\n- Iterate: smallest diff, test, review\n- Report files touched and tests run\n- Approval phrase: Akkoord`,
                clarifications_supplied: clarifications,
              }));
              setDevEditableBuildPrompt(buildPromptFromMeeting);
            } else if (type === "meeting_error") {
              setDevError(String(event.error || "Meeting fout"));
            } else if (type === "meeting_summary") {
              // Intermediate summary event
              setDevResult((prev) => ({
                ...(prev || {} as DevelopmentTeamResult),
                summary: String(event.summary || prev?.summary || ""),
              }));
            }
          } catch (parseError) {
            console.warn("Failed to parse meeting SSE frame", parseError);
          }
        }
      }
    } catch (error) {
      setDevError(friendlyErrorMessage(error));
      setDevResult(null);
    } finally {
      setDevRunning(false);
    }
  }

  async function submitDevTeamClarifications() {
    if (!devClarificationQuestions.length) return;
    const pairs: ClarificationAnswer[] = devClarificationQuestions.map((question) => ({
      question,
      answer: (devClarificationAnswers[question] || "").trim(),
    }));
    const promptText = devPrompt.trim() || "Maak een robuuste implementatie en draai tests.";
    const personaIds = resolveDevPersonaIds();
    const agentIds = selectedAgentMembers.length ? selectedAgentMembers.map((member) => member.id) : ["codex"];
    // Clear the form so the UI moves on to the running-meeting state.
    setDevClarificationQuestions([]);
    setDevClarificationAnswers({});
    await runDevelopmentTeamMeeting(promptText, personaIds, agentIds, pairs);
  }

  function skipDevTeamClarifications() {
    if (!devClarificationQuestions.length) return;
    const promptText = devPrompt.trim() || "Maak een robuuste implementatie en draai tests.";
    const personaIds = resolveDevPersonaIds();
    const agentIds = selectedAgentMembers.length ? selectedAgentMembers.map((member) => member.id) : ["codex"];
    setDevClarificationQuestions([]);
    setDevClarificationAnswers({});
    void runDevelopmentTeamMeeting(promptText, personaIds, agentIds, []);
  }

  function continueMeetingInDevelopmentTeam(autoPlan = false) {
    const meeting = activeMeeting;
    if (!meeting?.summary) return;
    const promptText = meetingDevelopmentPrompt(meeting);
    const personaIds = meeting.personaIds.length ? meeting.personaIds : selectedPersonaMembers.map((member) => member.id);
    const agentIds = meeting.agentIds.length ? meeting.agentIds : selectedAgentMembers.map((member) => member.id);
    const safeAgentIds = agentIds.length ? agentIds : ["codex"];
    setDevPrompt(promptText);
    setDevResult(null);
    setDevError("");
    setDevApproval("");
    setDevLaunchError("");
    setDevLaunchResult(null);
    setMeetingMembers((previous) =>
      previous.map((member) =>
        member.source === "agent" && safeAgentIds.includes(member.id)
          ? { ...member, selected: true }
          : member
      )
    );
    setViewMode("development_team");
    if (autoPlan) {
      void startDevelopmentTeam(promptText, personaIds, safeAgentIds);
    }
  }

  function insertDevelopmentPrompt() {
    if (!devResult?.slash_prompt) return;
    setPrompt(devResult.slash_prompt);
    setViewMode("chat");
    setSlashOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function startTeamBuild() {
    // Reset prior build state and open the SSE stream against the new /development-team/build route.
    const buildPrompt = (devEditableBuildPrompt || devResult?.build_prompt || "").trim();
    if (!buildPrompt || devTeamBuildRunning) return;
    setDevTeamBuildRunning(true);
    setDevTeamBuildError("");
    setDevTeamBuild({
      iterations: {},
      order: [],
      status: "running",
      startedAt: nowIso(),
    });
    const personaIds = resolveDevPersonaIds();
    let response: Response;
    try {
      response = await fetch(apiUrl("/api/ouroboros-chat/development-team/build"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          build_prompt: buildPrompt,
          persona_ids: personaIds,
          clarifications: [],
          provider: devProvider,
          model: devModel,
          max_iterations: Math.max(1, Math.min(6, devMaxIterations || 4)),
          min_iterations: Math.max(1, Math.min(4, devMinIterations || 2)),
          test_timeout_seconds: 120,
          llm_timeout_seconds: 90,
        }),
      });
    } catch (error) {
      setDevTeamBuildRunning(false);
      setDevTeamBuildError(friendlyErrorMessage(error));
      setDevTeamBuild((prev) => ({ ...prev, status: "error", error: friendlyErrorMessage(error) }));
      return;
    }
    if (!response.ok || !response.body) {
      const detail = response.status === 404
        ? "De build-route ontbreekt — herbouw de backend (commit fe514ab of nieuwer)."
        : `Build start mislukt: HTTP ${response.status}`;
      setDevTeamBuildRunning(false);
      setDevTeamBuildError(detail);
      setDevTeamBuild((prev) => ({ ...prev, status: "error", error: detail }));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const applyEvent = (payload: Record<string, unknown>) => {
      const type = String(payload.type || "");
      setDevTeamBuild((previous) => {
        const next: BuildSessionState = {
          ...previous,
          iterations: { ...previous.iterations },
          order: [...previous.order],
        };
        if (type === "build_started") {
          next.session_id = String(payload.session_id || "");
          next.workspace_path = String(payload.workspace_path || "");
          next.max_iterations = Number(payload.max_iterations || 0) || undefined;
          next.status = "running";
          return next;
        }
        const iterationNum = Number(payload.iteration);
        if (Number.isFinite(iterationNum) && iterationNum > 0) {
          const existing = next.iterations[iterationNum] || { iteration: iterationNum };
          if (type === "developer_turn") existing.developer = String(payload.content || "");
          if (type === "files_written") existing.files = (payload.files as BuildFileWrite[]) || [];
          if (type === "tester_turn") existing.tester = String(payload.content || "");
          if (type === "test_run") {
            existing.command = String(payload.command || "");
            existing.exit_code = Number(payload.exit_code);
            existing.stdout = String(payload.stdout || "");
            existing.stderr = String(payload.stderr || "");
            existing.duration_s = Number(payload.duration_s);
            existing.green = Boolean(payload.green);
            existing.timed_out = Boolean(payload.timed_out);
          }
          if (type === "critic_turn") existing.critic = String(payload.content || "");
          if (type === "chair_review") {
            existing.chair_verdict = String(payload.verdict || "");
            existing.chair_reason = String(payload.reason || "");
            existing.chair_next = String(payload.next_subtask || "");
          }
          next.iterations[iterationNum] = existing;
          if (!next.order.includes(iterationNum)) next.order.push(iterationNum);
        }
        if (type === "build_complete") {
          next.status = "complete";
          next.finalMessage = String(payload.summary || `Build groen na ${payload.iterations || "?"} iteratie(s).`);
        }
        if (type === "build_exhausted") {
          next.status = "exhausted";
          next.finalMessage = `Build niet groen na ${payload.iterations || "?"} iteratie(s); zie laatste test-output.`;
        }
        if (type === "build_error") {
          next.status = "error";
          next.error = String(payload.error || "Onbekende fout.");
        }
        return next;
      });
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let dataPayload = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith("data:")) {
              dataPayload += line.slice(5).trimStart();
            }
          }
          if (!dataPayload) continue;
          try {
            applyEvent(JSON.parse(dataPayload));
          } catch (parseError) {
            console.warn("Failed to parse build SSE frame", parseError);
          }
        }
      }
    } finally {
      setDevTeamBuildRunning(false);
    }
  }

  async function approveAndStartDevelopmentBuild() {
    if (!devResult?.slash_prompt || devApproval.trim() !== "Akkoord" || devLaunchRunning) return;
    setDevLaunchRunning(true);
    setDevLaunchError("");
    setDevLaunchResult(null);
    // If the user edited the build_prompt textarea, splice that text in instead of the
    // build_prompt the meeting produced. The slash-command prefix and protocol block stay.
    const command = devResult.agent_command || "/codex";
    const edited = (devEditableBuildPrompt || "").trim();
    const original = (devResult.build_prompt || "").trim();
    let finalSlashPrompt = devResult.slash_prompt;
    if (edited && edited !== original) {
      const parts = devResult.slash_prompt.split("\n\n---\n", 2);
      const protocol = parts.length > 1 ? `\n\n---\n${parts[1]}` : "";
      finalSlashPrompt = `${command} ${edited}${protocol}`;
    }
    try {
      const payload = await fetchJson<Record<string, unknown>>("/api/cockpit/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: finalSlashPrompt,
          approval: "Akkoord",
          provider: devProvider,
          model: devModel,
        }),
      });
      setDevLaunchResult(payload);
    } catch (error) {
      setDevLaunchError(friendlyErrorMessage(error));
    } finally {
      setDevLaunchRunning(false);
    }
  }

  function activateRail(target: ViewMode) {
    if (target === "meeting") {
      openMeetingTable();
      return;
    }
    if (target === "development_team") {
      setViewMode("development_team");
      return;
    }
    if (target === "persona_builder" && builderMode === null) {
      setDraftPersona(currentChatPersona);
      setBuilderMode(currentChatPersona.id ? "edit" : "create");
    }
    setViewMode(target);
    window.setTimeout(() => {
      if (target === "chat") {
        threadEndRef.current?.scrollIntoView({ block: "end" });
        composerRef.current?.focus();
        return;
      }
      if (target === "persona_builder") {
        personaPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        personaNameRef.current?.focus();
        return;
      }
      statusPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      modelInputRef.current?.focus();
    }, 0);
  }

  function renderMeetingWorkspace() {
    const meeting = activeMeeting;
    const activeParticipantMembers = (meeting?.participants || []).map((record) => memberFromPersona(record, true));
    const participantBarMembers = activeParticipantMembers.length ? activeParticipantMembers : selectedPersonaMembers;
    const activeSpeaker = participantBarMembers.find((member) => member.id === thinkingPersonaId);
    const rounds = meeting?.rounds || [];
    const summary = meeting?.summary || "";
    const canStart = selectedPersonaMembers.length > 0 && !meetingRunning;
    const meetingTypeForView: MeetingType = meeting?.meetingType || meetingType;
    const phaseTimeline = meetingPhaseTimeline(meetingTypeForView);
    const seenPhases = new Set(rounds.map((round) => round.phase));
    const tracksByPersonaId = new Map<string, string>();
    rounds.forEach((round) => {
      if (round.participantId && round.assignmentTrackKey && !tracksByPersonaId.has(round.participantId)) {
        tracksByPersonaId.set(round.participantId, round.assignmentTrackKey);
      }
    });
    const latestPhase = (() => {
      for (let index = rounds.length - 1; index >= 0; index -= 1) {
        const round = rounds[index];
        if (round.phase && round.phase !== "floor-control" && round.phase !== "intervention") {
          return round.phase;
        }
      }
      return "";
    })();

    return (
      <section className="meeting-workspace" aria-label="Meeting workspace">
        <header className="meeting-workspace-header">
          <div className="chat-title-group">
            <span className="eyebrow">Ouroboros Meeting</span>
            <h1>{meeting?.topic || meetingTopic || "Persona table"}</h1>
            <small>{formatMeetingType(meeting?.meetingType || meetingType)}</small>
          </div>
          <div className={`meeting-status-pill ${meeting?.status || "draft"}`}>
            {meetingRunning ? <Loader2 size={15} /> : <Users size={15} />}
            <span>{meeting?.status || "draft"}</span>
          </div>
        </header>

        <div className="meeting-workspace-body">
          <div className="meeting-config-stack">
            <section className="meeting-setup-band">
              <label className="field meeting-topic-field">
                <span>Topic</span>
                <textarea
                  ref={meetingTopicRef}
                  value={meetingTopic}
                  onChange={(event) => updateMeetingTopic(event.target.value)}
                  rows={3}
                />
              </label>
              <div className="meeting-type-segment" role="tablist" aria-label="Vergadertype">
                {MEETING_TYPE_OPTIONS.map((option) => {
                  const Icon = option.icon === "sprint" ? Command : option.icon === "brainstorm" ? Sparkles : Users;
                  return (
                    <button
                      className={meetingType === option.id ? "active" : ""}
                      type="button"
                      key={option.id}
                      onClick={() => updateMeetingType(option.id)}
                    >
                      <Icon size={15} />
                      <span className="meeting-type-copy">
                        <span>{option.label}</span>
                        <small>{option.hint}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="meeting-command-row">
                <button
                  className="meeting-action"
                  type="button"
                  onClick={() => void startPersonaMeeting()}
                  disabled={!canStart}
                >
                  {meetingRunning ? <Loader2 size={17} /> : <Users size={17} />}
                  <span>Start meeting</span>
                </button>
                <button
                  className="meeting-action secondary"
                  type="button"
                  onClick={insertMeetingPrompt}
                  disabled={!summary}
                >
                  <Sparkles size={17} />
                  <span>Create agent task</span>
                </button>
                <button
                  className="meeting-action secondary"
                  type="button"
                  onClick={() => continueMeetingInDevelopmentTeam(true)}
                  disabled={!summary || devRunning}
                >
                  {devRunning ? <Loader2 size={17} /> : <Code2 size={17} />}
                  <span>Dev workflow</span>
                </button>
                <button
                  className="meeting-action secondary"
                  type="button"
                  onClick={() => void saveActiveMeeting()}
                  disabled={!meeting || meetingSaving || (!rounds.length && !summary)}
                >
                  {meetingSaving ? <Loader2 size={17} /> : <FileText size={17} />}
                  <span>Save meeting</span>
                </button>
              </div>
            </section>

            <section className="participant-bar" aria-label="Selected meeting personas">
              {participantBarMembers.length ? (
                participantBarMembers.map((member) => {
                  const isChair = isChairParticipant(member.id, member.name);
                  const trackKey = !isChair ? tracksByPersonaId.get(member.id) || "" : "";
                  const trackLabel = trackLabelFor(trackKey);
                  return (
                    <button
                      className={`participant-chip ${thinkingPersonaId === member.id ? "thinking" : ""} ${isChair ? "chair-chip" : ""}`}
                      type="button"
                      key={member.id}
                      onClick={() => toggleMeetingMember(member.id)}
                      title={member.name + (trackLabel ? ` — werkt aan: ${trackLabel}` : "")}
                    >
                      <span className={`speaker-lamp ${thinkingPersonaId === member.id ? "live" : ""}`} aria-hidden="true" />
                      <span
                        className={`member-avatar ${member.online ? "online" : ""}`}
                        style={{ backgroundColor: member.avatar?.kind === "initials" ? member.avatar.color : undefined }}
                      >
                        {member.avatar?.kind === "image" ? (
                          <img src={uploadUrl(member.avatar.path, member.avatar.filename)} alt="" />
                        ) : (
                          initials(member.name)
                        )}
                      </span>
                      <span className="participant-chip-body">
                        <strong>{member.name}</strong>
                        <small className={thinkingPersonaId === member.id ? "chip-thought-loop" : ""}>
                          {thinkingPersonaId === member.id
                            ? meetingThoughtNarrative(member, meetingTypeForView)
                            : isChair
                              ? "leidt gesprek"
                              : "deelnemer"}
                        </small>
                        {trackLabel ? <span className="track-badge" aria-label={`Werkt aan ${trackLabel}`}>{trackLabel}</span> : null}
                      </span>
                    </button>
                  );
                })
              ) : (
                <span className="empty-note">Selecteer persona's voor de vergadering.</span>
              )}
            </section>

            <section className="meeting-selector-grid" aria-label="Meeting selection">
              <div className="meeting-selector-column">
                <div className="member-section-label">
                  <span>Persona's</span>
                  <small>{selectedPersonaMembers.length} selected</small>
                </div>
                <div className="meeting-selector-list">
                  {personaMeetingMembers.length ? (
                    personaMeetingMembers.map((member) => (
                      <button
                        className={`member-row ${member.selected ? "selected" : ""}`}
                        key={member.id}
                        type="button"
                        onClick={() => toggleMeetingMember(member.id)}
                      >
                        <span
                          className={`member-avatar ${member.online ? "online" : ""}`}
                          style={{ backgroundColor: member.avatar?.kind === "initials" ? member.avatar.color : undefined }}
                        >
                          {member.avatar?.kind === "image" ? (
                            <img src={uploadUrl(member.avatar.path, member.avatar.filename)} alt="" />
                          ) : (
                            initials(member.name)
                          )}
                        </span>
                        <span>
                          <strong>{member.name}</strong>
                          <small>persona</small>
                        </span>
                        {member.selected ? <Check size={16} /> : <Plus size={16} />}
                      </button>
                    ))
                  ) : (
                    <span className="empty-note">Maak eerst een persona aan.</span>
                  )}
                </div>
              </div>

              <div className="meeting-selector-column">
                <div className="member-section-label secondary">
                  <span>Agents voor vervolgtaken</span>
                  <small>{selectedAgentMembers.length} selected</small>
                </div>
                <div className="meeting-selector-list">
                  {agentMeetingMembers.map((member) => (
                    <button
                      className={`member-row secondary ${member.selected ? "selected" : ""}`}
                      key={member.id}
                      type="button"
                      onClick={() => toggleMeetingMember(member.id)}
                    >
                      <span className={`member-avatar ${member.online ? "online" : ""}`}>{initials(member.name)}</span>
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.handle}</small>
                      </span>
                      {member.selected ? <Check size={16} /> : <Plus size={16} />}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {savedMeetings.length ? (
              <section className="saved-meeting-strip" aria-label="Saved meetings">
                <div className="member-section-label">
                  <span>Opgeslagen vergaderingen</span>
                  <small>{savedMeetings.length}</small>
                </div>
                <div className="saved-meeting-list">
                  {savedMeetings.slice(0, 6).map((item) => (
                    <button type="button" key={item.meeting_id} onClick={() => void openSavedMeeting(item.meeting_id)}>
                      <strong>{item.topic || item.meeting_id}</strong>
                      <small>{formatMeetingType(item.meeting_type)} - {item.summary || item.status || item.updated_at || item.meeting_id}</small>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <section className="meeting-transcript-flow" aria-label="Meeting transcript" ref={meetingTranscriptRef}>
            <nav className="meeting-phase-timeline" aria-label="Vergaderagenda">
              {phaseTimeline.map((step, index) => {
                const reached = seenPhases.has(step.phase);
                const isCurrent = step.phase === latestPhase;
                return (
                  <div
                    key={step.phase}
                    className={`phase-step ${reached ? "reached" : ""} ${isCurrent ? "current" : ""}`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    <span className="phase-dot" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="phase-copy">
                      <strong>{step.label}</strong>
                      <small>{step.hint}</small>
                    </span>
                  </div>
                );
              })}
            </nav>
            {meetingRunning && !rounds.length ? (
              <article className="meeting-turn pending">
                <div className="message-meta">
                  <span>Meeting runner</span>
                  <span>running</span>
                </div>
                <div className="pending-line">
                  <span className="speaker-lamp live" aria-hidden="true" />
                  <Loader2 size={16} />
                  <span>{activeSpeaker ? `${activeSpeaker.name} is aan het woord` : "Persona's denken sequentieel"}</span>
                </div>
                <div className="speaker-thought-card" aria-label="Gedachtenstroom">
                  <div className="thought-flow-speaker">
                    <span className="speaker-lamp live" aria-hidden="true" />
                    <strong>{activeSpeaker?.name || "Volgende spreker"}</strong>
                    <small>{formatMeetingType(meeting?.meetingType || meetingType)}</small>
                  </div>
                  <p>{meetingThoughtNarrative(activeSpeaker, meeting?.meetingType || meetingType)}</p>
                  <div className="thought-flow-steps">
                    {meetingThoughtFlow(activeSpeaker, meeting?.meetingType || meetingType).map((step) => (
                      <div className="thought-step" key={`${step.label}-${step.detail}`}>
                        <span>{step.label}</span>
                        <small>{step.detail}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            ) : null}
            {rounds.length ? (
              rounds.map((round) => {
                const isActiveSpeaker = meetingRunning && thinkingPersonaId === round.participantId;
                const isChairTurn = isChairParticipant(round.participantId, round.participantName, round.role);
                if (round.isFloorControl && !round.isIntervention) {
                  const nextParticipant = participantBarMembers.find((member) => member.id === round.nextSpeakerId);
                  const nextTrack = trackLabelFor(nextParticipant ? tracksByPersonaId.get(nextParticipant.id) : "");
                  return (
                    <div className="meeting-handoff" key={round.id} role="separator" aria-label="Voorzitter geeft het woord">
                      <span className="handoff-from">{round.participantName}</span>
                      <span className="handoff-arrow" aria-hidden="true">→</span>
                      <span className="handoff-to">
                        {nextParticipant?.name || "volgende spreker"}
                        {nextTrack ? <em className="handoff-track">{nextTrack}</em> : null}
                      </span>
                      <span className="handoff-line">{round.content}</span>
                    </div>
                  );
                }
                const trackLabel = trackLabelFor(round.assignmentTrackKey);
                return (
                  <article className={`meeting-turn ${isActiveSpeaker ? "speaking" : ""} ${isChairTurn ? "chair-turn" : ""} ${round.isIntervention ? "intervention-turn" : ""}`} key={round.id}>
                    <header className="meeting-turn-header">
                      <div className="meeting-speaker">
                        <span className={`speaker-lamp ${isActiveSpeaker ? "live" : "resting"}`} aria-hidden="true" />
                        <div className="message-meta">
                          <span>{round.participantName}</span>
                          <span>{formatMeetingPhase(round.phase)}</span>
                        </div>
                      </div>
                      {trackLabel ? <span className="turn-track-pill">{trackLabel}</span> : null}
                    </header>
                    <StructuredMeetingText text={round.content} />
                  </article>
                );
              })
            ) : !meetingRunning ? (
              <article className="meeting-turn empty">
                <div className="message-meta">
                  <span>Transcript</span>
                  <span>wacht op start</span>
                </div>
                <p>Selecteer persona's, kies een topic en start de vergadering.</p>
              </article>
            ) : null}
            {summary ? (
              <article className="meeting-summary">
                <div className="message-meta">
                  <span>Consensus & Actiepunten</span>
                  {meeting?.backendMeetingId ? <span>{meeting.backendMeetingId}</span> : null}
                </div>
                <StructuredMeetingText text={summary} summary />
              </article>
            ) : null}
            {meeting?.error ? (
              <article className="meeting-turn error">
                <div className="message-meta">
                  <span>Error</span>
                </div>
                <p>{meeting.error}</p>
              </article>
            ) : null}
            <div ref={meetingTranscriptEndRef} aria-hidden="true" />
          </section>
        </div>
      </section>
    );
  }

  function renderDevelopmentTeamWorkspace() {
    const personaCount = selectedPersonaMembers.length;
    const agentIds = selectedAgentMembers.length ? selectedAgentMembers : agentMeetingMembers.filter((member) => member.id === "codex");
    const rounds = devResult?.rounds || [];

    return (
      <section className="meeting-workspace development-workspace" aria-label="Development team workspace">
        <header className="meeting-workspace-header">
          <div className="chat-title-group">
            <span className="eyebrow">Ouroboros Development Team</span>
            <h1>{devPrompt || "Agentisch coderen"}</h1>
            <small>{devProvider} / {devModel}</small>
          </div>
          <div className={`meeting-status-pill ${devRunning ? "running" : devResult ? "completed" : devError ? "error" : "draft"}`}>
            {devRunning ? <Loader2 size={15} /> : <Code2 size={15} />}
            <span>{devRunning ? "running" : devResult ? "planned" : devError ? "error" : "draft"}</span>
          </div>
        </header>

        <div className="meeting-workspace-body">
          <div className="meeting-config-stack">
          <section className="meeting-setup-band development-setup-band">
            <label className="field meeting-topic-field">
              <span>Prompt</span>
              <textarea
                value={devPrompt}
                onChange={(event) => setDevPrompt(event.target.value)}
                rows={4}
              />
            </label>
            <div className="development-model-grid">
              <label className="compact-field">
                <span>Provider</span>
                <select value={devProvider} onChange={(event) => updateDevProvider(event.target.value)}>
                  {developmentProviders.map((option) => (
                    <option value={option.id} key={option.id}>
                      {providerOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="compact-field">
                <span>Model</span>
                <select value={devModel} onChange={(event) => setDevModel(event.target.value)}>
                  {devModelChoices.map((item) => (
                    <option value={item} key={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="compact-field">
                <span>Max iteraties</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={devMaxIterations}
                  onChange={(event) => setDevMaxIterations(Number(event.target.value) || 3)}
                />
              </label>
              <label className="compact-field">
                <span>Min iteraties</span>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={devMinIterations}
                  onChange={(event) => setDevMinIterations(Number(event.target.value) || 2)}
                />
              </label>
            </div>
            <div className="meeting-command-row">
              <button
                className="meeting-action"
                type="button"
                onClick={() => void startDevelopmentTeam()}
                disabled={devRunning || devIntakeRunning || devClarificationQuestions.length > 0}
              >
                {devRunning || devIntakeRunning ? <Loader2 size={17} /> : <Code2 size={17} />}
                <span>
                  {devIntakeRunning
                    ? "Voorzitter denkt na..."
                    : devRunning
                      ? "Team overlegt..."
                      : "Start team"}
                </span>
              </button>
              <button className="meeting-action secondary" type="button" onClick={insertDevelopmentPrompt} disabled={!devResult?.slash_prompt}>
                <Sparkles size={17} />
                <span>Create agent task</span>
              </button>
            </div>

            {devClarificationQuestions.length > 0 ? (
              <div className="dev-clarification-card" role="dialog" aria-label="Verduidelijkingsvragen van de voorzitter">
                <div className="dev-clarification-header">
                  <strong>De voorzitter heeft eerst een paar vragen</strong>
                  <small>Beantwoord wat je weet — wat je open laat mag het team zelf invullen.</small>
                </div>
                {devClarificationQuestions.map((question, index) => (
                  <label className="dev-clarification-row" key={`${question}-${index}`}>
                    <span>{question}</span>
                    <textarea
                      value={devClarificationAnswers[question] || ""}
                      onChange={(event) =>
                        setDevClarificationAnswers((previous) => ({
                          ...previous,
                          [question]: event.target.value,
                        }))
                      }
                      rows={2}
                      placeholder="Jouw antwoord..."
                    />
                  </label>
                ))}
                <div className="dev-clarification-actions">
                  <button
                    className="meeting-action"
                    type="button"
                    onClick={() => void submitDevTeamClarifications()}
                    disabled={devRunning}
                  >
                    {devRunning ? <Loader2 size={17} /> : <Sparkles size={17} />}
                    <span>Beantwoord en start overleg</span>
                  </button>
                  <button
                    className="meeting-action secondary"
                    type="button"
                    onClick={() => skipDevTeamClarifications()}
                    disabled={devRunning}
                  >
                    <Code2 size={17} />
                    <span>Sla over, team mag aannames maken</span>
                  </button>
                </div>
              </div>
            ) : null}

            {devResult?.build_prompt ? (
              <div className="dev-build-prompt-card">
                <div className="dev-build-prompt-header">
                  <strong>Bouwprompt voor de uitvoerende agent</strong>
                  <small>Pas aan als je iets wil verfijnen voordat het team gaat bouwen of voordat je {devResult.agent_command || "/codex"} laat lopen.</small>
                </div>
                <textarea
                  className="dev-build-prompt-textarea"
                  value={devEditableBuildPrompt}
                  onChange={(event) => setDevEditableBuildPrompt(event.target.value)}
                  rows={Math.min(12, Math.max(4, devEditableBuildPrompt.split("\n").length + 1))}
                />
                <div className="dev-build-prompt-actions">
                  <button
                    className="meeting-action"
                    type="button"
                    onClick={() => void startTeamBuild()}
                    disabled={devTeamBuildRunning || !(devEditableBuildPrompt || devResult.build_prompt)}
                  >
                    {devTeamBuildRunning ? <Loader2 size={17} /> : <Code2 size={17} />}
                    <span>{devTeamBuildRunning ? "Team bouwt..." : "Bouw uit met team (Aider-modus)"}</span>
                  </button>
                  <small className="dev-build-prompt-hint">
                    Het team schrijft files in een sandbox onder <code>data/dev-team-builds/</code>, draait de testcommando's
                    daar, en itereert tot de test groen is of {devMaxIterations} pogingen voorbij zijn.
                  </small>
                </div>
              </div>
            ) : null}

            {devTeamBuildError ? (
              <div className="dev-build-error">
                <strong>Build kon niet starten</strong>
                <small>{devTeamBuildError}</small>
              </div>
            ) : null}

            {devResult?.slash_prompt ? (
              <div className="approval-run-card">
                <label className="compact-field">
                  <span>Approval</span>
                  <input
                    value={devApproval}
                    onChange={(event) => setDevApproval(event.target.value)}
                    placeholder="Akkoord"
                    autoComplete="off"
                  />
                </label>
                <button
                  className="meeting-action secondary"
                  type="button"
                  onClick={() => void approveAndStartDevelopmentBuild()}
                  disabled={devLaunchRunning || devApproval.trim() !== "Akkoord"}
                  title="Deze route is een fallback naar /codex die in de huidige setup mockt. Gebruik 'Bouw uit met team (Aider-modus)' voor echte iteratieve builds."
                >
                  {devLaunchRunning ? <Loader2 size={17} /> : <Code2 size={17} />}
                  <span>Start externe bouwer (Codex)</span>
                </button>
              </div>
            ) : null}
          </section>

          <section className="participant-bar" aria-label="Development team members">
            {[...selectedPersonaMembers, ...agentIds].map((member) => (
              <button
                className={`participant-chip ${isChairParticipant(member.id, member.name) ? "chair-chip" : ""}`}
                type="button"
                key={`${member.source}-${member.id}`}
                onClick={() => toggleMeetingMember(member.id)}
                title={member.name}
              >
                <span className={`speaker-lamp ${devRunning ? "live" : "resting"}`} aria-hidden="true" />
                <span
                  className={`member-avatar ${member.online ? "online" : ""}`}
                  style={{ backgroundColor: member.avatar?.kind === "initials" ? member.avatar.color : undefined }}
                >
                  {member.avatar?.kind === "image" ? <img src={uploadUrl(member.avatar.path, member.avatar.filename)} alt="" /> : initials(member.name)}
                </span>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.source === "agent" ? member.handle : isChairParticipant(member.id, member.name) ? "voorzitter" : "persona"}</small>
                </span>
              </button>
            ))}
            {!personaCount ? <span className="empty-note">Selecteer persona's of gebruik de standaard voorzitter.</span> : null}
          </section>

          <section className="meeting-selector-grid" aria-label="Development team selection">
            <div className="meeting-selector-column">
              <div className="member-section-label">
                <span>Persona's</span>
                <small>{selectedPersonaMembers.length} selected</small>
              </div>
              <div className="meeting-selector-list">
                {personaMeetingMembers.map((member) => (
                  <button
                    className={`member-row ${member.selected ? "selected" : ""}`}
                    key={member.id}
                    type="button"
                    onClick={() => toggleMeetingMember(member.id)}
                  >
                    <span
                      className={`member-avatar ${member.online ? "online" : ""}`}
                      style={{ backgroundColor: member.avatar?.kind === "initials" ? member.avatar.color : undefined }}
                    >
                      {member.avatar?.kind === "image" ? <img src={uploadUrl(member.avatar.path, member.avatar.filename)} alt="" /> : initials(member.name)}
                    </span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>persona</small>
                    </span>
                    {member.selected ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                ))}
              </div>
            </div>
            <div className="meeting-selector-column">
              <div className="member-section-label secondary">
                <span>CLI agents</span>
                <small>{selectedAgentMembers.length || 1} selected</small>
              </div>
              <div className="meeting-selector-list">
                {agentMeetingMembers.map((member) => (
                  <button
                    className={`member-row secondary ${member.selected ? "selected" : ""}`}
                    key={member.id}
                    type="button"
                    onClick={() => toggleMeetingMember(member.id)}
                  >
                    <span className={`member-avatar ${member.online ? "online" : ""}`}>{initials(member.name)}</span>
                    <span>
                      <strong>{member.name}</strong>
                      <small>{member.handle}</small>
                    </span>
                    {member.selected ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                ))}
              </div>
            </div>
          </section>
          </div>

          <section className="meeting-transcript-flow" aria-label="Development team transcript">
            {devRunning ? (
              <article className="meeting-turn pending">
                <div className="pending-line">
                  <span className="speaker-lamp live" aria-hidden="true" />
                  <Loader2 size={16} />
                  <span>Ontwikkelteam maakt het traject klaar</span>
                </div>
              </article>
            ) : null}
            {rounds.map((round) => (
              <article className={`meeting-turn ${isChairParticipant(round.participantId, round.participantName) ? "chair-turn" : ""}`} key={round.id}>
                <header className="meeting-turn-header">
                  <div className="meeting-speaker">
                    <span className="speaker-lamp resting" aria-hidden="true" />
                    <div className="message-meta">
                      <span>{round.participantName}</span>
                      <span>{formatMeetingPhase(round.phase)}</span>
                    </div>
                  </div>
                </header>
                <StructuredMeetingText text={round.content} />
              </article>
            ))}
            {devResult?.slash_prompt ? (
              <article className="meeting-summary development-command-card">
                <div className="message-meta">
                  <span>{devResult.agent_command || "/codex"}</span>
                  <span>{devResult.execution || "approval-gated"}</span>
                </div>
                <pre>{devResult.slash_prompt}</pre>
              </article>
            ) : null}
            {devTeamBuild.status !== "idle" ? (
              <article className="meeting-summary dev-team-build-card">
                <header className="dev-build-card-header">
                  <strong>Aider-modus build</strong>
                  <span className={`dev-build-status dev-build-status-${devTeamBuild.status}`}>
                    {devTeamBuild.status === "running" && (
                      <>
                        <Loader2 size={13} /> bezig met iteratie {devTeamBuild.order[devTeamBuild.order.length - 1] || "?"}
                      </>
                    )}
                    {devTeamBuild.status === "complete" && <>✓ tests groen</>}
                    {devTeamBuild.status === "exhausted" && <>✗ iteraties uitgeput</>}
                    {devTeamBuild.status === "error" && <>✗ fout</>}
                  </span>
                </header>
                {devTeamBuild.workspace_path ? (
                  <small className="dev-build-workspace">workspace: <code>{devTeamBuild.workspace_path}</code></small>
                ) : null}
                {devTeamBuild.order.map((iterNum) => {
                  const it = devTeamBuild.iterations[iterNum];
                  if (!it) return null;
                  const isGreen = it.green === true;
                  const isRed = it.exit_code !== undefined && it.exit_code !== 0;
                  return (
                    <section className={`dev-build-iter ${isGreen ? "iter-green" : isRed ? "iter-red" : ""}`} key={iterNum}>
                      <header className="dev-build-iter-header">
                        <strong>Iteratie {iterNum}</strong>
                        {it.exit_code !== undefined ? (
                          <span className={`iter-badge ${isGreen ? "badge-green" : "badge-red"}`}>
                            exit {it.exit_code}{it.timed_out ? " (timeout)" : ""}
                          </span>
                        ) : null}
                        {it.duration_s !== undefined ? <small>{it.duration_s.toFixed(2)}s</small> : null}
                      </header>
                      {it.developer ? (
                        <div className="dev-build-role">
                          <em>De Developper</em>
                          <p>{it.developer}</p>
                        </div>
                      ) : null}
                      {it.files && it.files.length ? (
                        <div className="dev-build-files">
                          {it.files.map((f) => (
                            <span className="dev-build-file-chip" key={f.path} title={f.truncated ? "truncated" : `${f.bytes_written} bytes`}>
                              <code>{f.path}</code>
                              <small>{f.bytes_written}B{f.truncated ? " ⚠" : ""}</small>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {it.tester ? (
                        <div className="dev-build-role">
                          <em>De Tester</em>
                          <p>{it.tester}</p>
                        </div>
                      ) : null}
                      {it.command ? (
                        <pre className="dev-build-cmd">$ {it.command}</pre>
                      ) : null}
                      {it.stdout || it.stderr ? (
                        <details className="dev-build-output">
                          <summary>test-output ({(it.stdout?.length || 0) + (it.stderr?.length || 0)} chars)</summary>
                          {it.stdout ? <pre className="dev-build-stdout">{it.stdout}</pre> : null}
                          {it.stderr ? <pre className="dev-build-stderr">{it.stderr}</pre> : null}
                        </details>
                      ) : null}
                      {it.critic ? (
                        <div className="dev-build-role critic">
                          <em>Criticus</em>
                          <p>{it.critic}</p>
                        </div>
                      ) : null}
                      {it.chair_verdict ? (
                        <div className={`dev-build-role chair-${it.chair_verdict.toLowerCase()}`}>
                          <em>Voorzitter — {it.chair_verdict === "DONE" ? "build af" : "ga door"}</em>
                          {it.chair_reason ? <p>{it.chair_reason}</p> : null}
                          {it.chair_next ? <p className="dev-build-next-subtask"><strong>Volgende stap:</strong> {it.chair_next}</p> : null}
                        </div>
                      ) : null}
                    </section>
                  );
                })}
                {devTeamBuild.finalMessage ? (
                  <div className={`dev-build-final dev-build-final-${devTeamBuild.status}`}>{devTeamBuild.finalMessage}</div>
                ) : null}
                {devTeamBuild.error ? (
                  <div className="dev-build-final dev-build-final-error">{devTeamBuild.error}</div>
                ) : null}
              </article>
            ) : null}

            {devLaunchResult ? (
              <article className="meeting-summary development-command-card">
                <div className="message-meta">
                  <span>Build gestart</span>
                  <span>{String(devLaunchResult.route || devLaunchResult.status || "cockpit")}</span>
                </div>
                <StructuredMeetingText text={String(devLaunchResult.response || devLaunchResult.message || devLaunchResult.reason || "De approval-gated Cockpit workflow is gestart.")} />
              </article>
            ) : null}
            {devLaunchError ? (
              <article className="meeting-turn error">
                <div className="message-meta">
                  <span>Build start</span>
                </div>
                <p>{devLaunchError}</p>
              </article>
            ) : null}
            {devError ? (
              <article className="meeting-turn error">
                <div className="message-meta">
                  <span>Error</span>
                </div>
                <p>{devError}</p>
              </article>
            ) : null}
          </section>
        </div>
      </section>
    );
  }

  return (
    <div className={`app-shell ${viewMode !== "chat" ? "inspector-open" : ""}`}>
      <aside className="icon-rail" aria-label="Primary navigation">
        <div className="rail-brand" title="Ouroboros Chat">
          <img src={ouroborosLogo} alt="" />
        </div>
        <nav className="rail-nav">
          <button
            className={`rail-button ${viewMode === "chat" ? "active" : ""}`}
            type="button"
            aria-label="Chat"
            title="Chat"
            onClick={() => activateRail("chat")}
          >
            <MessageSquare size={22} />
          </button>
          <button
            className={`rail-button ${viewMode === "meeting" ? "active" : ""}`}
            type="button"
            aria-label="Meeting"
            title="Meeting"
            onClick={() => activateRail("meeting")}
          >
            <Users size={22} />
          </button>
          <button
            className={`rail-button ${viewMode === "development_team" ? "active" : ""}`}
            type="button"
            aria-label="Development team"
            title="Development team"
            onClick={() => activateRail("development_team")}
          >
            <Code2 size={22} />
          </button>
          <button
            className={`rail-button ${viewMode === "persona_builder" ? "active" : ""}`}
            type="button"
            aria-label="Persona"
            title="Persona"
            onClick={() => activateRail("persona_builder")}
          >
            <Brain size={22} />
          </button>
          <button
            className={`rail-button ${viewMode === "settings" ? "active" : ""}`}
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={() => activateRail("settings")}
          >
            <Settings size={22} />
          </button>
        </nav>
        <button className="rail-button rail-bottom" type="button" aria-label="Backend" title={backendState.label}>
          {backendState.status === "online" ? <Check size={20} /> : <AlertCircle size={20} />}
        </button>
      </aside>

      <aside className="sidebar" aria-label="Threads">
        <div className="sidebar-top">
          <button className="new-chat-button" type="button" onClick={startNewThread}>
            <Plus size={17} />
            <span>New chat</span>
          </button>
          <div className="search-shell">
            <Search size={15} />
            <input aria-label="Search threads" placeholder="Search" />
          </div>
        </div>

        <div className="persona-sidebar-list">
          <div className="sidebar-section-row">
            <div className="sidebar-section-title">Persona's</div>
            <button type="button" className="sidebar-add-persona" onClick={newPersonaDraft}>
              <Plus size={13} />
              <span>New</span>
            </button>
          </div>
          <button type="button" className="persona-create-card" onClick={newPersonaDraft}>
            <Plus size={16} />
            <span>
              <strong>Nieuwe persona</strong>
              <small>Maak een eigen GPT-achtig profiel</small>
            </span>
          </button>
          {savedPersonas.map((record) => (
            <div
              className={`persona-sidebar-item ${currentChatPersona.id === record.id ? "active" : ""}`}
              key={record.id}
            >
              <button className="persona-sidebar-main" type="button" onClick={() => chatWithPersona(record)}>
                <span className="saved-avatar">
                  {record.avatar?.kind === "image" ? (
                    <img src={uploadUrl(record.avatar.path, record.avatar.filename)} alt="" />
                  ) : (
                    initials(record.name)
                  )}
                </span>
                <span>
                  <strong>{record.name}</strong>
                  <small>{record.role || record.description || record.id}</small>
                </span>
              </button>
              <button
                className="persona-sidebar-action"
                type="button"
                title="Aan vergadertafel"
                aria-label={`${record.name} aan vergadertafel zetten`}
                onClick={() => seatPersonaAtMeeting(record)}
              >
                <Users size={14} />
              </button>
              <button
                className="persona-sidebar-action"
                type="button"
                title="Bewerken"
                aria-label={`${record.name} bewerken`}
                onClick={() => editStoredPersona(record)}
              >
                <Settings size={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="thread-list">
          {threadIds.map((id) => {
            const thread = threadsById[id];
            if (!thread) return null;
            return (
              <button
                className={`thread-item ${thread.id === activeThreadId ? "active" : ""}`}
                key={thread.id}
                type="button"
                onClick={() => void openConversation(thread.id)}
              >
                <span className="thread-title">{thread.title}</span>
                <span className="thread-subtitle">{thread.subtitle}</span>
              </button>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <span className={`status-dot ${backendState.status}`} />
          <span>{backendState.status === "online" ? "Backend online" : "Backend offline"}</span>
        </div>
      </aside>

      <main className={`chat-main ${viewMode === "meeting" || viewMode === "development_team" ? "meeting-main" : ""}`}>
        {viewMode === "meeting" ? (
          renderMeetingWorkspace()
        ) : viewMode === "development_team" ? (
          renderDevelopmentTeamWorkspace()
        ) : (
          <>
        <header className="chat-header">
          <div className="chat-title-group">
            <span className="eyebrow">Ouroboros Chat</span>
            <h1>{currentThread?.title || "Local Ouroboros"}</h1>
          </div>
          <div className="chat-controls" aria-label="Model controls">
            <label className="compact-field">
              <span>Provider</span>
              <select
                value={currentProvider}
                onChange={(event) => {
                  const option = modelOptions.find((item) => item.id === event.target.value);
                  const nextModel = option?.default_model || option?.models[0] || currentModel;
                  setProvider(event.target.value);
                  setModel(nextModel);
                  updateCurrentThreadSettings({ provider: event.target.value, modelName: nextModel });
                }}
              >
                {modelOptions.map((option) => (
                  <option value={option.id} key={option.id}>
                    {providerOptionLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-field model-field">
              <span>Model</span>
              <select
                ref={modelInputRef}
                value={currentModel}
                onChange={(event) => {
                  setModel(event.target.value);
                  updateCurrentThreadSettings({ modelName: event.target.value });
                }}
              >
                {currentModelChoices.map((item) => (
                  <option value={item} key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <section className="message-thread" aria-label="Chat thread">
          {messages.map((message) => (
            <article className={`message-row ${message.role}`} key={message.id}>
              <div className="message-avatar" aria-hidden="true">
                {message.role === "assistant" ? <Bot size={18} /> : <span>U</span>}
              </div>
              <div className="message-bubble">
                <div className="message-meta">
                  <span>{message.role === "assistant" ? currentChatPersona.name : "You"}</span>
                  <span>{formatTime(message.createdAt)}</span>
                  {message.meta?.route ? <span>{message.meta.route}</span> : null}
                </div>
                {message.status === "pending" ? (
                  <div className="pending-line">
                    <Loader2 size={16} />
                    <span>Thinking</span>
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
                {message.attachments?.length ? (
                  <div className="message-attachments">
                    {message.attachments.map((attachment) => (
                      <span className="mini-attachment" key={attachment.id}>
                        {attachmentIcon(attachment.kind)}
                        {attachment.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))}
          <div ref={threadEndRef} />
        </section>

        <section className="composer-zone" aria-label="Message composer">
          {attachments.length ? (
            <div className="attachment-tray">
              {attachments.map((attachment) => (
                <div className={`attachment-chip ${attachment.status}`} key={attachment.id}>
                  {attachmentIcon(attachment.kind)}
                  <div>
                    <strong>{attachment.name}</strong>
                    <span>
                      {attachment.status === "uploading"
                        ? "Uploading"
                        : attachment.status === "error"
                          ? attachment.error || "Upload failed"
                          : formatBytes(attachment.size)}
                    </span>
                  </div>
                  <button type="button" aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="composer-shell">
            {slashVisible ? (
              <div className="slash-menu" role="listbox" aria-label="Slash commands">
                {filteredSlashOptions.slice(0, 8).map((option, index) => (
                  <button
                    className={index === slashIndex ? "highlighted" : ""}
                    key={option.command}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSlashOption(option);
                    }}
                  >
                    <Command size={16} />
                    <span>
                      <strong>{option.command}</strong>
                      <small>{option.description}</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                ))}
              </div>
            ) : null}

            <textarea
              ref={composerRef}
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                if (event.target.value.startsWith("/")) {
                  setSlashOpen(true);
                }
              }}
              onFocus={() => {
                if (prompt.startsWith("/")) {
                  setSlashOpen(true);
                }
              }}
              onKeyDown={handleComposerKeyDown}
              placeholder="Ask Ouroboros or type /"
              rows={1}
            />
            <div className="composer-actions">
              <input
                ref={fileInputRef}
                className="file-input"
                type="file"
                multiple
                accept=".txt,.md,.pdf,.docx,.json,.yaml,.yml,.csv,.toml,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.cpp,.cc,.c,.h,.hpp,.css,.html,.sql,.sh,.png,.jpg,.jpeg,.webp"
                onChange={(event) => void handleFiles(event.target.files)}
              />
              <button
                className="icon-button"
                type="button"
                aria-label="Attach files"
                title="Attach files"
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip size={18} />
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="Slash commands"
                title="Slash commands"
                onClick={() => {
                  setPrompt((current) => (current.startsWith("/") ? current : "/"));
                  setSlashOpen(true);
                  window.setTimeout(() => composerRef.current?.focus(), 0);
                }}
              >
                <Command size={18} />
              </button>
              <button
                className="send-button"
                type="button"
                aria-label="Send"
                title="Send"
                disabled={isSending || (!prompt.trim() && !readyFilePaths.length)}
                onClick={() => void sendMessage()}
              >
                {isSending ? <Loader2 size={19} /> : <Send size={19} />}
              </button>
            </div>
          </div>
        </section>
          </>
        )}
      </main>

      <aside className="inspector" aria-label="Persona and meeting panels">
        <section ref={personaPanelRef} className={`panel persona-panel ${viewMode === "persona_builder" ? "active-panel" : ""}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Persona</span>
              <h2>{builderTitle}</h2>
            </div>
            <button className="mini-action" type="button" onClick={newPersonaDraft} title="Nieuwe persona">
              <Plus size={16} />
            </button>
          </div>
          <div className="persona-avatar-row">
            <button
              className="persona-avatar"
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              title="Avatar kiezen"
              style={{ backgroundColor: draftPersona.avatar.kind === "initials" ? draftPersona.avatar.color : undefined }}
            >
              {draftPersona.avatar.kind === "image" && draftPersonaAvatarSrc ? (
                <img src={draftPersonaAvatarSrc} alt="" />
              ) : (
                <span>{initials(draftPersona.name)}</span>
              )}
            </button>
            <div>
              <strong>{draftPersona.avatar.kind === "image" ? draftPersona.avatar.filename || "Avatar" : "Initialen"}</strong>
              <span>{draftPersona.knowledgeFiles.length} kennisbestand(en)</span>
            </div>
            <input
              ref={avatarInputRef}
              className="file-input"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={(event) => void uploadPersonaAvatar(event.target.files)}
            />
          </div>
          <label className="field">
            <span>Name</span>
            <input ref={personaNameRef} value={draftPersona.name} onChange={(event) => setDraftPersona({ ...draftPersona, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Description</span>
            <input value={draftPersona.description} onChange={(event) => setDraftPersona({ ...draftPersona, description: event.target.value })} />
          </label>
          <label className="field">
            <span>Role / purpose</span>
            <input value={draftPersona.role} onChange={(event) => setDraftPersona({ ...draftPersona, role: event.target.value })} />
          </label>
          <label className="field">
            <span>Introduction</span>
            <input value={draftPersona.introduction} onChange={(event) => setDraftPersona({ ...draftPersona, introduction: event.target.value })} />
          </label>
          <label className="field">
            <span>Tone</span>
            <input value={draftPersona.tone} onChange={(event) => setDraftPersona({ ...draftPersona, tone: event.target.value })} />
          </label>
          <label className="field">
            <span>Language</span>
            <input value={draftPersona.language} onChange={(event) => setDraftPersona({ ...draftPersona, language: event.target.value })} />
          </label>
          <label className="field">
            <span>Model</span>
            <select
              value={draftPersona.modelSettings.name}
              onChange={(event) =>
                setDraftPersona({
                  ...draftPersona,
                  model: event.target.value,
                  modelSettings: { ...draftPersona.modelSettings, name: event.target.value },
                })
              }
            >
              {draftModelChoices.map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="two-col-fields">
            <label className="field">
              <span>Provider</span>
              <select
                value={draftPersona.modelSettings.provider}
                onChange={(event) => {
                  const option = modelOptions.find((item) => item.id === event.target.value);
                  const nextModel = option?.default_model || option?.models[0] || draftPersona.modelSettings.name;
                  setDraftPersona({
                    ...draftPersona,
                    model: nextModel,
                    modelSettings: { ...draftPersona.modelSettings, provider: event.target.value, name: nextModel },
                  });
                }}
              >
                {modelOptions.map((option) => (
                  <option value={option.id} key={option.id}>
                    {providerOptionLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Temperature</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={draftPersona.modelSettings.temperature}
                onChange={(event) =>
                  setDraftPersona({ ...draftPersona, modelSettings: { ...draftPersona.modelSettings, temperature: Number(event.target.value) } })
                }
              />
            </label>
          </div>
          <label className="field">
            <span>Memory</span>
            <select
              value={draftPersona.memoryEnabled ? draftPersona.memoryMode : "off"}
              onChange={(event) =>
                setDraftPersona({
                  ...draftPersona,
                  memoryEnabled: event.target.value !== "off",
                  memoryMode: event.target.value as Persona["memoryMode"],
                })
              }
            >
              <option value="off">off</option>
              <option value="light">light</option>
              <option value="full">full</option>
            </select>
          </label>
          <label className="field">
            <span>Rules</span>
            <textarea
              value={draftPersona.rules.join("\n")}
              onChange={(event) => setDraftPersona({ ...draftPersona, rules: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean) })}
              rows={3}
            />
          </label>
          <label className="field">
            <span>Instruction prompt</span>
            <textarea
              value={draftPersona.systemPrompt}
              onChange={(event) => setDraftPersona({ ...draftPersona, systemPrompt: event.target.value })}
              rows={5}
            />
          </label>
          <div className="tool-grid">
            <div className="panel-subheading">
              <strong>Tools</strong>
            </div>
            {Object.entries(draftPersona.tools).map(([toolId, enabled]) => (
              <label className="tool-toggle" key={toolId}>
                <input type="checkbox" checked={enabled} onChange={(event) => setTool(toolId, event.target.checked)} />
                <span>{toolId.replace(/_/g, " ")}</span>
              </label>
            ))}
          </div>
          <div className="memory-block">
            <div className="panel-subheading">
              <strong>Memory</strong>
              <button className="mini-action" type="button" onClick={() => void addMemory()} title="Memory opslaan" disabled={!draftPersona.id}>
                <Plus size={15} />
              </button>
            </div>
            <textarea
              value={memoryDraft}
              onChange={(event) => setMemoryDraft(event.target.value)}
              placeholder="Stable fact, preference, project context..."
              rows={2}
            />
            <div className="memory-list">
              {memoryItems.length ? (
                memoryItems.slice(0, 6).map((item) => (
                  <div className="memory-item" key={item.id}>
                    <span>{item.content}</span>
                    <button type="button" onClick={() => void deleteMemory(item.id)} aria-label="Delete memory">
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <span className="empty-note">Geen persona-memory</span>
              )}
            </div>
          </div>
          <div className="knowledge-block">
            <div className="panel-subheading">
              <strong>Kennis</strong>
              <button className="mini-action" type="button" onClick={() => knowledgeInputRef.current?.click()} title="Kennisbestanden toevoegen">
                <Paperclip size={15} />
              </button>
              <input
                ref={knowledgeInputRef}
                className="file-input"
                type="file"
                multiple
                accept=".txt,.md,.pdf,.docx,.json,.yaml,.yml,.csv,.toml,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.cpp,.cc,.c,.h,.hpp,.css,.html,.sql,.sh"
                onChange={(event) => void uploadPersonaKnowledge(event.target.files)}
              />
            </div>
            <div className="knowledge-link-row">
              <input
                value={knowledgeLinkDraft}
                onChange={(event) => setKnowledgeLinkDraft(event.target.value)}
                placeholder="https://bron.example/artikel"
              />
              <button type="button" onClick={addPersonaKnowledgeLink} disabled={!knowledgeLinkDraft.trim()}>
                <Plus size={14} />
              </button>
            </div>
            <div className="knowledge-list">
              {draftPersona.knowledgeFiles.length ? (
                draftPersona.knowledgeFiles.map((file) => (
                  <div className="knowledge-file" key={file.path}>
                    <FileText size={15} />
                    <span>{file.label || file.filename || file.path}</span>
                    <button type="button" onClick={() => removePersonaKnowledge(file.path)} aria-label={`Remove ${file.label}`}>
                      <X size={14} />
                    </button>
                  </div>
                ))
              ) : (
                <span className="empty-note">Geen kennisbestanden</span>
              )}
              {draftPersona.knowledgeSources.map((source) => (
                <div className="knowledge-file" key={source.url}>
                  <Globe2 size={15} />
                  <span>{source.label || source.url}</span>
                  <button type="button" onClick={() => removePersonaKnowledgeLink(source.url)} aria-label={`Remove ${source.label || source.url}`}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <span className="empty-note">
              Web search: {draftPersona.tools.web_search ? braveConfigured ? "Brave actief" : "Brave key ontbreekt in Cockpit" : "uit voor deze persona"}
            </span>
          </div>
          <button className="meeting-action" type="button" onClick={() => void savePersona()} disabled={personaSaving}>
            {personaSaving ? <Loader2 size={17} /> : <Check size={17} />}
            <span>{builderMode === "edit" && draftPersona.id ? "Save changes" : "Create persona"}</span>
          </button>
          <div className="persona-actions">
            <button type="button" onClick={() => void savePersona({ asNew: true })} disabled={personaSaving}>
              Save as new
            </button>
            <button type="button" onClick={() => void useDraftInChat()} disabled={!draftPersona.id}>
              Use in new chat
            </button>
            <button
              type="button"
              onClick={() => {
                const record = draftPersona.id ? personasById[draftPersona.id] : undefined;
                if (record) {
                  seatPersonaAtMeeting(record);
                }
              }}
              disabled={!draftPersona.id || !personasById[draftPersona.id]}
            >
              Add to meeting
            </button>
            <button type="button" onClick={() => void duplicatePersona()} disabled={!draftPersona.id}>
              Duplicate
            </button>
            <button type="button" onClick={() => void exportPersona()} disabled={!draftPersona.id}>
              Export
            </button>
            <button type="button" onClick={() => importPersonaRef.current?.click()}>
              Import
            </button>
            <button type="button" onClick={() => void deletePersona()} disabled={!draftPersona.id || draftPersona.id === "ouroboros"}>
              Delete
            </button>
            <input
              ref={importPersonaRef}
              className="file-input"
              type="file"
              accept=".json,application/json"
              onChange={(event) => void importPersona(event.target.files)}
            />
          </div>
          {personaNotice ? <div className="persona-notice">{personaNotice}</div> : null}
          <div className="saved-personas">
            {savedPersonas.map((record) => (
              <button className="saved-persona" type="button" key={record.id} onClick={() => editStoredPersona(record)}>
                <span className="saved-avatar">
                  {record.avatar?.kind === "image" ? (
                    <img src={uploadUrl(record.avatar.path, record.avatar.filename)} alt="" />
                  ) : (
                    initials(record.name)
                  )}
                </span>
                <span>
                  <strong>{record.name}</strong>
                  <small>{record.description || record.id}</small>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section ref={meetingPanelRef} className={`panel meeting-panel ${viewMode === "meeting" ? "active-panel" : ""}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Meeting</span>
              <h2>Persona table</h2>
            </div>
            <Users size={18} />
          </div>
          <label className="field">
            <span>Topic</span>
            <textarea ref={meetingTopicRef} value={meetingTopic} onChange={(event) => updateMeetingTopic(event.target.value)} rows={3} />
          </label>
          <div className="member-list">
            <div className="member-section-label">
              <span>Persona's</span>
              <small>{selectedPersonaMembers.length} selected</small>
            </div>
            {personaMeetingMembers.length ? personaMeetingMembers.map((member) => (
              <button
                className={`member-row ${member.selected ? "selected" : ""}`}
                key={member.id}
                type="button"
                onClick={() => toggleMeetingMember(member.id)}
              >
                <span
                  className={`member-avatar ${member.online ? "online" : ""}`}
                  style={{ backgroundColor: member.avatar?.kind === "initials" ? member.avatar.color : undefined }}
                >
                  {member.avatar?.kind === "image" ? (
                    <img src={uploadUrl(member.avatar.path, member.avatar.filename)} alt="" />
                  ) : (
                    initials(member.name)
                  )}
                </span>
                <span>
                  <strong>{member.name}</strong>
                  <small>persona</small>
                </span>
                {member.selected ? <Check size={16} /> : <Plus size={16} />}
              </button>
            )) : <span className="empty-note">Maak eerst een persona aan.</span>}
            <div className="member-section-label secondary">
              <span>Agents voor vervolgtaken</span>
              <small>{selectedAgentMembers.length} selected</small>
            </div>
            {agentMeetingMembers.map((member) => (
              <button
                className={`member-row secondary ${member.selected ? "selected" : ""}`}
                key={member.id}
                type="button"
                onClick={() => toggleMeetingMember(member.id)}
              >
                <span className={`member-avatar ${member.online ? "online" : ""}`}>
                  {initials(member.name)}
                </span>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.handle}</small>
                </span>
                {member.selected ? <Check size={16} /> : <Plus size={16} />}
              </button>
            ))}
          </div>
          <div className="meeting-actions">
            <button className="meeting-action" type="button" onClick={() => void startPersonaMeeting()} disabled={meetingRunning || selectedPersonaMembers.length === 0}>
              {meetingRunning ? <Loader2 size={17} /> : <Users size={17} />}
              <span>Start meeting</span>
            </button>
            <button className="meeting-action secondary" type="button" onClick={insertMeetingPrompt}>
              <Sparkles size={17} />
              <span>Agent task</span>
            </button>
            <button className="meeting-action secondary" type="button" onClick={() => continueMeetingInDevelopmentTeam(true)} disabled={!activeMeeting?.summary || devRunning}>
              {devRunning ? <Loader2 size={17} /> : <Code2 size={17} />}
              <span>Dev workflow</span>
            </button>
          </div>
          {activeMeetingId && meetingsById[activeMeetingId]?.transcript ? (
            <div className="meeting-transcript">
              <div className="panel-subheading">
                <strong>Transcript</strong>
              </div>
              <textarea
                readOnly
                value={meetingsById[activeMeetingId].transcript}
                rows={10}
                style={{ width: "100%", marginTop: "8px" }}
              />
            </div>
          ) : null}
        </section>

        <section ref={statusPanelRef} className={`panel status-panel ${viewMode === "settings" ? "active-panel" : ""}`}>
          <div className="metric-row">
            <span>Backend</span>
            <strong>{backendState.status}</strong>
          </div>
          <div className="metric-row">
            <span>Endpoint</span>
            <strong>{BACKEND_BASE.replace(/^https?:\/\//, "")}</strong>
          </div>
          <div className="metric-row">
            <span>Files</span>
            <strong>{readyFilePaths.length}</strong>
          </div>
          <div className="metric-row">
            <span>ChatGPT-Codex</span>
            <strong>{chatgptCodexOption?.configured ? "linked" : "not linked"}</strong>
          </div>
          <div className="metric-row">
            <span>Table</span>
            <strong>{selectedPersonaMembers.length}</strong>
          </div>
          <div className="voice-row">
            <Mic size={16} />
            <span>Voice bridge idle</span>
            <PanelRight size={16} />
          </div>
        </section>
      </aside>
    </div>
  );
}

export default App;

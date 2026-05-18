import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  AlertCircle,
  Bot,
  Brain,
  Check,
  ChevronRight,
  Code2,
  Command,
  FileText,
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
};

type PersonaKnowledgeFile = {
  path: string;
  label: string;
  filename?: string;
  size?: number;
  kind?: string;
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

type ViewMode = "chat" | "persona_builder" | "meeting" | "settings";
type BuilderMode = "create" | "edit" | null;
type ThreadType = "neutral" | "persona";
type MeetingStatus = "draft" | "running" | "completed" | "error";

type Meeting = {
  id: string;
  topic: string;
  personaIds: string[];
  agentIds: string[];
  transcript?: string;
  status: MeetingStatus;
  updatedAt: string;
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
    `Persona: ${persona.name}. Tone: ${persona.tone}. Language: ${persona.language}. Memory: ${persona.memoryEnabled ? persona.memoryMode : "off"}.`,
  ].filter(Boolean);
  return parts.join("\n");
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

  // Meeting specific workspace state
  const [meetingRunning, setMeetingRunning] = useState(false);
  const [meetingMembers, setMeetingMembers] = useState<MeetingMember[]>(INITIAL_MEMBERS);
  const [meetingTopic, setMeetingTopic] = useState("Review this thread and propose next actions.");

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
  const modelInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const currentThread = threadsById[activeThreadId];
  const messages = currentThread?.messages || [];
  const savedPersonas = useMemo(() => Object.values(personasById).sort((left, right) => timestampValue(right.updated_at || right.created_at) - timestampValue(left.updated_at || left.created_at)), [personasById]);

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
  const draftPersonaAvatarSrc = draftPersona.avatar.previewUrl || uploadUrl(draftPersona.avatar.path, draftPersona.avatar.filename);
  const builderTitle =
    builderMode === "create"
      ? "Create persona"
      : builderMode === "edit"
        ? `Edit ${draftPersona.name || "persona"}`
        : "Persona builder";

  useEffect(() => {
    let cancelled = false;

    fetchJson<Record<string, unknown>>("/api/cockpit/config")
      .then((payload) => {
        if (!cancelled) {
          const status = String(payload.status || "online");
          setBackendState({ status: "online", label: status });
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setBackendState({ status: "offline", label: error.message || "offline" });
        }
      });

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

    loadPersonas().catch(() => {
      if (!cancelled) {
        setPersonasById({});
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, activeThreadId, isSending]);

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
        .map((record) => memberFromPersona(record, previousSelected.get(record.id) ?? record.id === selectedPersonaId));
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
          knowledge_sources: draftPersona.knowledgeFiles,
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
          personaIds: [],
          agentIds: [],
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
      const message = error instanceof Error ? error.message : "Chat request failed";
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
    const topic = meetingTopic.trim() || "Review this thread and propose next actions.";
    setPrompt(`/agents ${topic} Persona meeting: ${personaNames || "geen persona's geselecteerd"}. Follow-up agents: ${handles || "none"}.`);
    setSlashOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function startPersonaMeeting() {
    const topic = meetingTopic.trim() || "Review this thread and propose next actions.";
    const participants = selectedPersonaMembers.map((member) => member.id);
    if (!participants.length || meetingRunning) return;
    setMeetingRunning(true);
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
        personaIds: participants,
        agentIds: selectedAgentMembers.map((m) => m.id),
        status: "running",
        updatedAt: nowIso(),
        transcript: "Meeting started... Waiting for responses...\n"
      }
    }));

    try {
      const result = await fetchJson<Record<string, unknown>>("/api/ouroboros-chat/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          participants,
          model: model || DEFAULT_MODEL,
          provider: DEFAULT_PROVIDER,
          tools: [],
          allow_tools: false,
        }),
      });
      const events = Array.isArray(result.events) ? result.events : [];
      const notes = events
        .map((event) => asRecord(event))
        .filter(Boolean)
        .map((event) => {
          const participant = asRecord(event?.participant);
          const who = participant?.name || event?.type || "meeting";
          return `${who}: ${event?.content || event?.topic || ""}`.trim();
        })
        .filter(Boolean)
        .join("\n\n");
      const agentFollowUp = selectedAgentMembers.length
        ? `\n\nFollow-up agents selected for tasks after the meeting: ${selectedAgentMembers.map((member) => member.handle).join(", ")}. Use the Agent task button to prepare an approval-gated task prompt.`
        : "";
      const content = `${notes || extractResponseText(result)}${agentFollowUp}`;

      setMeetingsById((prev) => ({
        ...prev,
        [meetingId as string]: {
          ...prev[meetingId as string],
          status: "completed",
          transcript: content,
          updatedAt: nowIso(),
        }
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Meeting failed";
      setMeetingsById((prev) => ({
        ...prev,
        [meetingId as string]: {
          ...prev[meetingId as string],
          status: "error",
          transcript: `Error: ${message}`,
          updatedAt: nowIso(),
        }
      }));
    } finally {
      setMeetingRunning(false);
    }
  }

  function toggleMeetingMember(id: string) {
    setMeetingMembers((previous) =>
      previous.map((member) => (member.id === id ? { ...member, selected: !member.selected } : member)),
    );
  }

  function activateRail(target: ViewMode) {
    if (target === "meeting") {
      openMeetingTable();
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

      <main className="chat-main">
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
                  setProvider(event.target.value);
                  updateCurrentThreadSettings({ provider: event.target.value });
                }}
              >
                <option value="ollama">ollama</option>
                <option value="ouroboros">ouroboros</option>
                <option value="roo">roo</option>
                <option value="openai">openai</option>
                <option value="anthropic">anthropic</option>
                <option value="google">google</option>
              </select>
            </label>
            <label className="compact-field model-field">
              <span>Model</span>
              <input
                ref={modelInputRef}
                value={currentModel}
                onChange={(event) => {
                  setModel(event.target.value);
                  updateCurrentThreadSettings({ modelName: event.target.value });
                }}
              />
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
            <input
              value={draftPersona.modelSettings.name}
              onChange={(event) =>
                setDraftPersona({
                  ...draftPersona,
                  model: event.target.value,
                  modelSettings: { ...draftPersona.modelSettings, name: event.target.value },
                })
              }
            />
          </label>
          <div className="two-col-fields">
            <label className="field">
              <span>Provider</span>
              <select
                value={draftPersona.modelSettings.provider}
                onChange={(event) => setDraftPersona({ ...draftPersona, modelSettings: { ...draftPersona.modelSettings, provider: event.target.value } })}
              >
                <option value="ollama">ollama</option>
                <option value="openai">openai</option>
                <option value="anthropic">anthropic</option>
                <option value="google">google</option>
                <option value="local">local</option>
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
            </div>
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
              Use in chat
            </button>
            <button type="button" onClick={() => { if (draftPersona.id) { seatPersonaAtMeeting(personasById[draftPersona.id] || draftPersona); } }} disabled={!draftPersona.id}>
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
            <textarea ref={meetingTopicRef} value={meetingTopic} onChange={(event) => setMeetingTopic(event.target.value)} rows={3} />
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

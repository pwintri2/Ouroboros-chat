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
  title: string;
  subtitle: string;
  updatedAt: string;
};

type Persona = {
  id?: string;
  name: string;
  description: string;
  tone: string;
  memoryMode: "off" | "light" | "full";
  systemPrompt: string;
  model: string;
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
  instructions?: string;
  system_prompt?: string;
  model?: string;
  avatar?: Persona["avatar"];
  knowledge_files?: PersonaKnowledgeFile[];
  archived?: boolean;
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

type RailTarget = "chat" | "meeting" | "persona" | "settings";

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
  { id: "codex", name: "Codex", handle: "/codex", selected: true, online: true, source: "agent" },
  { id: "roo", name: "Roo", handle: "/roo", selected: true, online: true, source: "agent" },
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

function makeWelcomeMessage(): ChatMessage {
  return {
    id: "assistant-welcome",
    role: "assistant",
    content:
      "Ouroboros Chat is connected to the local cockpit contract. Default motor: ollama / ouroboros:latest.",
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

function defaultPersona(): Persona {
  return {
    id: undefined,
    name: "Ouroboros",
    description: "Lokale Ouroboros persona",
    tone: "Grounded, practical, inspectable",
    memoryMode: "light",
    systemPrompt:
      "Stay grounded, auditable, reversible, and safe. Treat symbolic language as metaphor unless the user explicitly asks for documentation tone.",
    model: DEFAULT_MODEL,
    avatar: { kind: "initials", color: "#7bdcc3" },
    knowledgeFiles: [],
  };
}

function personaFromStored(record: StoredPersona): Persona {
  return {
    id: record.id,
    name: record.name || "Ouroboros",
    description: record.description || "",
    tone: "Grounded, practical, inspectable",
    memoryMode: "light",
    systemPrompt: record.instructions || record.system_prompt || "",
    model: record.model || DEFAULT_MODEL,
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
    persona.description ? `Description: ${persona.description}` : "",
    persona.knowledgeFiles.length
      ? `Knowledge files available: ${persona.knowledgeFiles.map((file) => file.label || file.filename || file.path).join(", ")}.`
      : "",
    `Persona: ${persona.name}. Tone: ${persona.tone}. Memory mode: ${persona.memoryMode}.`,
  ].filter(Boolean);
  return parts.join("\n");
}

function App() {
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [activeRail, setActiveRail] = useState<RailTarget>("chat");
  const [slashOptions, setSlashOptions] = useState<SlashOption[]>(FALLBACK_SLASH_OPTIONS);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const [backendState, setBackendState] = useState<BackendState>({
    status: "checking",
    label: "checking",
  });
  const [persona, setPersona] = useState<Persona>(() => defaultPersona());
  const [savedPersonas, setSavedPersonas] = useState<StoredPersona[]>([]);
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaNotice, setPersonaNotice] = useState("");
  const [meetingRunning, setMeetingRunning] = useState(false);
  const [meetingMembers, setMeetingMembers] = useState<MeetingMember[]>(INITIAL_MEMBERS);
  const [meetingTopic, setMeetingTopic] = useState("Review this thread and propose next actions.");
  const [currentThreadId, setCurrentThreadId] = useState(INITIAL_THREAD_ID);
  const [threads, setThreads] = useState<ChatThread[]>([
    {
      id: INITIAL_THREAD_ID,
      title: "Local Ouroboros",
      subtitle: `${DEFAULT_PROVIDER} / ${DEFAULT_MODEL}`,
      updatedAt: nowIso(),
    },
  ]);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, ChatMessage[]>>({
    [INITIAL_THREAD_ID]: [makeWelcomeMessage()],
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const knowledgeInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const personaPanelRef = useRef<HTMLElement>(null);
  const personaNameRef = useRef<HTMLInputElement>(null);
  const meetingPanelRef = useRef<HTMLElement>(null);
  const meetingTopicRef = useRef<HTMLTextAreaElement>(null);
  const statusPanelRef = useRef<HTMLElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const messages = messagesByThread[currentThreadId] || [];
  const currentThread = threads.find((thread) => thread.id === currentThreadId) || threads[0];
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
  const selectedMembers = meetingMembers.filter((member) => member.selected);
  const personaAvatarSrc = persona.avatar.previewUrl || uploadUrl(persona.avatar.path, persona.avatar.filename);

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
        setSavedPersonas([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, currentThreadId, isSending]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery, slashOptions.length]);

  function mergeMeetingPersonas(personaRecords: StoredPersona[], selectedPersonaId?: string) {
    setMeetingMembers((previous) => {
      const previousSelected = new Map(previous.map((member) => [member.id, member.selected]));
      const personaMembers = personaRecords
        .filter((record) => !record.archived)
        .map((record) => memberFromPersona(record, previousSelected.get(record.id) ?? record.id === selectedPersonaId));
      return [
        ...INITIAL_MEMBERS.map((member) => ({
          ...member,
          selected: previousSelected.get(member.id) ?? member.selected,
        })),
        ...personaMembers,
      ];
    });
  }

  async function loadPersonas() {
    const payload = await fetchJson<{ personas?: StoredPersona[] }>("/api/ouroboros-chat/personas");
    const records = (payload.personas || []).filter((record) => record.id && !record.archived);
    setSavedPersonas(records);
    mergeMeetingPersonas(records);
    if (!persona.id && records.length) {
      const first = records.find((record) => record.id === "ouroboros") || records[0];
      setPersona(personaFromStored(first));
    }
  }

  function updateCurrentMessages(updater: (current: ChatMessage[]) => ChatMessage[]) {
    setMessagesByThread((previous) => {
      const current = previous[currentThreadId] || [];
      return {
        ...previous,
        [currentThreadId]: updater(current),
      };
    });
  }

  function startNewThread() {
    const id = uid("thread");
    const thread: ChatThread = {
      id,
      title: "New thread",
      subtitle: `${provider} / ${model}`,
      updatedAt: nowIso(),
    };
    setThreads((previous) => [thread, ...previous]);
    setMessagesByThread((previous) => ({ ...previous, [id]: [makeWelcomeMessage()] }));
    setCurrentThreadId(id);
    setPrompt("");
    setAttachments([]);
    setSlashOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function updateThreadAfterSend(threadId: string, text: string) {
    setThreads((previous) =>
      previous.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }
        const shortTitle = text.trim().replace(/\s+/g, " ").slice(0, 42);
        return {
          ...thread,
          title: thread.title === "New thread" || thread.title === "Local Ouroboros" ? shortTitle || thread.title : thread.title,
          subtitle: `${provider} / ${model}`,
          updatedAt: nowIso(),
        };
      }),
    );
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
      setPersona((current) => ({
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
      setPersona((current) => ({
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
    setPersona((current) => ({
      ...current,
      knowledgeFiles: current.knowledgeFiles.filter((file) => file.path !== path),
    }));
  }

  async function savePersona() {
    if (!persona.name.trim() || personaSaving) return;
    setPersonaSaving(true);
    setPersonaNotice("Persona opslaan...");
    try {
      const payload = await fetchJson<{ persona: StoredPersona }>("/api/ouroboros-chat/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: persona.id,
          name: persona.name,
          description: persona.description,
          instructions: persona.systemPrompt,
          system_prompt: persona.systemPrompt,
          model: persona.model || model || DEFAULT_MODEL,
          avatar: persona.avatar,
          knowledge_files: persona.knowledgeFiles,
          capabilities: ["memory_search", "agentic_ecosystem_context", "read_file", "search_files"],
          tags: ["custom"],
        }),
      });
      const saved = payload.persona;
      setPersona(personaFromStored(saved));
      setSavedPersonas((previous) => {
        const next = [saved, ...previous.filter((record) => record.id !== saved.id)];
        mergeMeetingPersonas(next, saved.id);
        return next;
      });
      setPersonaNotice("Persona opgeslagen en aan de vergadertafel gezet.");
    } catch (error) {
      setPersonaNotice(error instanceof Error ? error.message : "Persona opslaan mislukt.");
    } finally {
      setPersonaSaving(false);
    }
  }

  function newPersonaDraft() {
    setPersona({
      ...defaultPersona(),
      id: undefined,
      name: "Nieuwe persona",
      description: "",
      systemPrompt: "",
      model: model || DEFAULT_MODEL,
      avatar: { kind: "initials", color: "#f2c97d" },
      knowledgeFiles: [],
    });
    setPersonaNotice("");
    activateRail("persona");
  }

  function editStoredPersona(record: StoredPersona) {
    setPersona(personaFromStored(record));
    setPersonaNotice("");
    activateRail("persona");
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

    const threadId = currentThreadId;
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
      meta: { provider, model, route: "pending" },
    };
    const history = messages
      .filter((message) => message.status !== "pending")
      .map((message) => ({ role: message.role, content: message.content }));

    setPrompt("");
    setSlashOpen(false);
    setAttachments([]);
    setIsSending(true);
    updateThreadAfterSend(threadId, text);
    setMessagesByThread((previous) => ({
      ...previous,
      [threadId]: [...(previous[threadId] || []), userMessage, pendingMessage],
    }));

    try {
      const chatEndpoint = text.startsWith("/") ? "/api/cockpit/chat" : "/api/ouroboros-chat/chat";
      const payload = await fetchJson<unknown>(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          prompt: text,
          conversation_id: threadId,
          history,
          files: readyFilePaths.length ? readyFilePaths : undefined,
          system_prompt: composeSystemPrompt(persona),
          role: persona.name,
          include_tools: text.startsWith("/"),
        }),
      });

      const responseText = extractResponseText(payload);
      const responseMeta = extractMeta(payload) || { provider, model };
      setMessagesByThread((previous) => ({
        ...previous,
        [threadId]: (previous[threadId] || []).map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: responseText,
                status: "ready",
                meta: responseMeta,
              }
            : message,
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat request failed";
      setMessagesByThread((previous) => ({
        ...previous,
        [threadId]: (previous[threadId] || []).map((item) =>
          item.id === assistantId
            ? {
                ...item,
                content: message,
                status: "error",
                meta: { provider, model, route: "error" },
              }
            : item,
        ),
      }));
    } finally {
      setIsSending(false);
      window.setTimeout(() => composerRef.current?.focus(), 0);
    }
  }

  function insertMeetingPrompt() {
    const handles = selectedMembers.map((member) => member.handle).join(", ");
    const topic = meetingTopic.trim() || "Review this thread and propose next actions.";
    setPrompt(`/agents ${topic} Participants: ${handles}`);
    setSlashOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  async function startPersonaMeeting() {
    const topic = meetingTopic.trim() || "Review this thread and propose next actions.";
    const participants = selectedMembers.map((member) => member.id);
    if (!participants.length || meetingRunning) return;
    setMeetingRunning(true);
    setActiveRail("meeting");
    const assistantId = uid("meeting");
    setMessagesByThread((previous) => ({
      ...previous,
      [currentThreadId]: [
        ...(previous[currentThreadId] || []),
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: nowIso(),
          status: "pending",
          meta: { provider: "ouroboros-chat", model, route: "meeting" },
        },
      ],
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
      const content = notes || extractResponseText(result);
      setMessagesByThread((previous) => ({
        ...previous,
        [currentThreadId]: (previous[currentThreadId] || []).map((message) =>
          message.id === assistantId
            ? { ...message, content, status: "ready", meta: { provider: "ouroboros-chat", model, route: "meeting" } }
            : message,
        ),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Meeting failed";
      setMessagesByThread((previous) => ({
        ...previous,
        [currentThreadId]: (previous[currentThreadId] || []).map((item) =>
          item.id === assistantId
            ? { ...item, content: message, status: "error", meta: { provider: "ouroboros-chat", model, route: "meeting" } }
            : item,
        ),
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

  function activateRail(target: RailTarget) {
    setActiveRail(target);
    window.setTimeout(() => {
      if (target === "chat") {
        threadEndRef.current?.scrollIntoView({ block: "end" });
        composerRef.current?.focus();
        return;
      }
      if (target === "persona") {
        personaPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        personaNameRef.current?.focus();
        return;
      }
      if (target === "meeting") {
        meetingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        meetingTopicRef.current?.focus();
        return;
      }
      statusPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      modelInputRef.current?.focus();
    }, 0);
  }

  return (
    <div className={`app-shell ${activeRail !== "chat" ? "inspector-open" : ""}`}>
      <aside className="icon-rail" aria-label="Primary navigation">
        <div className="rail-brand" title="Ouroboros Chat">
          <img src={ouroborosLogo} alt="" />
        </div>
        <nav className="rail-nav">
          <button
            className={`rail-button ${activeRail === "chat" ? "active" : ""}`}
            type="button"
            aria-label="Chat"
            title="Chat"
            onClick={() => activateRail("chat")}
          >
            <MessageSquare size={22} />
          </button>
          <button
            className={`rail-button ${activeRail === "meeting" ? "active" : ""}`}
            type="button"
            aria-label="Meeting"
            title="Meeting"
            onClick={() => activateRail("meeting")}
          >
            <Users size={22} />
          </button>
          <button
            className={`rail-button ${activeRail === "persona" ? "active" : ""}`}
            type="button"
            aria-label="Persona"
            title="Persona"
            onClick={() => activateRail("persona")}
          >
            <Brain size={22} />
          </button>
          <button
            className={`rail-button ${activeRail === "settings" ? "active" : ""}`}
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

        <div className="thread-list">
          {threads.map((thread) => (
            <button
              className={`thread-item ${thread.id === currentThreadId ? "active" : ""}`}
              key={thread.id}
              type="button"
              onClick={() => setCurrentThreadId(thread.id)}
            >
              <span className="thread-title">{thread.title}</span>
              <span className="thread-subtitle">{thread.subtitle}</span>
            </button>
          ))}
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
              <select value={provider} onChange={(event) => setProvider(event.target.value)}>
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
              <input ref={modelInputRef} value={model} onChange={(event) => setModel(event.target.value)} />
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
                  <span>{message.role === "assistant" ? persona.name : "You"}</span>
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
        <section ref={personaPanelRef} className={`panel persona-panel ${activeRail === "persona" ? "active-panel" : ""}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Persona</span>
              <h2>{persona.name}</h2>
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
              style={{ backgroundColor: persona.avatar.kind === "initials" ? persona.avatar.color : undefined }}
            >
              {persona.avatar.kind === "image" && personaAvatarSrc ? (
                <img src={personaAvatarSrc} alt="" />
              ) : (
                <span>{initials(persona.name)}</span>
              )}
            </button>
            <div>
              <strong>{persona.avatar.kind === "image" ? persona.avatar.filename || "Avatar" : "Initialen"}</strong>
              <span>{persona.knowledgeFiles.length} kennisbestand(en)</span>
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
            <input ref={personaNameRef} value={persona.name} onChange={(event) => setPersona({ ...persona, name: event.target.value })} />
          </label>
          <label className="field">
            <span>Description</span>
            <input value={persona.description} onChange={(event) => setPersona({ ...persona, description: event.target.value })} />
          </label>
          <label className="field">
            <span>Tone</span>
            <input value={persona.tone} onChange={(event) => setPersona({ ...persona, tone: event.target.value })} />
          </label>
          <label className="field">
            <span>Model</span>
            <input value={persona.model} onChange={(event) => setPersona({ ...persona, model: event.target.value })} />
          </label>
          <label className="field">
            <span>Memory</span>
            <select
              value={persona.memoryMode}
              onChange={(event) =>
                setPersona({ ...persona, memoryMode: event.target.value as Persona["memoryMode"] })
              }
            >
              <option value="off">off</option>
              <option value="light">light</option>
              <option value="full">full</option>
            </select>
          </label>
          <label className="field">
            <span>Instruction prompt</span>
            <textarea
              value={persona.systemPrompt}
              onChange={(event) => setPersona({ ...persona, systemPrompt: event.target.value })}
              rows={5}
            />
          </label>
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
              {persona.knowledgeFiles.length ? (
                persona.knowledgeFiles.map((file) => (
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
            <span>{persona.id ? "Update persona" : "Create persona"}</span>
          </button>
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

        <section ref={meetingPanelRef} className={`panel meeting-panel ${activeRail === "meeting" ? "active-panel" : ""}`}>
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Meeting</span>
              <h2>Agent table</h2>
            </div>
            <Users size={18} />
          </div>
          <label className="field">
            <span>Topic</span>
            <textarea ref={meetingTopicRef} value={meetingTopic} onChange={(event) => setMeetingTopic(event.target.value)} rows={3} />
          </label>
          <div className="member-list">
            {meetingMembers.map((member) => (
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
                  <small>{member.source === "persona" ? "persona" : member.handle}</small>
                </span>
                {member.selected ? <Check size={16} /> : <Plus size={16} />}
              </button>
            ))}
          </div>
          <div className="meeting-actions">
            <button className="meeting-action" type="button" onClick={() => void startPersonaMeeting()} disabled={meetingRunning || selectedMembers.length === 0}>
              {meetingRunning ? <Loader2 size={17} /> : <Users size={17} />}
              <span>Start meeting</span>
            </button>
            <button className="meeting-action secondary" type="button" onClick={insertMeetingPrompt}>
              <Sparkles size={17} />
              <span>Prompt</span>
            </button>
          </div>
        </section>

        <section ref={statusPanelRef} className={`panel status-panel ${activeRail === "settings" ? "active-panel" : ""}`}>
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
            <strong>{selectedMembers.length}</strong>
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

// Typed client for the Origin API. All requests are same-origin (/api is
// proxied by Next), authenticated by an httpOnly session cookie.

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg).replace(/^Value error, /, "");
  }
  return fallback;
}

async function fail(res: Response): Promise<never> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {}
  throw new ApiError(res.status, detailOf(body, `Request failed (${res.status})`));
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? (init.body !== undefined || init.form ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Cannot reach the Origin server. Check that it is running.");
  }
  if (!res.ok) await fail(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type StreamEvent =
  | { event: "user_message"; message: Message }
  | { event: "assistant_start"; message: Message }
  | { event: "delta"; text: string }
  | { event: "done"; message: Message | null };

/** POST and consume a Server-Sent Events response, calling onEvent per event. */
export async function stream(path: string, body: unknown, onEvent: (e: StreamEvent) => void, signal: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Cannot reach the Origin server. Check that it is running.");
  }
  if (!res.ok || !res.body) await fail(res);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event: ")) event = line.slice(7);
        else if (line.startsWith("data: ")) data += line.slice(6);
      }
      if (event && data) onEvent({ event, ...JSON.parse(data) } as StreamEvent);
    }
  }
}

// ---- types mirrored from the API schemas
export type User = {
  id: string; email: string; display_name: string; role: "owner" | "admin" | "user"; is_active: boolean;
  preferences: { theme?: Theme }; created_at: string; last_login_at: string | null;
};
export type Theme = "light" | "dark" | "system";
export type FileInfo = { id: string; filename: string; content_type: string; size: number; created_at: string };
export type Usage = {
  prompt_tokens?: number; completion_tokens?: number; finish_reason?: string; seconds?: number;
  dropped_messages?: number; attachments_ignored?: string[];
};
export type Message = {
  id: string; role: "user" | "assistant" | "system"; content: string;
  status: "streaming" | "complete" | "cancelled" | "error"; error: string | null; model: string | null;
  usage: Usage; created_at: string; attachments: FileInfo[];
};
export type Conversation = { id: string; title: string; project_id: string | null; pinned: boolean; created_at: string; updated_at: string };
export type ConversationDetail = Conversation & { messages: Message[] };
export type Project = { id: string; name: string; description: string; created_at: string; updated_at: string; conversation_count: number };
export type Memory = { id: string; kind: "preference" | "fact" | "note"; content: string; enabled: boolean; project_id: string | null; created_at: string; updated_at: string };
export type ModelCard = {
  name?: string; preset?: string; parameters?: number; context_length?: number; vocab_size?: number; created_at?: string;
  initialization?: string; capabilities?: string[]; limitations?: string[]; suggested_prompts?: string[];
  training?: { steps?: number; device?: string; train_seconds?: number; val_loss?: number; dataset?: string | string[]; train_examples?: number; hardware?: string };
  evaluation?: { benchmark?: string; accuracy?: number; correct?: number; total?: number; per_task?: Record<string, { accuracy: number; correct: number; total: number }> };
};
export type ModelStatus = { available: boolean; name: string | null; loaded: boolean; error: string | null; reason?: string; card?: ModelCard };
export type ModelInfo = { name: string; size_bytes: number; modified_at: number; card: ModelCard; active: boolean; loaded: boolean };
export type MetricRecord = { event: string; step?: number; loss?: number; train_loss?: number; val_loss?: number; lr?: number; steps_per_sec?: number };
export type Compute = {
  provider: string; billing: string; host: { os: string; arch: string; python: string };
  cpu: { model: string; physical_cores: number | null; logical_cores: number | null; max_mhz: number | null; usage_percent: number; load_average: number[] | null };
  memory: { total_bytes: number; available_bytes: number; used_percent: number };
  disk: { path: string; total_bytes: number; free_bytes: number };
  gpus: { index: number; name: string; memory_total_mb: number | null; memory_used_mb: number | null; utilization_percent: number | null; temperature_c: number | null; driver_version: string }[];
  gpu_note: string | null;
  torch: { version: string; cuda_available: boolean; cuda_device_count: number; mps_available: boolean; threads: number };
  training_device: string;
};
export type AuditEntry = { id: number; created_at: string; user_id: string | null; action: string; target: string; ip: string; detail: Record<string, unknown> };
export type ModuleStatus = { id: string; name: string; status: "available" | "partial" | "planned"; phase: number; note?: string };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(iso: string | number): string {
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function relativeTime(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return formatDate(iso);
}

/** Notify listeners (sidebar, lists) that conversations changed. */
export const CONVERSATIONS_CHANGED = "origin:conversations-changed";
export function notifyConversationsChanged() {
  window.dispatchEvent(new Event(CONVERSATIONS_CHANGED));
}

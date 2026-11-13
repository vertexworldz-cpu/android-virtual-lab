import type { FileInfo } from "./api";

// Hand-off between the dashboard composer and the chat page: the dashboard
// creates the conversation, stashes the first message here, and navigates;
// the chat page takes it and sends it. In-memory on purpose (never persisted).
type Pending = { conversationId: string; content: string; attachments: FileInfo[] };
let pending: Pending | null = null;

export function setPending(p: Pending) {
  pending = p;
}

export function takePending(conversationId: string): Pending | null {
  if (pending?.conversationId !== conversationId) return null;
  const p = pending;
  pending = null;
  return p;
}

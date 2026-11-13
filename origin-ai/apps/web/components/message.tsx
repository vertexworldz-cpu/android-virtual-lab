"use client";

import { Download, FileText, Pencil, RefreshCw } from "lucide-react";
import { useState } from "react";
import type { Message } from "@/lib/api";
import { formatBytes } from "@/lib/api";
import { LogoMark } from "./logo";
import { CopyButton, Markdown } from "./markdown";
import { Button, Textarea } from "./ui";

function Attachments({ message }: { message: Message }) {
  if (!message.attachments.length) return null;
  return (
    <div className="mb-2 flex flex-wrap justify-end gap-2">
      {message.attachments.map((f) => (
        <a key={f.id} href={`/api/v1/files/${f.id}/download`} title={`Download ${f.filename}`}
          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-bg px-2.5 py-1.5 text-[13px] transition-colors hover:border-line-strong">
          <FileText className="size-3.5 shrink-0 text-muted" />
          <span className="truncate">{f.filename}</span>
          <span className="shrink-0 text-xs text-muted">{formatBytes(f.size)}</span>
          <Download className="size-3.5 shrink-0 text-muted" />
        </a>
      ))}
    </div>
  );
}

export function UserMessage({ message, canEdit, onEdit }: { message: Message; canEdit: boolean; onEdit: (content: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  if (editing) {
    return (
      <div className="rounded-2xl border border-line-strong p-3">
        <Textarea autoFocus rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit message" className="border-0 px-1 focus:ring-0" />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="px-1 text-xs text-muted">Later messages will be replaced.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(message.content); }}>Cancel</Button>
            <Button size="sm" variant="primary" disabled={!draft.trim()} onClick={() => { setEditing(false); onEdit(draft.trim()); }}>Send</Button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="group flex flex-col items-end">
      <Attachments message={message} />
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-surface-2 px-4 py-2.5 text-[15px] leading-relaxed">{message.content}</div>
      <div className="mt-1 flex h-7 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <CopyButton text={message.content} />
        {canEdit && (
          <button type="button" onClick={() => { setDraft(message.content); setEditing(true); }}
            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg">
            <Pencil className="size-3.5" /> Edit
          </button>
        )}
      </div>
    </div>
  );
}

export function AssistantMessage({ message, isLast, busy, onRegenerate }: { message: Message; isLast: boolean; busy: boolean; onRegenerate: () => void }) {
  const streaming = message.status === "streaming";
  const u = message.usage ?? {};
  return (
    <div className="group flex gap-3.5">
      <div className="mt-0.5"><LogoMark size={22} /></div>
      <div className="min-w-0 flex-1">
        {message.content ? (
          <div className={streaming ? "caret" : undefined}><Markdown text={message.content} /></div>
        ) : streaming ? (
          <p className="caret text-[15px] leading-relaxed text-muted" aria-live="polite">Thinking</p>
        ) : null}
        {message.status === "error" && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-2.5 text-[13px] leading-relaxed text-danger">{message.error ?? "Generation failed."}</p>
        )}
        {message.status === "cancelled" && <p className="mt-1.5 text-xs text-muted">Stopped.</p>}
        {!!u.attachments_ignored?.length && (
          <p className="mt-2 text-xs text-warn">Not read by the model (unsupported file type): {u.attachments_ignored.join(", ")}</p>
        )}
        {!!u.dropped_messages && (
          <p className="mt-2 text-xs text-muted">{u.dropped_messages} earlier message{u.dropped_messages > 1 ? "s" : ""} did not fit in the model&apos;s context and were not used.</p>
        )}
        {!streaming && (
          <div className="mt-1.5 flex h-7 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {message.content && <CopyButton text={message.content} />}
            {isLast && (
              <button type="button" disabled={busy} onClick={onRegenerate}
                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40">
                <RefreshCw className="size-3.5" /> Regenerate
              </button>
            )}
            {message.model && (
              <span className="ml-1 truncate text-xs text-muted">
                {message.model}{u.completion_tokens ? ` · ${u.completion_tokens} tokens` : ""}{u.seconds ? ` · ${u.seconds.toFixed(1)}s` : ""}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Check, Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "@/components/composer";
import { AssistantMessage, UserMessage } from "@/components/message";
import { ModelNotice } from "@/components/model-notice";
import { Button, Dialog, IconButton, Input, LoadState, Notice } from "@/components/ui";
import {
  api, notifyConversationsChanged, stream, type ConversationDetail, type FileInfo, type Message, type ModelStatus,
} from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { takePending } from "@/lib/pending";

function draftMessage(content: string, attachments: FileInfo[]): Message {
  return { id: `local-${Date.now()}`, role: "user", content, status: "complete", error: null, model: null, usage: {},
    created_at: new Date().toISOString(), attachments };
}

function Chat({ id }: { id: string }) {
  const router = useRouter();
  const conv = useApi<ConversationDetail>(`/conversations/${id}`);
  const model = useApi<ModelStatus>("/models/active");
  const setConvData = conv.setData;
  const [local, setLocal] = useState<Message[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  const stored = conv.data?.messages;
  const messages = useMemo(() => local ?? stored ?? [], [local, stored]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  /** Run one streamed generation. `base` is the history that stays; `optimistic` is shown until the server echoes it. */
  const run = useCallback(async (path: string, body: unknown, base: Message[], optimistic?: Message) => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError(null);
    stickRef.current = true;
    let list = optimistic ? [...base, optimistic] : base;
    let accepted = false;
    setLocal(list);
    try {
      await stream(path, body, (e) => {
        if (e.event === "user_message") {
          accepted = true;
          list = [...base, e.message];
        } else if (e.event === "assistant_start") {
          accepted = true;
          list = [...list, e.message];
        } else if (e.event === "delta") {
          const last = list[list.length - 1];
          list = [...list.slice(0, -1), { ...last, content: last.content + e.text }];
        } else if (e.event === "done" && e.message) {
          list = [...list.slice(0, -1), e.message];
        }
        setLocal(list);
      }, ctrl.signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setLocal(list.map((m) => (m.status === "streaming" ? { ...m, status: "cancelled" } : m)));
      } else {
        setError((e as Error).message);
        if (!accepted) {
          // The server refused the request: nothing was stored, so restore the previous view and the draft.
          setLocal(null);
          if (optimistic) setDraft(optimistic.content);
        }
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
      // Reconcile with what the server actually stored (covers stop and dropped connections).
      setTimeout(() => {
        api<ConversationDetail>(`/conversations/${id}`).then((d) => {
          if (!abortRef.current && !d.messages.some((m) => m.status === "streaming")) {
            setConvData(d);
            setLocal(null);
          }
        }, () => {});
        notifyConversationsChanged();
      }, 500);
    }
  }, [id, setConvData]);

  const send = useCallback((content: string, attachments: FileInfo[], base: Message[]) =>
    run(`/conversations/${id}/messages`, { content, attachment_ids: attachments.map((f) => f.id) }, base, draftMessage(content, attachments)),
  [id, run]);

  // First message handed over from the dashboard.
  const loaded = conv.data !== undefined;
  useEffect(() => {
    if (!loaded) return;
    const p = takePending(id);
    if (p) queueMicrotask(() => send(p.content, p.attachments, []));
  }, [loaded, id, send]);

  const edit = (target: Message, content: string) => {
    const index = messages.findIndex((m) => m.id === target.id);
    run(`/conversations/${id}/messages/${target.id}/edit`, { content }, messages.slice(0, index), { ...target, content });
  };

  const regenerate = () => {
    const base = messages[messages.length - 1]?.role === "assistant" ? messages.slice(0, -1) : messages;
    run(`/conversations/${id}/regenerate`, {}, base);
  };

  const patch = async (body: Record<string, unknown>) => {
    try {
      const updated = await api<ConversationDetail>(`/conversations/${id}`, { method: "PATCH", body });
      conv.setData({ ...conv.data!, ...updated, messages: conv.data!.messages });
      notifyConversationsChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    try {
      await api(`/conversations/${id}`, { method: "DELETE" });
      notifyConversationsChanged();
      router.replace("/");
    } catch (e) {
      setConfirmDelete(false);
      setError((e as Error).message);
    }
  };

  if (!conv.data) {
    return <div className="mx-auto max-w-3xl px-5 py-10"><LoadState loading={conv.loading} error={conv.error}>{null}</LoadState></div>;
  }
  const c = conv.data;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-4 sm:px-6">
        {renaming ? (
          <form className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); const t = String(new FormData(e.currentTarget).get("title")).trim(); if (t) patch({ title: t }); setRenaming(false); }}>
            <Input name="title" defaultValue={c.title} autoFocus maxLength={200} aria-label="Conversation title" className="h-8 max-w-md" onBlur={() => setRenaming(false)} />
            <IconButton label="Save title" type="submit" onMouseDown={(e) => e.preventDefault()}><Check className="size-4" /></IconButton>
          </form>
        ) : (
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{c.title}</h1>
        )}
        {!renaming && <IconButton label="Rename" onClick={() => setRenaming(true)}><Pencil className="size-4" /></IconButton>}
        <IconButton label={c.pinned ? "Unpin" : "Pin"} onClick={() => patch({ pinned: !c.pinned })} className={c.pinned ? "text-brand" : undefined}>
          {c.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </IconButton>
        <IconButton label="Delete conversation" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" /></IconButton>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6"
        onScroll={(e) => { const el = e.currentTarget; stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        <div className="mx-auto max-w-3xl space-y-7 py-8">
          {messages.length === 0 && !busy && <p className="py-16 text-center text-sm text-muted">Send a message to begin.</p>}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <UserMessage key={m.id} message={m} canEdit={!busy && !m.id.startsWith("local-")} onEdit={(content) => edit(m, content)} />
            ) : (
              <AssistantMessage key={m.id} message={m} isLast={i === messages.length - 1} busy={busy} onRegenerate={regenerate} />
            ),
          )}
        </div>
      </div>

      <div className="shrink-0 px-4 pb-4 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-2">
          <ModelNotice model={model.data} />
          {error && <Notice>{error}</Notice>}
          <Composer model={model.data} streaming={busy} onStop={() => abortRef.current?.abort()} value={draft} onValueChange={setDraft}
            onSubmit={(content, files) => send(content, files, messages)} autoFocus />
          <p className="text-center text-[11px] text-muted">Answers come from Origin&apos;s own model, running on this installation. Verify important results.</p>
        </div>
      </div>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete conversation?">
        <p className="text-sm leading-relaxed text-fg-2">“{c.title}” and all of its messages will be permanently deleted.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  return <Chat key={id} id={id} />;
}

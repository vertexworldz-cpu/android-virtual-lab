"use client";

import { Brain, Plus, Search, Trash2 } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { Badge, Button, Dialog, EmptyState, Field, IconButton, Input, LoadState, Notice, Page, PageHeader, Select, Textarea } from "@/components/ui";
import { api, type Memory, type ModelStatus } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export default function MemoryPage() {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const list = useApi<Memory[]>(`/memory${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  const model = useApi<ModelStatus>("/models/active");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      list.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const create = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    act(async () => {
      await api("/memory", { body: { content: f.get("content"), kind: f.get("kind") } });
      setOpen(false);
    });
  };

  const usesMemory = Boolean((model.data?.card as { supports_system_prompt?: boolean } | undefined)?.supports_system_prompt);

  return (
    <Page>
      <PageHeader title="Memory" description="Things Origin should remember about you. You control every entry."
        actions={<>
          {!!list.data?.length && !query && (
            <Button variant="danger" onClick={() => window.confirm("Delete all memories? This cannot be undone.") && act(() => api("/memory", { method: "DELETE" }))}>Clear all</Button>
          )}
          <Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" /> Add memory</Button>
        </>} />
      {model.data?.available && !usesMemory && (
        <div className="mb-5">
          <Notice tone="warn">
            Memories are stored and searchable, but the active model ({model.data.name}) was not trained to use background context, so they do not influence its answers yet.
          </Notice>
        </div>
      )}
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search memories" aria-label="Search memories" className="h-11 pl-10" />
      </div>
      {error && <div className="mb-4"><Notice>{error}</Notice></div>}
      <LoadState loading={list.loading && !list.data} error={list.error}>
        {list.data?.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.data.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className={`whitespace-pre-wrap text-sm leading-relaxed ${m.enabled ? "" : "text-muted line-through"}`}>{m.content}</p>
                  <div className="mt-1.5"><Badge>{m.kind}</Badge></div>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 pt-1 text-xs text-muted">
                  <input type="checkbox" checked={m.enabled} className="size-4 accent-[var(--brand)]"
                    onChange={(e) => act(() => api(`/memory/${m.id}`, { method: "PATCH", body: { enabled: e.target.checked } }))} />
                  Active
                </label>
                <IconButton label="Delete memory" onClick={() => act(() => api(`/memory/${m.id}`, { method: "DELETE" }))}><Trash2 className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Brain className="size-5" />} title={query ? "No memories match" : "No memories saved"}>
            {query ? "Try a different search." : "Add preferences or facts you want Origin to keep."}
          </EmptyState>
        )}
      </LoadState>
      <Dialog open={open} onClose={() => setOpen(false)} title="Add memory">
        <form onSubmit={create} className="space-y-4">
          <Field label="What should Origin remember?"><Textarea name="content" rows={3} required maxLength={4000} autoFocus /></Field>
          <Field label="Type">
            <Select name="kind" defaultValue="note">
              <option value="preference">Preference</option><option value="fact">Fact</option><option value="note">Note</option>
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary">Save</Button>
          </div>
        </form>
      </Dialog>
    </Page>
  );
}

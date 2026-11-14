"use client";

import { MessageSquare, Pin, Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { EmptyState, Input, LoadState, Page, PageHeader } from "@/components/ui";
import { relativeTime, type Conversation } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export default function HistoryPage() {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const list = useApi<Conversation[]>(`/conversations?limit=200${query ? `&q=${encodeURIComponent(query)}` : ""}`);
  return (
    <Page>
      <PageHeader title="Chat History" description="Search across conversation titles and message text." />
      <div className="relative mb-6">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search conversations" aria-label="Search conversations" className="h-11 pl-10" />
      </div>
      <LoadState loading={list.loading && !list.data} error={list.error}>
        {list.data?.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.data.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-3 px-4 py-3 text-sm transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-surface">
                  <MessageSquare className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.pinned && <Pin className="size-3.5 shrink-0 text-brand" aria-label="Pinned" />}
                  <span className="shrink-0 text-xs text-muted">{relativeTime(c.updated_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<MessageSquare className="size-5" />} title={query ? "No conversations match" : "No conversations yet"}>
            {query ? "Try a different search." : "Start one from New Chat."}
          </EmptyState>
        )}
      </LoadState>
    </Page>
  );
}

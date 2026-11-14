"use client";

import { ArrowRight, Bot, FolderKanban, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Composer } from "@/components/composer";
import { LogoMark } from "@/components/logo";
import { ModelNotice } from "@/components/model-notice";
import { Notice } from "@/components/ui";
import { api, relativeTime, type Conversation, type FileInfo, type ModelStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";
import { setPending } from "@/lib/pending";

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const model = useApi<ModelStatus>("/models/active");
  const recent = useApi<Conversation[]>("/conversations?limit=4");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const card = model.data?.card;

  const start = async (content: string, attachments: FileInfo[]) => {
    setError(null);
    try {
      const conv = await api<Conversation>("/conversations", { body: {} });
      setPending({ conversationId: conv.id, content, attachments });
      router.push(`/chat/${conv.id}`);
    } catch (e) {
      setDraft(content);
      setError((e as Error).message);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-[720px] flex-col justify-center px-5 py-12 sm:px-8">
        <div className="fade-in">
          <div className="mb-6"><LogoMark size={40} /></div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">
            {greeting()}, {user?.display_name.split(" ")[0]}.
          </h1>
          <p className="mt-2 text-base text-muted">Think. Create. Execute.</p>
        </div>

        <div className="mt-8 space-y-3">
          <ModelNotice model={model.data} />
          {error && <Notice>{error}</Notice>}
          <Composer large autoFocus model={model.data} value={draft} onValueChange={setDraft} onSubmit={start} />
        </div>

        {model.data?.available && !!card?.suggested_prompts?.length && (
          <div className="mt-4 flex flex-wrap gap-2">
            {card.suggested_prompts.map((p) => (
              <button key={p} type="button" onClick={() => start(p, [])}
                className="rounded-full border border-line bg-bg px-3.5 py-1.5 text-[13px] text-fg-2 transition-colors hover:border-brand/40 hover:text-fg">
                {p}
              </button>
            ))}
          </div>
        )}
        {model.data?.available && !!card?.limitations?.length && (
          <p className="mt-4 text-xs leading-relaxed text-muted">
            <span className="font-medium text-fg-2">{model.data.name}</span> is an early checkpoint. {card.limitations[0]}{" "}
            <Link href="/models" className="text-brand hover:underline">Model details</Link>
          </p>
        )}

        <div className="mt-12 grid gap-8 sm:grid-cols-[1fr_200px]">
          <section aria-labelledby="recent-heading">
            <h2 id="recent-heading" className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Recent conversations</h2>
            {recent.data?.length ? (
              <ul className="-mx-2.5">
                {recent.data.map((c) => (
                  <li key={c.id}>
                    <Link href={`/chat/${c.id}`} className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface">
                      <MessageSquare className="size-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate">{c.title}</span>
                      <span className="shrink-0 text-xs text-muted">{relativeTime(c.updated_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">{recent.loading ? " " : "Your conversations will appear here."}</p>
            )}
          </section>
          <section aria-labelledby="shortcuts-heading">
            <h2 id="shortcuts-heading" className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted">Workspace</h2>
            <ul className="-mx-2.5">
              {[{ href: "/projects", label: "Projects", icon: FolderKanban }, { href: "/agents", label: "Agents", icon: Bot }].map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface">
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1">{label}</span>
                    <ArrowRight className="size-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

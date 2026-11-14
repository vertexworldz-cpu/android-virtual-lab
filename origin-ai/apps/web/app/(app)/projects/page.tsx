"use client";

import { FolderKanban, MessageSquare, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Dialog, EmptyState, Field, IconButton, Input, LoadState, Notice, Page, PageHeader, Textarea } from "@/components/ui";
import { api, notifyConversationsChanged, type Conversation, type Project } from "@/lib/api";
import { useApi } from "@/lib/hooks";

function ProjectCard({ project, onChanged }: { project: Project; onChanged: () => void }) {
  const router = useRouter();
  const chats = useApi<Conversation[]>(`/conversations?project_id=${project.id}&limit=5`);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newChat = async () => {
    try {
      const c = await api<Conversation>("/conversations", { body: { project_id: project.id } });
      notifyConversationsChanged();
      router.push(`/chat/${c.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    try {
      await api(`/projects/${project.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setConfirm(false);
  };

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{project.name}</h2>
          {project.description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{project.description}</p>}
        </div>
        <Button size="sm" onClick={newChat}><Plus className="size-3.5" /> New chat</Button>
        <IconButton label={`Delete project ${project.name}`} onClick={() => setConfirm(true)}><Trash2 className="size-4" /></IconButton>
      </div>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      <div className="mt-4 border-t border-line pt-3">
        {chats.data?.length ? (
          <ul className="-mx-2">
            {chats.data.map((c) => (
              <li key={c.id}>
                <Link href={`/chat/${c.id}`} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] text-fg-2 transition-colors hover:bg-surface hover:text-fg">
                  <MessageSquare className="size-3.5 shrink-0 text-muted" /><span className="truncate">{c.title}</span>
                </Link>
              </li>
            ))}
            {project.conversation_count > chats.data.length && (
              <li className="px-2 pt-1 text-xs text-muted">+ {project.conversation_count - chats.data.length} more</li>
            )}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">{chats.loading ? " " : "No conversations in this project yet."}</p>
        )}
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title="Delete project?">
        <p className="text-sm leading-relaxed text-fg-2">“{project.name}” will be deleted. Its conversations are kept and moved out of the project.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setConfirm(false)}>Cancel</Button>
          <Button variant="danger" onClick={remove}>Delete</Button>
        </div>
      </Dialog>
    </Card>
  );
}

export default function ProjectsPage() {
  const projects = useApi<Project[]>("/projects");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/projects", { body: { name: f.get("name"), description: f.get("description") ?? "" } });
      setOpen(false);
      projects.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title="Projects" description="Group related conversations."
        actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="size-4" /> New project</Button>} />
      <LoadState loading={projects.loading && !projects.data} error={projects.error}>
        {projects.data?.length ? (
          <div className="grid gap-4">{projects.data.map((p) => <ProjectCard key={p.id} project={p} onChanged={projects.reload} />)}</div>
        ) : (
          <EmptyState icon={<FolderKanban className="size-5" />} title="No projects yet">Create a project to keep related conversations together.</EmptyState>
        )}
      </LoadState>
      <Dialog open={open} onClose={() => setOpen(false)} title="New project">
        <form onSubmit={create} className="space-y-4">
          <Field label="Name"><Input name="name" required maxLength={120} autoFocus /></Field>
          <Field label="Description"><Textarea name="description" rows={3} maxLength={2000} /></Field>
          {error && <Notice>{error}</Notice>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Create</Button>
          </div>
        </form>
      </Dialog>
    </Page>
  );
}

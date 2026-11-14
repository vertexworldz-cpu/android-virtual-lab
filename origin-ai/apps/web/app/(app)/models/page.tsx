"use client";

import { Boxes } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, LoadState, Notice, Page, PageHeader } from "@/components/ui";
import { api, formatBytes, formatDate, type Backend, type BackendTest, type MetricRecord, type ModelInfo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi } from "@/lib/hooks";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function TrainingLog({ name }: { name: string }) {
  const m = useApi<{ records: MetricRecord[] }>(`/models/${encodeURIComponent(name)}/metrics`);
  const evals = m.data?.records.filter((r) => r.event === "eval") ?? [];
  return (
    <LoadState loading={m.loading} error={m.error}>
      {evals.length ? (
        <div className="max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-[13px]">
            <thead className="sticky top-0 bg-surface text-xs text-muted">
              <tr><th className="px-3 py-2 font-medium">Step</th><th className="px-3 py-2 font-medium">Train loss</th><th className="px-3 py-2 font-medium">Held-out loss</th></tr>
            </thead>
            <tbody className="divide-y divide-line font-mono">
              {evals.map((r) => (
                <tr key={r.step}><td className="px-3 py-1.5">{r.step}</td><td className="px-3 py-1.5">{r.train_loss?.toFixed(4)}</td><td className="px-3 py-1.5">{r.val_loss?.toFixed(4)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-[13px] text-muted">No training log was recorded for this checkpoint.</p>
      )}
    </LoadState>
  );
}

function ModelCardView({ model, canManage, onChanged }: { model: ModelInfo; canManage: boolean; onChanged: () => void }) {
  const [showLog, setShowLog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const card = model.card;
  const ev = card.evaluation;
  const external = model.kind === "external";

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/models/${encodeURIComponent(model.name)}/activate`, { method: "POST" });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">{model.display_name}</h2>
        {model.active && <Badge tone="brand">Serving chat</Badge>}
        {card.preset && <Badge>{card.preset}</Badge>}
        {external && <Badge tone="warn">External open model</Badge>}
        <div className="flex-1" />
        {!model.active && canManage && <Button size="sm" loading={busy} onClick={activate}>Use for chat</Button>}
      </div>
      {external && (
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Runs on the server you connected, using that machine&apos;s hardware. Model: <span className="font-mono">{card.remote_model}</span>.
          This model was <strong className="font-medium text-fg-2">not trained by Origin</strong>; its capabilities and licence are those of its publisher.
        </p>
      )}
      {card.initialization && <p className="mt-1 text-[13px] text-muted">Initialised from {card.initialization}.</p>}
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}

      {!external && <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Fact label="Parameters" value={card.parameters?.toLocaleString() ?? "unknown"} />
        <Fact label="Context" value={card.context_length ? `${card.context_length} tokens` : "unknown"} />
        <Fact label="Vocabulary" value={card.vocab_size?.toLocaleString() ?? "unknown"} />
        <Fact label="Weights" value={formatBytes(model.size_bytes)} />
        <Fact label="Trained" value={formatDate(model.modified_at)} />
        <Fact label="Steps" value={card.training?.steps?.toLocaleString() ?? "unknown"} />
        <Fact label="Training time" value={card.training?.train_seconds != null ? `${(card.training.train_seconds / 60).toFixed(1)} min` : "unknown"} />
        <Fact label="Device" value={card.training?.device?.toUpperCase() ?? "unknown"} />
      </dl>}

      {ev?.accuracy != null && (
        <div className="mt-6 rounded-lg bg-surface p-4">
          <p className="text-xs text-muted">{ev.benchmark}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">
            {(ev.accuracy * 100).toFixed(1)}%
            <span className="ml-2 text-sm font-normal text-muted">{ev.correct} of {ev.total} correct</span>
          </p>
          {ev.per_task && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-fg-2">
              {Object.entries(ev.per_task).map(([task, r]) => (
                <span key={task}><span className="font-mono text-muted">{task}</span> {(r.accuracy * 100).toFixed(1)}%</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {!!card.capabilities?.length && (
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Can do</h3>
            <ul className="space-y-1 text-[13px] leading-relaxed text-fg-2">{card.capabilities.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        {!!card.limitations?.length && (
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Limitations</h3>
            <ul className="space-y-1 text-[13px] leading-relaxed text-fg-2">{card.limitations.map((c) => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
      </div>

      {!external && <div className="mt-5 border-t border-line pt-4">
        <Button size="sm" variant="ghost" onClick={() => setShowLog((s) => !s)} aria-expanded={showLog}>{showLog ? "Hide" : "Show"} training log</Button>
        {showLog && <div className="mt-3"><TrainingLog name={model.name} /></div>}
      </div>}
    </Card>
  );
}


function Backends({ onChanged }: { onChanged: () => void }) {
  const list = useApi<Backend[]>("/models/backends");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, BackendTest | "running">>({});

  const add = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("/models/backends", { body: { name: f.get("name"), base_url: f.get("base_url"), model: f.get("model") } });
      setOpen(false);
      list.reload();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const test = async (id: string) => {
    setTests((t) => ({ ...t, [id]: "running" }));
    try {
      const result = await api<BackendTest>(`/models/backends/${id}/test`, { method: "POST" });
      setTests((t) => ({ ...t, [id]: result }));
    } catch (err) {
      setTests((t) => ({ ...t, [id]: { ok: false, error: (err as Error).message, models: [] } }));
    }
  };
  const remove = async (b: Backend) => {
    if (!window.confirm(`Remove “${b.name}”? The server itself is not touched.`)) return;
    try {
      await api(`/models/backends/${b.id}`, { method: "DELETE" });
      list.reload();
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold">Open-model servers</h2>
        <Badge>Administrators</Badge>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setOpen((o) => !o)}>{open ? "Cancel" : "Connect a server"}</Button>
      </div>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Run an open model (for example Llama or Qwen) on your own GPU with Ollama, llama.cpp or vLLM, then connect it here.
        Origin sends chats only to servers you add. Ollama&apos;s address is <span className="font-mono">http://localhost:11434/v1</span>.
      </p>
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}
      {open && (
        <form onSubmit={add} className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Name"><Input name="name" required maxLength={80} placeholder="Local Llama" /></Field>
          <Field label="Server address"><Input name="base_url" required defaultValue="http://localhost:11434/v1" /></Field>
          <Field label="Model name on the server"><Input name="model" required placeholder="llama3.2:3b" /></Field>
          <div className="sm:col-span-3"><Button type="submit" variant="primary" loading={busy}>Add server</Button></div>
        </form>
      )}
      <LoadState loading={list.loading && !list.data} error={list.error}>
        {!!list.data?.length && (
          <ul className="mt-4 divide-y divide-line">
            {list.data.map((b) => {
              const t = tests[b.id];
              return (
                <li key={b.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{b.name}</p>
                      <p className="truncate font-mono text-xs text-muted">{b.base_url} · {b.model}</p>
                    </div>
                    <Button size="sm" loading={t === "running"} onClick={() => test(b.id)}>Test connection</Button>
                    <Button size="sm" variant="danger" onClick={() => remove(b)}>Remove</Button>
                  </div>
                  {t && t !== "running" && (
                    <div className="mt-2"><Notice tone={t.ok && t.model_available ? "brand" : t.ok ? "warn" : "danger"}>
                      {t.ok && t.model_available ? `Connected. Server offers ${t.models.length} model${t.models.length === 1 ? "" : "s"}.` : t.error}
                      {t.ok && !t.model_available && t.models.length > 0 && ` Available: ${t.models.join(", ")}.`}
                    </Notice></div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </LoadState>
    </Card>
  );
}

export default function ModelsPage() {
  const { user } = useAuth();
  const models = useApi<{ models: ModelInfo[]; active: string | null }>("/models");
  const canManage = user?.role === "owner" || user?.role === "admin";
  return (
    <Page>
      <PageHeader title="Models" description="Origin models trained on this installation, and any open-model servers an administrator connected. Training figures were measured during training and evaluation." />
      {canManage && <div className="mb-4"><Backends onChanged={models.reload} /></div>}
      <LoadState loading={models.loading && !models.data} error={models.error}>
        {models.data?.models.length ? (
          <div className="space-y-4">
            {models.data.models.map((m) => <ModelCardView key={m.name} model={m} canManage={canManage} onChanged={models.reload} />)}
            <p className="px-1 text-xs leading-relaxed text-muted">
              Training is started from the command line (<code className="font-mono">origin-core</code>) in this version. Launching and monitoring jobs from this page is on the roadmap (phase 5).
            </p>
          </div>
        ) : (
          <EmptyState icon={<Boxes className="size-5" />} title="No models yet">
            Train a checkpoint with <code className="font-mono">make bootstrap-model</code>, or connect an open-model server above.
          </EmptyState>
        )}
      </LoadState>
    </Page>
  );
}

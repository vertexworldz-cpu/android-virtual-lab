"use client";

import { Boxes } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, LoadState, Notice, Page, PageHeader } from "@/components/ui";
import { api, formatBytes, formatDate, type MetricRecord, type ModelInfo } from "@/lib/api";
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
        <h2 className="text-[15px] font-semibold">{model.name}</h2>
        {model.active && <Badge tone="brand">Serving chat</Badge>}
        {card.preset && <Badge>{card.preset}</Badge>}
        <div className="flex-1" />
        {!model.active && canManage && <Button size="sm" loading={busy} onClick={activate}>Use for chat</Button>}
      </div>
      {card.initialization && <p className="mt-1 text-[13px] text-muted">Initialised from {card.initialization}.</p>}
      {error && <div className="mt-3"><Notice>{error}</Notice></div>}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Fact label="Parameters" value={card.parameters?.toLocaleString() ?? "unknown"} />
        <Fact label="Context" value={card.context_length ? `${card.context_length} tokens` : "unknown"} />
        <Fact label="Vocabulary" value={card.vocab_size?.toLocaleString() ?? "unknown"} />
        <Fact label="Weights" value={formatBytes(model.size_bytes)} />
        <Fact label="Trained" value={formatDate(model.modified_at)} />
        <Fact label="Steps" value={card.training?.steps?.toLocaleString() ?? "unknown"} />
        <Fact label="Training time" value={card.training?.train_seconds != null ? `${(card.training.train_seconds / 60).toFixed(1)} min` : "unknown"} />
        <Fact label="Device" value={card.training?.device?.toUpperCase() ?? "unknown"} />
      </dl>

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

      <div className="mt-5 border-t border-line pt-4">
        <Button size="sm" variant="ghost" onClick={() => setShowLog((s) => !s)} aria-expanded={showLog}>{showLog ? "Hide" : "Show"} training log</Button>
        {showLog && <div className="mt-3"><TrainingLog name={model.name} /></div>}
      </div>
    </Card>
  );
}

export default function ModelsPage() {
  const { user } = useAuth();
  const models = useApi<{ models: ModelInfo[]; active: string | null }>("/models");
  const canManage = user?.role === "owner" || user?.role === "admin";
  return (
    <Page>
      <PageHeader title="Models" description="Origin models trained on this installation, from random weights. Every figure below was measured during training and evaluation." />
      <LoadState loading={models.loading && !models.data} error={models.error}>
        {models.data?.models.length ? (
          <div className="space-y-4">
            {models.data.models.map((m) => <ModelCardView key={m.name} model={m} canManage={canManage} onChanged={models.reload} />)}
            <p className="px-1 text-xs leading-relaxed text-muted">
              Training is started from the command line (<code className="font-mono">origin-core</code>) in this version. Launching and monitoring jobs from this page is on the roadmap (phase 5).
            </p>
          </div>
        ) : (
          <EmptyState icon={<Boxes className="size-5" />} title="No trained models yet">
            Run <code className="font-mono">make bootstrap-model</code> in the project folder to train the first checkpoint on this machine.
          </EmptyState>
        )}
      </LoadState>
    </Page>
  );
}

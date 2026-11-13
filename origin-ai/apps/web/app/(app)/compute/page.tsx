"use client";

import { RefreshCw } from "lucide-react";
import { Badge, Button, Card, LoadState, Notice, Page, PageHeader } from "@/components/ui";
import { formatBytes, type Compute } from "@/lib/api";
import { useApi } from "@/lib/hooks";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function Meter({ percent }: { percent: number }) {
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  );
}

export default function ComputePage() {
  const c = useApi<Compute>("/compute/local");
  const d = c.data;
  return (
    <Page>
      <PageHeader title="GPU & Compute" description="Measured on this machine when the page loads. Nothing here is estimated."
        actions={<Button onClick={c.reload}><RefreshCw className="size-4" /> Refresh</Button>} />
      <LoadState loading={c.loading && !d} error={c.error}>
        {d && (
          <div className="space-y-4">
            <Card className="p-6">
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">This machine</h2>
                <Badge tone="brand">Local · free</Badge>
                <span className="text-xs text-muted">{d.host.os} · {d.host.arch}</span>
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <Stat label="CPU" value={`${d.cpu.logical_cores ?? "?"} cores`} sub={`${d.cpu.usage_percent.toFixed(0)}% in use${d.cpu.max_mhz ? ` · ${(d.cpu.max_mhz / 1000).toFixed(1)} GHz` : ""}`} />
                  <Meter percent={d.cpu.usage_percent} />
                </div>
                <div>
                  <Stat label="Memory" value={formatBytes(d.memory.total_bytes)} sub={`${formatBytes(d.memory.available_bytes)} available`} />
                  <Meter percent={d.memory.used_percent} />
                </div>
                <div>
                  <Stat label="Disk (data folder)" value={formatBytes(d.disk.total_bytes)} sub={`${formatBytes(d.disk.free_bytes)} free`} />
                  <Meter percent={100 - (d.disk.free_bytes / d.disk.total_bytes) * 100} />
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">GPUs</h2>
                {d.gpus.length ? <Badge tone="brand">{d.gpus.length} detected</Badge> : <Badge>None detected</Badge>}
              </div>
              {d.gpus.length ? (
                <ul className="divide-y divide-line">
                  {d.gpus.map((g) => (
                    <li key={g.index} className="grid gap-4 py-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
                      <div><p className="text-sm font-medium">{g.name}</p><p className="text-xs text-muted">GPU {g.index} · driver {g.driver_version}</p></div>
                      <Stat label="Memory" value={g.memory_total_mb != null ? formatBytes(g.memory_total_mb * 1048576) : "n/a"} sub={g.memory_used_mb != null ? `${formatBytes(g.memory_used_mb * 1048576)} used` : undefined} />
                      <Stat label="Utilisation" value={g.utilization_percent != null ? `${g.utilization_percent}%` : "n/a"} />
                      <Stat label="Temp" value={g.temperature_c != null ? `${g.temperature_c}°C` : "n/a"} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted">{d.gpu_note} Training and inference will run on the CPU.</p>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="mb-4 text-[15px] font-semibold">ML runtime</h2>
              <div className="grid gap-6 sm:grid-cols-4">
                <Stat label="PyTorch" value={d.torch.version.split("+")[0]} />
                <Stat label="CUDA" value={d.torch.cuda_available ? `${d.torch.cuda_device_count} device${d.torch.cuda_device_count === 1 ? "" : "s"}` : "Unavailable"} />
                <Stat label="Apple MPS" value={d.torch.mps_available ? "Available" : "Unavailable"} />
                <Stat label="Training device" value={d.training_device.toUpperCase()} sub={`${d.torch.threads} CPU threads`} />
              </div>
            </Card>

            <Notice tone="warn">
              Cloud GPU providers, job scheduling and usage tracking are not built yet (roadmap phase 5). When they are, starting any paid instance will require your explicit approval.
            </Notice>
          </div>
        )}
      </LoadState>
    </Page>
  );
}

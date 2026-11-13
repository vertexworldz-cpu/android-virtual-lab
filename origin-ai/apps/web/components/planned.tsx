"use client";

import { Page, PageHeader, Badge, Card } from "./ui";

/** Honest placeholder for a module that is designed but not built yet. */
export function PlannedModule({ icon, title, summary, phase, planned }: {
  icon: React.ReactNode; title: string; summary: string; phase: number; planned: string[];
}) {
  return (
    <Page width="max-w-2xl">
      <PageHeader title={title} description={summary} />
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">Not built yet</p>
              <Badge tone="warn">Roadmap · Phase {phase}</Badge>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
              This module has no working functionality in this version, so nothing is shown here that pretends otherwise.
              It is planned as follows:
            </p>
            <ul className="mt-4 space-y-2 text-sm text-fg-2">
              {planned.map((p) => (
                <li key={p} className="flex gap-2.5"><span className="mt-[9px] size-1 shrink-0 rounded-full bg-line-strong" />{p}</li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </Page>
  );
}

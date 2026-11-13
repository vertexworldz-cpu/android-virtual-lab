"use client";

import type { ModelStatus } from "@/lib/api";
import { Notice } from "./ui";

/** Shown when chat cannot answer. States the real reason; never a placeholder reply. */
export function ModelNotice({ model }: { model: ModelStatus | undefined }) {
  if (!model || model.available) return null;
  return (
    <Notice tone="warn">
      <strong className="font-semibold">Origin has no model to answer with yet.</strong>{" "}
      {model.error ?? model.reason} Train the first checkpoint by running{" "}
      <code className="rounded bg-bg/60 px-1 py-0.5 font-mono text-xs">make bootstrap-model</code> in the project folder, then reload this page.
    </Notice>
  );
}

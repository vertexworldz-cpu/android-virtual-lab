"use client";

import { Download, FileText, FolderClosed, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button, EmptyState, IconButton, LoadState, Notice, Page, PageHeader } from "@/components/ui";
import { api, formatBytes, formatDate, type FileInfo } from "@/lib/api";
import { useApi } from "@/lib/hooks";

export default function FilesPage() {
  const files = useApi<FileInfo[]>("/files");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    for (const f of Array.from(list)) {
      const form = new FormData();
      form.append("file", f);
      try {
        await api("/files", { form });
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    files.reload();
  };

  const remove = async (f: FileInfo) => {
    if (!window.confirm(`Delete “${f.filename}”? This cannot be undone.`)) return;
    try {
      await api(`/files/${f.id}`, { method: "DELETE" });
      files.reload();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const total = files.data?.reduce((n, f) => n + f.size, 0) ?? 0;
  return (
    <Page>
      <PageHeader title="Files" description={files.data?.length ? `${files.data.length} file${files.data.length > 1 ? "s" : ""} · ${formatBytes(total)} stored on this installation.` : "Files you upload or attach to conversations."}
        actions={<>
          <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          <Button variant="primary" loading={busy} onClick={() => input.current?.click()}><Upload className="size-4" /> Upload</Button>
        </>} />
      {error && <div className="mb-4"><Notice>{error}</Notice></div>}
      <LoadState loading={files.loading && !files.data} error={files.error}>
        {files.data?.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {files.data.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <FileText className="size-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{f.filename}</p>
                  <p className="text-xs text-muted">{formatBytes(f.size)} · {formatDate(f.created_at)}</p>
                </div>
                <a href={`/api/v1/files/${f.id}/download`} aria-label={`Download ${f.filename}`} title="Download"
                  className="inline-flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg">
                  <Download className="size-4" />
                </a>
                <IconButton label={`Delete ${f.filename}`} onClick={() => remove(f)}><Trash2 className="size-4" /></IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<FolderClosed className="size-5" />} title="No files yet">Upload a file here, or attach one in a conversation.</EmptyState>
        )}
      </LoadState>
    </Page>
  );
}

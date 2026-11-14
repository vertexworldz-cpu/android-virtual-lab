"use client";

import { ArrowUp, FileText, Mic, Paperclip, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, formatBytes, type FileInfo, type ModelStatus } from "@/lib/api";
import { cx, IconButton, Spinner } from "./ui";

type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null; start: () => void; stop: () => void;
};

function speechCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function Composer({ onSubmit, onStop, streaming = false, model, autoFocus, large, value, onValueChange }: {
  onSubmit: (content: string, attachments: FileInfo[]) => void;
  onStop?: () => void;
  streaming?: boolean;
  model: ModelStatus | undefined;
  autoFocus?: boolean;
  large?: boolean;
  value: string;
  onValueChange: (v: string) => void;
}) {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    queueMicrotask(() => setCanSpeak(speechCtor() !== null));
    return () => recRef.current?.stop();
  }, []);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [value]);

  const unavailable = model !== undefined && !model.available;
  const canSend = value.trim().length > 0 && !streaming && uploading === 0 && !unavailable;

  const submit = () => {
    if (!canSend) return;
    onSubmit(value.trim(), files);
    onValueChange("");
    setFiles([]);
    setError(null);
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    for (const f of Array.from(list)) {
      setUploading((n) => n + 1);
      try {
        const form = new FormData();
        form.append("file", f);
        const info = await api<FileInfo>("/files", { form });
        setFiles((prev) => [...prev, info]);
      } catch (e) {
        setError(`${f.name}: ${(e as Error).message}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const toggleVoice = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const Ctor = speechCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language;
    rec.interimResults = false;
    rec.continuous = false;
    const base = value;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      onValueChange((base ? base + " " : "") + text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => {
      setListening(false);
      setError("Voice input failed. Check microphone permission.");
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <div>
      <div
        className={cx(
          "rounded-2xl border border-line-strong bg-bg shadow-card transition-shadow focus-within:border-brand/50 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--brand)_10%,transparent),var(--shadow-md)]",
          large ? "p-3" : "p-2.5",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }}
      >
        {(files.length > 0 || uploading > 0) && (
          <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
            {files.map((f) => (
              <span key={f.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-surface py-1 pl-2.5 pr-1 text-[13px]">
                <FileText className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{f.filename}</span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(f.size)}</span>
                <IconButton label={`Remove ${f.filename}`} className="size-6" onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}>
                  <X className="size-3.5" />
                </IconButton>
              </span>
            ))}
            {uploading > 0 && <span className="inline-flex items-center gap-2 px-1 text-[13px] text-muted"><Spinner className="size-3.5" /> Uploading…</span>}
          </div>
        )}
        <textarea
          ref={textRef}
          rows={1}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={unavailable ? "No model is available yet" : "Ask Origin anything…"}
          aria-label="Message Origin"
          className={cx("block w-full resize-none bg-transparent px-2 py-1.5 leading-relaxed placeholder:text-muted focus:outline-none", large ? "min-h-[52px] text-base" : "text-[15px]")}
        />
        <div className="mt-1 flex items-center gap-1">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          <IconButton label="Attach files" onClick={() => fileRef.current?.click()}><Paperclip className="size-[18px]" /></IconButton>
          {canSpeak && (
            <IconButton label={listening ? "Stop voice input" : "Voice input (uses your browser's speech service)"} onClick={toggleVoice} className={listening ? "bg-brand-soft text-brand" : undefined}>
              <Mic className="size-[18px]" />
            </IconButton>
          )}
          <div className="min-w-0 flex-1 truncate px-1 text-right text-xs text-muted">
            {model?.available && model.name}
          </div>
          {streaming ? (
            <button type="button" onClick={onStop} aria-label="Stop generating" title="Stop generating"
              className="flex size-9 items-center justify-center rounded-full bg-fg text-bg transition-opacity hover:opacity-85">
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button type="button" onClick={submit} disabled={!canSend} aria-label="Send message" title="Send message"
              className="flex size-9 items-center justify-center rounded-full bg-brand text-on-brand transition-colors hover:bg-brand-hover disabled:bg-surface-2 disabled:text-muted">
              <ArrowUp className="size-[18px]" strokeWidth={2.25} />
            </button>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-2 px-2 text-[13px] text-danger">{error}</p>}
    </div>
  );
}

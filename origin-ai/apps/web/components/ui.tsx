"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  loading?: boolean;
};

const variants = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover shadow-soft",
  secondary: "bg-bg text-fg border border-line-strong hover:bg-surface shadow-soft",
  ghost: "text-fg-2 hover:bg-surface-2 hover:text-fg",
  danger: "bg-bg text-danger border border-line-strong hover:bg-danger-soft",
};

export function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      type={rest.type ?? "button"}
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40 disabled:pointer-events-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-line-strong bg-bg px-3 text-sm text-fg placeholder:text-muted transition-shadow focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputClass, "h-10", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, "py-2.5 leading-relaxed", props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, "h-10", props.className)} />;
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cx("rounded-xl border border-line bg-bg", className)}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "brand" | "warn" | "danger"; children: React.ReactNode }) {
  const tones = {
    neutral: "bg-surface-2 text-fg-2",
    brand: "bg-brand-soft text-brand",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return <span className={cx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-5 animate-spin text-muted", className)} aria-label="Loading" />;
}

export function Notice({ tone = "danger", children }: { tone?: "danger" | "warn" | "brand"; children: React.ReactNode }) {
  const tones = { danger: "bg-danger-soft text-danger", warn: "bg-warn-soft text-warn", brand: "bg-brand-soft text-brand" };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cx("rounded-lg px-3.5 py-2.5 text-[13px] leading-relaxed", tones[tone])}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Page({ children, width = "max-w-4xl" }: { children: React.ReactNode; width?: string }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className={cx("mx-auto px-5 pb-16 pt-10 sm:px-8", width)}>{children}</div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">{children}</div>}
    </div>
  );
}

export function LoadState({ loading, error, children }: { loading: boolean; error: string | null; children: React.ReactNode }) {
  if (error) return <Notice>{error}</Notice>;
  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  return <>{children}</>;
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-bg p-0 text-fg shadow-pop backdrop:bg-black/25"
    >
      {open && (
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold">{title}</h2>
            <IconButton label="Close" onClick={onClose}><X className="size-4" /></IconButton>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <circle cx="16" cy="16" r="11" fill="none" stroke="var(--brand)" strokeWidth="3.5" />
      <circle cx="16" cy="16" r="3.5" fill="var(--brand)" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[15px] font-semibold tracking-tight">
        Origin <span className="text-brand">AI</span>
      </span>
    </span>
  );
}

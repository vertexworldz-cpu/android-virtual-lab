"use client";

import { Check, Copy } from "lucide-react";
import { isValidElement, memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) return textOf((node.props as { children?: React.ReactNode }).children);
  return "";
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {copied ? <Check className="size-3.5 text-brand" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Pre({ children }: { children?: React.ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  const className = isValidElement(child) ? ((child.props as { className?: string }).className ?? "") : "";
  const lang = /language-([\w+-]+)/.exec(className)?.[1] ?? "text";
  const code = textOf(children).replace(/\n$/, "");
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line py-1 pl-4 pr-2">
        <span className="font-mono text-xs text-muted">{lang}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

// react-markdown never renders raw HTML, so model output cannot inject markup.
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-origin text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: Pre,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Rendert de tekst van een handleiding (Kennisbank/Ticketing) als Markdown:
 * ## voor kopjes per stap, **vet** voor nadruk, - voor lijstjes, en > voor
 * een "let op"-kader. Platte tekst zonder Markdown-opmaak (oudere
 * handleidingen) blijft gewoon leesbaar als normale alinea's.
 */
export function MarkdownContent({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 text-sm text-muted-foreground [&>*:first-child]:mt-0", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="mt-4 text-base font-bold text-foreground">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-4 text-base font-bold text-foreground">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-3 text-sm font-bold text-foreground">{children}</h4>,
          p: ({ children }) => <p className="leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          ul: ({ children }) => <ul className="list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-hhc-orange-dark underline underline-offset-2">
              {children}
            </a>
          ),
          hr: () => <hr className="my-2 border-border" />,
          blockquote: ({ children }) => (
            <div className="flex items-start gap-2.5 rounded-md border border-hhc-orange/30 bg-primary/5 px-3.5 py-3 text-foreground [&_p]:leading-relaxed [&_p:first-child]:mt-0">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-hhc-orange-dark" />
              <div className="flex flex-col gap-1">{children}</div>
            </div>
          ),
          code: ({ children }) => (
            <code className="rounded bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{children}</code>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

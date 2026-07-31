"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <div
      className={`prose prose-sm prose-neutral dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0.5 ${className ?? ""}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

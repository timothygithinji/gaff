import { cn } from "@/lib/utils";
/**
 * Shared empty / no-match state. Two placements over one copy structure:
 *   - `variant="card"`   — centered maritime card (mobile review/filter empty)
 *   - `variant="inline"` — compact dashed box that sits inside a rail
 *     (desktop queue "no matches")
 *
 * The CTA is passed as `action` (a Link or button) so callers keep their own
 * navigation + button styling; the variant owns the container + text chrome.
 */
import type { ReactNode } from "react";

export function EmptyState({
  eyebrow,
  title,
  body,
  action,
  variant = "card",
  className,
}: {
  eyebrow?: string;
  title?: string;
  body?: string;
  action?: ReactNode;
  variant?: "card" | "inline";
  className?: string;
}) {
  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex flex-col items-start gap-2 rounded-[6px] border border-line border-dashed bg-paper p-4",
          className
        )}
      >
        {eyebrow ? (
          <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
            {eyebrow}
          </p>
        ) : null}
        {title ? (
          <p className="font-semibold text-[13px] text-navy leading-4">{title}</p>
        ) : null}
        {body ? <p className="text-[12px] text-slate leading-4">{body}</p> : null}
        {action}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "rounded-[2px] border border-line bg-paper p-8 text-center",
        className
      )}
    >
      <p className="font-semibold text-[10px] text-slate uppercase tracking-[0.14em]">
        {eyebrow}
      </p>
      {title ? (
        <h2 className="mt-2 font-semibold text-[20px] text-navy tracking-[-0.01em]">
          {title}
        </h2>
      ) : null}
      {body ? <p className="mt-2 text-[13px] text-slate">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

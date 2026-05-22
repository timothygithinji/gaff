/**
 * INCLUDE / EXCLUDE outcode chip groups.
 *
 * Each chip is `outcode + ✕`. EXCLUDE chips render with a strike-through
 * to mirror the design. "+ Add" pops an inline input; submission
 * normalises (trim + uppercase) and validates against postcodes.io
 * (`GET /outcodes/{outcode}`). A 404 → reject with an inline error
 * that clears on the next keystroke.
 *
 * Validation is async (network round-trip), so the chip group exposes
 * a `pending` state to disable submission while a lookup is in flight.
 */
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import {
  createPostcodesClient,
  lookupOutcode,
} from "../../lib/api-clients/postcodes-io";

type Variant = "include" | "exclude";

type Props = {
  variant: Variant;
  values: string[];
  onChange: (next: string[]) => void;
  /** Optional label suffix shown in the eyebrow row, e.g. "11 AREAS". */
  countLabel?: string;
};

export function OutcodeChips({ variant, values, onChange, countLabel }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isExclude = variant === "exclude";

  /**
   * Validates the current `draft` against postcodes.io and commits it
   * to the chip list on success. Wrapped in a sync entry point so the
   * `<input onKeyDown>` and `<button onClick>` handlers can fire it
   * without leaking a floating promise — Biome's `noFloatingPromises`
   * rule rejects `void submit()`, and `no-async-handler` is fine with
   * a sync wrapper that delegates to an async impl.
   */
  const runSubmit = async (): Promise<void> => {
    const normalised = draft.trim().toUpperCase();
    if (!normalised) {
      setAdding(false);
      setDraft("");
      return;
    }
    if (values.includes(normalised)) {
      setError("Already added");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const client = createPostcodesClient();
      const res = await lookupOutcode({
        client,
        path: { outcode: normalised },
      });
      if (res.error || !res.data) {
        setError("Unknown outcode");
        setPending(false);
        return;
      }
      onChange([...values, normalised]);
      setDraft("");
      setAdding(false);
    } catch {
      setError("Validation failed");
    } finally {
      setPending(false);
    }
  };

  const submit = () => {
    runSubmit().catch(() => {
      // `runSubmit` already swallows its own errors; this guard exists
      // so the async chain is captured in a `.catch` and biome's
      // floating-promise lint is satisfied.
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          {isExclude ? "EXCLUDE" : "INCLUDE"}
          {countLabel ? ` · ${countLabel}` : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <button
            className={
              isExclude
                ? "inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-muted px-3 py-1.5 text-foreground text-sm line-through decoration-primary/60"
                : "inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-foreground text-sm"
            }
            key={v}
            onClick={() => onChange(values.filter((o) => o !== v))}
            type="button"
          >
            <span>{v}</span>
            <HugeiconsIcon
              className="text-muted-foreground"
              icon={Cancel01Icon}
              size={12}
              strokeWidth={2}
            />
            <span className="sr-only">Remove {v}</span>
          </button>
        ))}
        {adding ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/60 border-dashed bg-card px-2 py-1">
            <input
              aria-label="Outcode"
              autoFocus
              className="w-16 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground/60"
              disabled={pending}
              onBlur={() => {
                if (!draft) {
                  setAdding(false);
                  setError(null);
                }
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
                if (e.key === "Escape") {
                  setAdding(false);
                  setDraft("");
                  setError(null);
                }
              }}
              placeholder="NW3"
              type="text"
              value={draft}
            />
            <button
              className="flex h-5 w-5 items-center justify-center text-primary disabled:opacity-50"
              disabled={pending || !draft.trim()}
              onClick={() => {
                submit();
              }}
              type="button"
            >
              {pending ? (
                "…"
              ) : (
                <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.5} />
              )}
            </button>
          </span>
        ) : (
          <button
            className="inline-flex items-center gap-1 rounded-full border border-primary/60 border-dashed px-3 py-1.5 text-primary text-sm"
            onClick={() => setAdding(true)}
            type="button"
          >
            <span>+ Add</span>
          </button>
        )}
      </div>
      {error && <p className="text-primary text-xs">{error}</p>}
    </div>
  );
}

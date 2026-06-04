import type { AnyFieldApi } from "@tanstack/react-form";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

/**
 * Labelled text input wired to a TanStack Form field. Renders the
 * uppercase label, the styled input, and the first validation error.
 * Used by the login and signup forms, which share the same field shape.
 *
 * Styling matches the Paper "Gaff" auth artboards: steel-blue small-caps
 * label, white input with a #c9d3dc hairline and 6px radius. `trailing`
 * renders an action next to the label (the password "Forgot?" link).
 */
type Props = {
  field: AnyFieldApi;
  label: string;
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
  /** Optional action rendered on the right of the label row. */
  trailing?: ReactNode;
};

export function TextField({
  field,
  label,
  autoComplete,
  inputMode,
  type,
  trailing,
}: Props) {
  const hasError = Boolean(field.state.meta.errors[0]);
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-center justify-between">
        <span className='text-[11px] text-slate uppercase leading-[14px] tracking-[0.1em]'>
          {label}
        </span>
        {trailing}
      </span>
      <input
        autoComplete={autoComplete}
        className={cn(
          "w-full rounded-md border bg-card px-4 py-3.5 text-[14px] text-foreground leading-[18px] outline-none transition-colors placeholder:text-[#8a97a0] focus:border-primary",
          hasError ? "border-warning" : "border-[#c9d3dc]"
        )}
        inputMode={inputMode}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        type={type}
        value={field.state.value}
      />
      {hasError ? (
        <span className="text-[12px] text-warning-text leading-4">
          {String(field.state.meta.errors[0])}
        </span>
      ) : null}
    </label>
  );
}

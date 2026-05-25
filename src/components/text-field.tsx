import type { AnyFieldApi } from "@tanstack/react-form";
import type { InputHTMLAttributes } from "react";

/**
 * Labelled text input wired to a TanStack Form field. Renders the
 * uppercase label, the styled input, and the first validation error.
 * Used by the login and signup forms, which share the same field shape.
 */
type Props = {
  field: AnyFieldApi;
  label: string;
  autoComplete?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  type?: InputHTMLAttributes<HTMLInputElement>["type"];
};

export function TextField({
  field,
  label,
  autoComplete,
  inputMode,
  type,
}: Props) {
  return (
    <label className="block space-y-1.5">
      <span className="text-muted-foreground text-xs uppercase tracking-widest">
        {label}
      </span>
      <input
        autoComplete={autoComplete}
        className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-foreground outline-none focus:border-primary"
        inputMode={inputMode}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
        type={type}
        value={field.state.value}
      />
      {field.state.meta.errors[0] ? (
        <span className="text-primary text-xs">
          {String(field.state.meta.errors[0])}
        </span>
      ) : null}
    </label>
  );
}

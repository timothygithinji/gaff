import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { authClient } from "../lib/auth-client";
import { redirectIfSignedIn } from "../lib/auth-guard";

const SearchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: SearchSchema,
  beforeLoad: ({ context }) => {
    redirectIfSignedIn(context as { currentUserId: string | null });
  },
  component: LoginPage,
});

const emailSchema = z.string().email("Enter a valid email");
const passwordSchema = z.string().min(8, "At least 8 characters");

function LoginPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { next } = Route.useSearch();
  const [serverError, setServerError] = useState<string | null>(null);

  const signIn = useMutation({
    // Use Better Auth's recommended { onSuccess, onError } callback shape.
    // The session cookie is set by the time onSuccess fires; we then have
    // to re-run __root's beforeLoad so the router context picks up the
    // new currentUserId — otherwise the destination route's beforeLoad
    // (and the HouseholdProvider) still see null and we end up redirected
    // back here OR throwing "useHousehold() called outside <Provider>".
    mutationFn: (input: { email: string; password: string }) =>
      new Promise<void>((resolve, reject) => {
        authClient.signIn.email(
          { email: input.email, password: input.password },
          {
            onSuccess: () => resolve(),
            onError: (ctx) => reject(new Error(ctx.error.message)),
          }
        );
      }),
    onSuccess: async () => {
      // Drop any stale household cache from a previous session.
      queryClient.removeQueries({ queryKey: ["household"] });
      // Re-runs every route's beforeLoad against the fresh cookie.
      await router.invalidate();
      await navigate({ to: next ?? "/" });
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Sign-in failed");
    },
  });

  const form = useForm({
    defaultValues: { email: "", password: "" },
    onSubmit: async ({ value }) => {
      setServerError(null);
      await signIn.mutateAsync(value);
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-ground px-6 py-12 text-ink">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2">
          <p className="text-brass text-xs uppercase tracking-widest">
            Welcome back
          </p>
          <h1 className="font-display text-4xl">Sign in</h1>
        </header>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field
            name="email"
            validators={{
              onChange: ({ value }) => {
                const r = emailSchema.safeParse(value);
                return r.success ? undefined : r.error.issues[0]?.message;
              },
            }}
          >
            {(field) => (
              <label className="block space-y-1.5">
                <span className="text-brass text-xs uppercase tracking-widest">
                  Email
                </span>
                <input
                  autoComplete="email"
                  className="w-full rounded-lg border border-brass/30 bg-bone px-3 py-2.5 text-ink outline-none focus:border-copper"
                  inputMode="email"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="email"
                  value={field.state.value}
                />
                {field.state.meta.errors[0] ? (
                  <span className="text-copper text-xs">
                    {String(field.state.meta.errors[0])}
                  </span>
                ) : null}
              </label>
            )}
          </form.Field>

          <form.Field
            name="password"
            validators={{
              onChange: ({ value }) => {
                const r = passwordSchema.safeParse(value);
                return r.success ? undefined : r.error.issues[0]?.message;
              },
            }}
          >
            {(field) => (
              <label className="block space-y-1.5">
                <span className="text-brass text-xs uppercase tracking-widest">
                  Password
                </span>
                <input
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-brass/30 bg-bone px-3 py-2.5 text-ink outline-none focus:border-copper"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="password"
                  value={field.state.value}
                />
                {field.state.meta.errors[0] ? (
                  <span className="text-copper text-xs">
                    {String(field.state.meta.errors[0])}
                  </span>
                ) : null}
              </label>
            )}
          </form.Field>

          {serverError ? (
            <p className="rounded-md bg-copper/10 px-3 py-2 text-copper text-sm">
              {serverError}
            </p>
          ) : null}

          <button
            className="w-full rounded-full bg-copper py-3 font-medium text-bone transition hover:bg-copper/90 disabled:opacity-60"
            disabled={signIn.isPending}
            type="submit"
          >
            {signIn.isPending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-brass text-sm">
          New here?{" "}
          <Link className="font-medium text-copper underline" to="/signup">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}

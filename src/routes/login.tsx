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
import {
  AuthEyebrow,
  AuthHeading,
  AuthLayout,
} from "../components/auth/auth-layout";
import { TextField } from "../components/text-field";
import { Button } from "../components/ui/button";
import { authClient } from "../lib/auth-client";
import { redirectIfSignedIn } from "../lib/auth-guard";

const SearchSchema = z.object({
  next: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Gaff" }] }),
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
    <AuthLayout>
      {/* Login has only two fields, so on mobile it would otherwise crowd up
          under the wordmark. Paper 3U8-0 leaves a generous gap and drops the
          heading/form block ~a third down; this top padding restores that
          rhythm on mobile only (cleared from sm+, where the column centres). */}
      <div className="flex flex-col gap-7 pt-16 sm:pt-0">
        <header className="flex flex-col gap-1.5">
          <AuthEyebrow>Welcome back</AuthEyebrow>
          <AuthHeading>
            Sign in to
            <br />
            your household
          </AuthHeading>
        </header>

        <form
          className="flex flex-col gap-3.5"
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
              <TextField
                autoComplete="email"
                field={field}
                inputMode="email"
                label="Email"
                type="email"
              />
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
              <TextField
                autoComplete="current-password"
                field={field}
                label="Password"
                trailing={
                  // No password-reset route exists yet; Paper shows a copper
                  // "Forgot?" affordance on the password row, so render it as a
                  // styled no-op link rather than building a reset flow.
                  <a
                    className="text-[#d77a4a] text-[11px] uppercase leading-[14px] tracking-[0.1em]"
                    href="/login"
                  >
                    Forgot?
                  </a>
                }
                type="password"
              />
            )}
          </form.Field>

          {serverError ? (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-[13px] text-warning-text leading-4">
              {serverError}
            </p>
          ) : null}

          <Button
            className="mt-1 h-auto w-full rounded-full py-4 font-medium text-[14px]"
            loading={signIn.isPending}
            loadingText="Signing in…"
            size="lg"
            type="submit"
          >
            Sign in
          </Button>
        </form>

        <p className="flex items-center justify-center gap-1.5 text-[13px] leading-4">
          <span className="text-[#1f3a5f]">First time here?</span>
          <Link className="font-medium text-[#d77a4a]" to="/signup">
            Create a household
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

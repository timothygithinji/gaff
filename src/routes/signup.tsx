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
import { Button } from "../components/ui/button";
import { authClient } from "../lib/auth-client";
import { redirectIfSignedIn } from "../lib/auth-guard";

export const Route = createFileRoute("/signup")({
  beforeLoad: ({ context }) => {
    redirectIfSignedIn(context as { currentUserId: string | null });
  },
  component: SignupPage,
});

const nameSchema = z.string().trim().min(1, "What should we call you?");
const emailSchema = z.string().email("Enter a valid email");
const passwordSchema = z.string().min(8, "At least 8 characters");

function SignupPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const signUp = useMutation({
    // Better Auth's signUp.email auto-creates a session and sets the
    // cookie on the response, so by the time onSuccess fires we're
    // authenticated. Drop the stale household query, invalidate the
    // router so __root re-runs beforeLoad against the new cookie, then
    // navigate. Without router.invalidate() the destination route's
    // beforeLoad still sees currentUserId: null and bounces back here.
    mutationFn: (input: {
      name: string;
      email: string;
      password: string;
    }) =>
      new Promise<void>((resolve, reject) => {
        authClient.signUp.email(
          {
            name: input.name,
            email: input.email,
            password: input.password,
          },
          {
            onSuccess: () => resolve(),
            onError: (ctx) => reject(new Error(ctx.error.message)),
          }
        );
      }),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: ["household"] });
      await router.invalidate();
      await navigate({ to: "/" });
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Sign-up failed");
    },
  });

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setServerError(null);
      await signUp.mutateAsync(value);
    },
  });

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-sm space-y-8">
        <header className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-widest">
            New household
          </p>
          <h1 className="font-serif text-4xl">Create account</h1>
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
            name="name"
            validators={{
              onChange: ({ value }) => {
                const r = nameSchema.safeParse(value);
                return r.success ? undefined : r.error.issues[0]?.message;
              },
            }}
          >
            {(field) => (
              <label className="block space-y-1.5">
                <span className="text-muted-foreground text-xs uppercase tracking-widest">
                  Name
                </span>
                <input
                  autoComplete="name"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-foreground outline-none focus:border-primary"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="text"
                  value={field.state.value}
                />
                {field.state.meta.errors[0] ? (
                  <span className="text-primary text-xs">
                    {String(field.state.meta.errors[0])}
                  </span>
                ) : null}
              </label>
            )}
          </form.Field>

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
                <span className="text-muted-foreground text-xs uppercase tracking-widest">
                  Email
                </span>
                <input
                  autoComplete="email"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-foreground outline-none focus:border-primary"
                  inputMode="email"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="email"
                  value={field.state.value}
                />
                {field.state.meta.errors[0] ? (
                  <span className="text-primary text-xs">
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
                <span className="text-muted-foreground text-xs uppercase tracking-widest">
                  Password
                </span>
                <input
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2.5 text-foreground outline-none focus:border-primary"
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  type="password"
                  value={field.state.value}
                />
                {field.state.meta.errors[0] ? (
                  <span className="text-primary text-xs">
                    {String(field.state.meta.errors[0])}
                  </span>
                ) : null}
              </label>
            )}
          </form.Field>

          {serverError ? (
            <p className="rounded-md bg-primary/10 px-3 py-2 text-primary text-sm">
              {serverError}
            </p>
          ) : null}

          <Button
            className="w-full rounded-full"
            disabled={signUp.isPending}
            size="lg"
            type="submit"
          >
            {signUp.isPending ? "Creating…" : "Create account"}
          </Button>
        </form>

        <p className="text-center text-muted-foreground text-sm">
          Already have an account?{" "}
          <Link className="font-medium text-primary underline" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

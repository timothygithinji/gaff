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
import { queryKeys } from "../lib/query-keys";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign up · Gaff" }] }),
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
      queryClient.removeQueries({ queryKey: queryKeys.household() });
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
    <AuthLayout>
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-1.5">
          <AuthEyebrow>Start a household</AuthEyebrow>
          {/* Mobile/tablet lead with the marketing headline (no side panel
              there); lg+ shows the short heading since the navy panel already
              carries the pitch. */}
          <AuthHeading className="lg:hidden">
            Find a flat together,
            <br />
            without the wars
          </AuthHeading>
          <h1 className="hidden font-semibold text-[30px] text-foreground leading-[34px] tracking-[-0.025em] lg:block">
            Create your account
          </h1>
          <p className='pt-1.5 text-[#1f3a5f] text-[13px] leading-4'>
            Invite one person after this. The blind veto loop starts as soon as
            you both swipe.
          </p>
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
            name="name"
            validators={{
              onChange: ({ value }) => {
                const r = nameSchema.safeParse(value);
                return r.success ? undefined : r.error.issues[0]?.message;
              },
            }}
          >
            {(field) => (
              <TextField
                autoComplete="name"
                field={field}
                label="Name"
                type="text"
              />
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
                autoComplete="new-password"
                field={field}
                label="Password"
                type="password"
              />
            )}
          </form.Field>

          <p className='text-[#5a7596] text-[11px] leading-[15px]'>
            At least 8 characters.
          </p>

          {serverError ? (
            <p className="rounded-md bg-warning/10 px-3 py-2 text-[13px] text-warning-text leading-4">
              {serverError}
            </p>
          ) : null}

          <Button
            className="mt-1 h-auto w-full rounded-full py-4 font-medium text-[14px]"
            loading={signUp.isPending}
            loadingText="Creating…"
            size="lg"
            type="submit"
          >
            Create household
          </Button>
        </form>

        <p className="flex items-center justify-center gap-1.5 text-[13px] leading-4">
          <span className="text-[#1f3a5f]">Already set up?</span>
          <Link className="font-medium text-[#d77a4a]" to="/login">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

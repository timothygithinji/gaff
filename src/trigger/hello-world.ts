import { task } from "@trigger.dev/sdk";

/**
 * Starter Trigger.dev task. Lives under one of the `dirs` listed in
 * `trigger.config.ts` — every file in those directories is scanned for
 * exported `task(...)` calls and registered with Trigger.dev on deploy.
 *
 * Invoke it from your app code:
 *
 *   import { helloWorld } from "./trigger/hello-world";
 *   await helloWorld.trigger({ name: "world" });
 */
export const helloWorld = task({
  id: "hello-world",
  run: async (payload: { name: string }) => {
    return {
      message: `Hello ${payload.name}`,
      at: new Date().toISOString(),
    };
  },
});

import { Hono } from "hono";

export type Env = {
  // Secrets
  DATABASE_URL: string;
  TRIGGER_SECRET_KEY: string;

  // Bindings (populated by Pulumi via `t-stack provision`).
  KV: KVNamespace;
  BUCKET: R2Bucket;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.text("Hello from gaff"));

app.get("/health", (c) => c.json({ ok: true }));


export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

# gaff

A single-app TanStack Start project on Cloudflare Workers, scaffolded by [`t-stack`](https://github.com/timothygithinji/t-stack).

## Develop

```sh
bun install
bun run dev
```

Local dev expects `.dev.vars` to be populated. Generate it from Doppler:

```sh
t-stack secrets pull --env dev
```

## Deploy

```sh
bun run deploy
# or, with full pipeline (build + secrets sync + wrangler deploy):
t-stack deploy
```

## Provision more

Cloud resources (KV, R2, DNS, Cloudflare Access) are managed via Pulumi. To create or refresh them:

```sh
t-stack provision
```

State for this project lives in `.t-stack/state.json` and is safe to commit.

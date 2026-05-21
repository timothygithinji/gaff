import { createFileRoute } from "@tanstack/react-router";

const mainStyle = { fontFamily: "system-ui, sans-serif", padding: "2rem" };

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main style={mainStyle}>
      <h1>Hello gaff</h1>
      <p>Your TanStack Start app is running on Cloudflare Workers.</p>
      <ul>
        <li>
          <a href="/health">/health</a> — worker health probe
        </li>
      </ul>
    </main>
  );
}

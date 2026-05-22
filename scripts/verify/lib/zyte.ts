const ZYTE_ENDPOINT = "https://api.zyte.com/v1/extract";

type ZyteRequest = {
  url: string;
  httpResponseBody?: boolean;
  httpResponseHeaders?: boolean;
  browserHtml?: boolean;
  geolocation?: string;
};

type ZyteResponse = {
  url: string;
  statusCode?: number;
  httpResponseBody?: string; // base64 when httpResponseBody:true
  httpResponseHeaders?: { name: string; value: string }[];
  browserHtml?: string;
};

export type ZyteResult = {
  status: number;
  html: string;
  headers: Record<string, string>;
  costEstimateUsd: number;
};

function basicAuth(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

export async function zyteFetch(
  apiKey: string,
  req: ZyteRequest
): Promise<ZyteResult> {
  const start = performance.now();
  const res = await fetch(ZYTE_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: basicAuth(apiKey),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Zyte ${res.status} ${res.statusText}: ${body.slice(0, 400)}`
    );
  }

  const data = (await res.json()) as ZyteResponse;
  const ms = Math.round(performance.now() - start);

  let html = "";
  if (data.browserHtml) {
    html = data.browserHtml;
  } else if (data.httpResponseBody) {
    html = new TextDecoder().decode(
      Uint8Array.from(atob(data.httpResponseBody), (c) => c.charCodeAt(0))
    );
  }

  const headers: Record<string, string> = {};
  for (const h of data.httpResponseHeaders ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  // Cost is reported in the response Zyte-* headers on the HTTP response, not body
  // We approximate from the URL hint; real billing is logged elsewhere.
  const costEstimateUsd =
    Number.parseFloat(res.headers.get("zyte-request-cost") ?? "0") || 0;

  console.log(
    `  → fetched in ${ms}ms · status ${data.statusCode ?? "?"} · cost $${costEstimateUsd.toFixed(5)}`
  );

  return {
    status: data.statusCode ?? res.status,
    html,
    headers,
    costEstimateUsd,
  };
}

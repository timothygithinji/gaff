import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig([
  {
    input: "./src/lib/api-clients/specs/epc.openapi.yaml",
    output: "./src/lib/api-clients/epc/generated",
    plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
  },
  {
    input: "./src/lib/api-clients/specs/postcodes-io.openapi.json",
    output: "./src/lib/api-clients/postcodes-io/generated",
    plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
  },
]);

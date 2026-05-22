/**
 * Anthropic SDK wrapper for listing enrichment.
 *
 * Exposes one function: `extractFeatures`. It builds the prompt, forces
 * a single `extract_features` tool call, validates the tool input with
 * Zod, and returns the features + token usage + computed USD cost.
 *
 * Cost math lives here (not in the task) so the unit test can lock the
 * arithmetic without invoking @trigger.dev/sdk. The rates come from
 * `./config` — bumping the model forces a rates review in the same
 * commit.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ListingDetail } from "../parsers/types";
import {
  AI_BUDGET,
  HAIKU_4_5_INPUT_USD_PER_MTOK,
  HAIKU_4_5_OUTPUT_USD_PER_MTOK,
} from "./config";
import type { Features } from "./prompt";
import {
  EXTRACT_FEATURES_INPUT_SCHEMA,
  EXTRACT_FEATURES_TOOL_NAME,
  FeaturesSchema,
  SYSTEM_PROMPT,
  buildUserMessage,
} from "./prompt";

export interface ExtractFeaturesInput {
  listingDetail: ListingDetail;
  apiKey: string;
}

export interface ExtractFeaturesResult {
  features: Features;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Compute USD cost from raw token counts. Exported so the unit test can
 * pin the arithmetic without dragging in a fake Anthropic response.
 */
export function computeCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
}): number {
  const inputCost =
    (input.inputTokens / 1_000_000) * HAIKU_4_5_INPUT_USD_PER_MTOK;
  const outputCost =
    (input.outputTokens / 1_000_000) * HAIKU_4_5_OUTPUT_USD_PER_MTOK;
  return inputCost + outputCost;
}

export async function extractFeatures(
  input: ExtractFeaturesInput
): Promise<ExtractFeaturesResult> {
  const { listingDetail, apiKey } = input;

  const client = new Anthropic({ apiKey });

  const userMessage = buildUserMessage(listingDetail);

  const response = await client.messages.create({
    model: AI_BUDGET.model,
    // Generous ceiling — the tool payload is bounded by the schema's
    // optional `rooms`/`smallPrint` arrays so the realistic worst case
    // is well under 1k output tokens. We keep slack so a verbose
    // floorplan listing doesn't get truncated mid-array.
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    tools: [
      {
        name: EXTRACT_FEATURES_TOOL_NAME,
        description:
          "Record the structured features extracted from a UK rental listing.",
        // Cast: the SDK types the input_schema as a JSONSchema object;
        // our hand-written const satisfies it but TS widens `enum`
        // arrays to `string[]` rather than the tuple shape the SDK
        // wants. `unknown` first to satisfy biome's strict cast rule.
        input_schema:
          EXTRACT_FEATURES_INPUT_SCHEMA as unknown as Anthropic.Messages.Tool["input_schema"],
      },
    ],
    // Force the model to call exactly this tool — no free-form text,
    // no choice between tools. Removes the "model decided to chat
    // instead" failure mode.
    tool_choice: { type: "tool", name: EXTRACT_FEATURES_TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.Messages.ToolUseBlock =>
      block.type === "tool_use" && block.name === EXTRACT_FEATURES_TOOL_NAME
  );
  if (!toolUse) {
    throw new Error(
      `extractFeatures: model did not return an ${EXTRACT_FEATURES_TOOL_NAME} tool call`
    );
  }

  // `toolUse.input` is typed as `unknown` by the SDK — Zod parse is the
  // runtime gate. A schema-violating response throws here, which the
  // calling task turns into an ai_runs failure row.
  const features = FeaturesSchema.parse(toolUse.input);

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const costUsd = computeCostUsd({ inputTokens, outputTokens });

  return { features, inputTokens, outputTokens, costUsd };
}

import "server-only";
import { anthropic, MODEL_ID } from "@/lib/analysis/anthropic";
import {
  summaryResultSchema,
  type ScoredItem,
  type SummaryResult,
} from "@/lib/analysis/types";

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    executive_summary: {
      type: "string",
      description:
        "Decision-ready memo, 3–6 short paragraphs. Lead with the opportunity, then category breakdown, then risks and recommended next step. Plain prose, no markdown headings.",
    },
    total_estimated_savings_low_pct: {
      type: ["number", "null"],
      description:
        "Project-level low end of plausible blended savings vs domestic, weighted by item importance. Null if there isn't enough signal.",
    },
    total_estimated_savings_high_pct: {
      type: ["number", "null"],
      description: "Project-level high end of plausible blended savings.",
    },
    key_risks: {
      type: "array",
      items: { type: "string" },
      description: "3–6 distinct procurement risks worth surfacing to the developer.",
    },
    recommended_next_steps: {
      type: "array",
      items: { type: "string" },
      description:
        "3–6 concrete next steps (e.g. 'Issue RFQ to 4 China flooring factories for the 18,400 SF engineered oak package').",
    },
  },
  required: [
    "executive_summary",
    "total_estimated_savings_low_pct",
    "total_estimated_savings_high_pct",
    "key_risks",
    "recommended_next_steps",
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are writing an executive procurement memo for a real estate developer.

Audience: a developer or import partner deciding whether to pursue overseas sourcing for this project's importable material categories. They want decision-ready content, not raw data.

Tone: direct, opinionated, grounded in the numbers. No hedging. No bullet lists or markdown headings in the executive_summary itself — write it as flowing paragraphs.

Cover:
- The opportunity in concrete terms (which category has the most leverage, rough volume, plausible blended savings range)
- Brief category-by-category read (what's a strong import fit, what's marginal, what to leave domestic)
- Top compliance or operational risks
- The single most useful next step

Use the per-item scores and savings ranges as your evidence. If overall savings aren't quantifiable from the items provided, say so explicitly rather than guessing.

Keep the summary tight — 3 to 6 short paragraphs, total under 350 words.`;

export async function summarizeAnalysis(items: ScoredItem[]): Promise<SummaryResult> {
  if (items.length === 0) {
    return {
      executive_summary:
        "No importable items could be extracted from this permit set. Re-upload with the relevant schedule sheets included before pursuing overseas sourcing analysis.",
      total_estimated_savings_low_pct: null,
      total_estimated_savings_high_pct: null,
      key_risks: ["No items extracted — verify the uploaded PDF contains material schedules."],
      recommended_next_steps: ["Re-upload a permit set that includes the relevant material schedules (door, finish, fixture, window, etc.)."],
    };
  }

  const categoryCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {});

  const stream = anthropic().messages.stream({
    model: MODEL_ID,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: SUMMARY_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Generate the executive procurement summary.

Item totals: ${JSON.stringify(categoryCounts)}
Total items: ${items.length}

Scored items:
${JSON.stringify({ items }, null, 2)}`,
      },
    ],
  });

  const msg = await stream.finalMessage();
  const textBlock = msg.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block for summary");
  }

  return summaryResultSchema.parse(JSON.parse(textBlock.text));
}

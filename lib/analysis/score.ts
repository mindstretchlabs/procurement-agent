import "server-only";
import { anthropic, MODEL_ID } from "@/lib/analysis/anthropic";
import {
  scoringResultSchema,
  type ExtractedItem,
  type ScoringResult,
} from "@/lib/analysis/types";

const SCORING_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["doors", "flooring"] },
          mark: { type: ["string", "null"] },
          description: { type: "string" },
          quantity: { type: ["number", "null"] },
          unit: { type: ["string", "null"] },
          dimensions: {
            type: ["object", "null"],
            properties: {
              width: { type: ["string", "null"] },
              height: { type: ["string", "null"] },
              thickness: { type: ["string", "null"] },
              raw: { type: ["string", "null"] },
            },
            additionalProperties: false,
          },
          specs: {
            type: ["object", "null"],
            additionalProperties: { type: ["string", "number", "boolean", "null"] },
          },
          certifications: { type: "array", items: { type: "string" } },
          import_suitability_score: {
            type: "number",
            minimum: 0,
            maximum: 100,
            description:
              "0–100 score for how well this item fits overseas (China) sourcing. 80+ = strong fit, 50–79 = workable with constraints, <50 = poor fit.",
          },
          import_suitability_reasoning: {
            type: "string",
            description:
              "2–4 sentence rationale grounded in volume, spec complexity, certification load, and trade lane risk.",
          },
          estimated_savings_low_pct: {
            type: ["number", "null"],
            description:
              "Low end of plausible landed-cost savings vs domestic supply, as a percent (0–60). Null if not enough info.",
          },
          estimated_savings_high_pct: {
            type: ["number", "null"],
            description: "High end of plausible landed-cost savings vs domestic supply (0–60). Null if not enough info.",
          },
          risk_notes: {
            type: ["string", "null"],
            description:
              "Sourcing or compliance risks worth flagging: fire ratings + UL listings + ANSI/BHMA hardware prep for doors, FloorScore/CARB Phase 2 + Lacey Act species sourcing + slip resistance for flooring, tariff exposure (Section 301), lead time, etc.",
          },
        },
        required: [
          "category",
          "mark",
          "description",
          "quantity",
          "unit",
          "dimensions",
          "specs",
          "certifications",
          "import_suitability_score",
          "import_suitability_reasoning",
          "estimated_savings_low_pct",
          "estimated_savings_high_pct",
          "risk_notes",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are a sourcing analyst scoring construction-material line items for overseas (China-first) import procurement.

You only score two categories: doors and flooring.

Score each item on import suitability (0–100) and estimate plausible landed-cost savings vs domestic supply.

Scoring guidance:
- Flooring (engineered wood, LVT/LVP, tile, laminate, sheet vinyl): generally high fit (75–95). High volume, modest compliance, mature China supply. Mind FloorScore / CARB Phase 2 / Lacey Act species sourcing and Section 301 tariffs on Chinese-origin plywood and LVP.
- Doors, split by type:
  - Commodity interior doors (hollow-core, solid-core MDF, primed, flat or 6-panel): very high fit (80–95).
  - Interior wood (stile-and-rail, stain-grade, sliding, barn): high fit (75–90).
  - Exterior + thermally broken (steel, fiberglass, French doors): 60–80. Confirm AAMA performance if used in fenestration.
  - Fire-rated assemblies (20/45/60/90-min, UL listing, hardware prep): much lower fit (35–60). UL traceability and hardware compatibility are real risks; many US fire-rated assemblies must be sourced from listed domestic manufacturers.

Modifiers that reduce the score: low quantity (<25 units for doors, <500 SF for flooring), heavy customization, exotic certifications, very tight lead time, prefinished factory hardware prep that's rarely produced for US market.

Savings estimates:
- Commodity interior doors: 30–50%
- Solid-wood / stile-and-rail interior doors: 25–40%
- Flooring (LVP, engineered wood, tile): 25–45%
- Specialty / fire-rated doors: 10–25%
- If the spec is so custom, low-volume, or compliance-restricted that overseas isn't realistic, set savings to null and explain in risk_notes.

Preserve every input field on every item (category, mark, description, quantity, unit, dimensions, specs, certifications) exactly as provided. Only add the four new scoring fields. Do not invent items or drop items.`;

export async function scoreItems(items: ExtractedItem[]): Promise<ScoringResult> {
  if (items.length === 0) {
    return { items: [] };
  }

  const response = await anthropic().messages.create({
    model: MODEL_ID,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: SCORING_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Score these ${items.length} extracted items for import suitability. Return the same items with the four scoring fields added.\n\n${JSON.stringify({ items }, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block for scoring");
  }

  return scoringResultSchema.parse(JSON.parse(textBlock.text));
}

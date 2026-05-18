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
          category: { type: "string", enum: ["windows", "doors", "flooring"] },
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
              "Sourcing or compliance risks worth flagging: NFRC/AAMA for windows, fire ratings + UL listings for doors, FloorScore/CARB + species for flooring, tariff exposure, lead time, etc.",
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

Score each item on import suitability (0–100) and estimate plausible landed-cost savings vs domestic supply.

Scoring guidance by category:
- Flooring (engineered wood, LVT, tile, laminate): generally high fit (75–95). High volume, modest compliance, mature China supply. Mind FloorScore / CARB Phase 2 / Lacey Act species sourcing.
- Windows: high fit but compliance-sensitive (60–85). Must hit NFRC ratings, AAMA performance class, often state/local energy code. Custom sizes raise tooling cost. Confirm glazing buildup and structural performance class. Aluminum and aluminum-clad wood are well-served overseas.
- Doors: split by type. Interior wood / sliding / barn doors: high fit (75–90). Fire-rated assemblies (20/45/60/90-min, UL listing, hardware prep): much lower fit (35–60) — UL traceability and hardware compatibility are real risks. Exterior + thermally broken: 60–80.

Modifiers that reduce the score: low quantity (<25 units for windows/doors, small SF for flooring), heavy customization, exotic certifications, very tight lead time, hardware/glazing combos rarely produced for US market.

Savings estimates:
- Flooring: typically 25–45% landed vs domestic
- Standard windows: 20–35%
- Fire-rated / certified specialty doors: 10–25%
- Commodity interior doors: 30–50%
- If the spec is so custom or low-volume that overseas isn't realistic, set savings to null and explain in risk_notes.

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

import "server-only";
import { anthropic, MODEL_ID } from "@/lib/analysis/anthropic";
import {
  CATEGORIES,
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
          category: { type: "string", enum: [...CATEGORIES] },
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
              "Sourcing or compliance risks worth flagging: certification requirements (UL, cUPC, NFRC, AHRI, ETL, etc.), tariff exposure (Section 301), lead time, shipping/logistics constraints, QC concerns, etc.",
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

Score each item on import suitability (0–100) and estimate plausible landed-cost savings vs domestic supply. Classify as:
- TIER 1 (score ≥80): High-priority import — strong ROI, proven overseas supply
- TIER 2 (score 50–79): Secondary import — workable with constraints
- DO NOT IMPORT (score <50): Source locally

Scoring guidance by category:

DOORS:
- Commodity interior (hollow-core, solid-core MDF, primed, flat/6-panel): 80–95. Savings 30–50%.
- Interior wood (stile-and-rail, stain-grade, sliding, barn): 75–90. Savings 25–40%.
- Exterior + thermally broken (steel, fiberglass): 60–80.
- Fire-rated (20/45/60/90-min, UL listing): 35–60. UL traceability is a real risk. Savings 10–25%.

FLOORING (LVT/LVP, engineered wood, laminate, sheet vinyl):
- Generally high fit: 75–95. Mature China supply. Savings 25–45%.
- Watch FloorScore / CARB Phase 2 / Section 301 tariffs on Chinese-origin plywood and LVP.

TILE (porcelain, ceramic):
- High fit: 75–90. China (Foshan) and Turkey are the global leaders. Savings 45–65%.
- Require ISO 13006, ASTM C648, radiation Class A, DCOF slip rating.

WINDOWS:
- Aluminum/aluminum-clad: 65–85. Strong Turkey and China supply. Savings 35–55%.
- Compliance-sensitive: must hit NFRC, AAMA 101, state energy code U-value/SHGC.
- Do not order without shop drawing review.

STOREFRONT / CURTAIN WALL:
- System packages: 60–80. Savings 35–50%.
- Must quote as complete system with NFRC/AAMA/safety glazing certs.
- High coordination risk on historic rehab or complex facades.

CABINETS / MILLWORK:
- Kitchen cabinets, vanities: 75–90. Savings 35–55%.
- Must comply with CARB Phase 2 / TSCA Title VI.
- Quote per kitchen type for repeatable unit projects.

FIXTURES (plumbing — WC, lavatory, faucet, bathtub, shower, kitchen sink):
- High fit: 80–95. Largest single import win on multifamily projects. Savings 45–65%.
- Must have cUPC/UPC, NSF 61, NSF 372, WaterSense. No exceptions.

LIGHTING (LED fixtures):
- High fit for commodity fixtures: 75–90. Savings 30–50%.
- Must be UL/ETL listed. CE-only is unacceptable for US market.
- DLC listing required for utility rebate eligibility.

RAILINGS / METALWORK:
- Good add-on package: 60–75. Savings 25–40%.
- Requires IBC guardrail compliance and engineer review of shop drawings.

HVAC (PTAC, PTHP, heat pump):
- Moderate fit: 50–70. Savings 20–35%.
- Must be UL listed, AHRI certified, 208/230V 60Hz.
- Warranty/service risk — better as value-engineered alternate than primary source.

Modifiers that reduce the score: low quantity, heavy customization, exotic certifications, very tight lead time, code jurisdictions with unusual requirements.

Preserve every input field on every item exactly as provided. Only add the four new scoring fields. Do not invent items or drop items.`;

export async function scoreItems(items: ExtractedItem[]): Promise<ScoringResult> {
  if (items.length === 0) {
    return { items: [] };
  }

  const response = await anthropic().messages.create({
    model: MODEL_ID,
    max_tokens: 32000,
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

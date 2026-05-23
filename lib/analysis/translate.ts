import "server-only";
import { anthropic, MODEL_ID } from "@/lib/analysis/anthropic";
import {
  sourcingBriefResultSchema,
  type ScoredItem,
  type SourcingBriefResult,
} from "@/lib/analysis/types";

const SOURCING_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    project_title_zh: {
      type: "string",
      description: "Project name/address in Chinese, e.g. '纽瓦克77大学大道 — 采购需求清单'",
    },
    intro_zh: {
      type: "string",
      description:
        "2–3 sentence intro in Chinese explaining this is a sourcing brief for a US multifamily project, listing the categories needed and total item count.",
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category_zh: { type: "string", description: "Category name in Chinese (e.g. '门', '地板')" },
          mark: { type: ["string", "null"] },
          description_zh: {
            type: "string",
            description: "Item description translated to Chinese, keeping technical terms accurate.",
          },
          quantity: { type: ["number", "null"] },
          unit_zh: { type: ["string", "null"], description: "Unit of measure in Chinese (e.g. '个', '平方英尺')" },
          dimensions_zh: {
            type: ["string", "null"],
            description: "Dimensions as a single string in Chinese (keep original imperial + add metric if helpful).",
          },
          specs_zh: {
            type: "string",
            description:
              "All specs as a readable Chinese paragraph: material, finish, fire rating, core type, wear layer, installation method, etc.",
          },
          certifications_zh: {
            type: "string",
            description:
              "Required certifications listed in Chinese with the original cert codes preserved (e.g. '需要 FloorScore 认证，CARB Phase 2 合规').",
          },
        },
        required: ["category_zh", "mark", "description_zh", "quantity", "unit_zh", "dimensions_zh", "specs_zh", "certifications_zh"],
        additionalProperties: false,
      },
    },
    notes_zh: {
      type: ["string", "null"],
      description: "Any sourcing notes or warnings in Chinese (missing specs, substitution restrictions, etc.).",
    },
  },
  required: ["project_title_zh", "intro_zh", "items", "notes_zh"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are translating a construction material sourcing brief from English to Chinese for Chinese factory partners.

Your audience: Chinese manufacturing and trading company sales reps who will quote against this list. They read Chinese natively and understand construction material terminology in both Chinese and English.

Rules:
- Translate descriptions, specs, and cert requirements into natural Chinese.
- Keep certification codes in their original form (FloorScore, CARB Phase 2, UL 10C, NFRC, ASTM F1700, cUPC, NSF 61, etc.) — these are international standards your audience recognizes.
- Keep type marks (D-01, F-3, etc.) unchanged.
- Keep quantities as numbers.
- For dimensions, keep the original imperial measurement and add metric in parentheses if it aids clarity.
- For specs, consolidate into a readable paragraph rather than key/value pairs.
- For certifications, list what the US project requires — the factory needs to know what certs to include in their quote.
- Be direct and professional. No marketing language.
- Items with import_suitability_score < 50 should NOT be included — they'll be sourced locally.`;

export async function generateSourcingBrief(args: {
  items: ScoredItem[];
  fileName: string;
}): Promise<SourcingBriefResult> {
  const { items, fileName } = args;

  const importableItems = items.filter((i) => i.import_suitability_score >= 50);

  if (importableItems.length === 0) {
    return {
      project_title_zh: "采购需求清单",
      intro_zh: "此项目未发现适合进口采购的物料。",
      items: [],
      notes_zh: null,
    };
  }

  const response = await anthropic().messages.create({
    model: MODEL_ID,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: SOURCING_BRIEF_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: `Translate this sourcing brief into Chinese for our factory partners.

Project file: ${fileName}
Total importable items: ${importableItems.length}

Items to translate (only those scoring ≥50 for import suitability):
${JSON.stringify({ items: importableItems }, null, 2)}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block for sourcing brief");
  }

  return sourcingBriefResultSchema.parse(JSON.parse(textBlock.text));
}

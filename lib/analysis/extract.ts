import "server-only";
import { anthropic, MODEL_ID } from "@/lib/analysis/anthropic";
import {
  CATEGORIES,
  extractionResultSchema,
  type Category,
  type ExtractionResult,
} from "@/lib/analysis/types";

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      description: "Every importable line item extracted from the schedules.",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: [...CATEGORIES] },
          mark: {
            type: ["string", "null"],
            description:
              "The schedule mark / tag from the drawings (e.g. W-01, D-12, F-3). Null if no mark is shown.",
          },
          description: {
            type: "string",
            description:
              "Short human-readable description (e.g. 'Fixed aluminum-clad wood window, double glazed').",
          },
          quantity: { type: ["number", "null"] },
          unit: {
            type: ["string", "null"],
            description: "Unit of measure (each, sq ft, sq m, linear ft, etc.).",
          },
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
            description:
              "Open-ended spec key/value pairs surfaced from the schedule (frame material, glazing, U-value, swing, fire rating, finish, species, plank size, etc.).",
            additionalProperties: { type: ["string", "number", "boolean", "null"] },
          },
          certifications: {
            type: "array",
            items: { type: "string" },
            description:
              "Certification or compliance callouts (NFRC, AAMA, Energy Star, UL, ASTM, FloorScore, CARB, etc.). Empty array if none.",
          },
        },
        required: ["category", "mark", "description", "quantity", "unit", "dimensions", "specs", "certifications"],
        additionalProperties: false,
      },
    },
    notes: {
      type: ["string", "null"],
      description:
        "Anything that affects sourcing but isn't a line item (missing schedules, illegible pages, alternate options listed, etc.).",
    },
  },
  required: ["items", "notes"],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are a construction-document analyst extracting procurement-ready material schedules from permit-set PDFs for import sourcing.

Extract items in these categories: doors, flooring, tile, windows, storefront, cabinets, fixtures, lighting, railings, hvac.

Be exhaustive. Capture every distinct line item from the relevant schedules. Each unique mark or product type is a separate item — do not collapse them.

When the document gives quantities, capture them as numbers. Use the unit field for the unit of measure. If a schedule lists 12 of mark D-01, that is one item with quantity=12. If exact quantities aren't available but you can estimate from unit count or area, provide the estimate and note "estimated" in the specs.

When dimensions appear, fill width/height/thickness when you can; always include the original raw dimension string in 'raw'.

Use the specs object for anything that affects sourcing. Keep keys lowercase snake_case. Category-specific guidance:

- Doors: core type (solid core, hollow core, MDF), face material, swing/handing, fire rating (20/45/60/90-min), undercut, prep (hinges/lockset/closer), finish, frame type (HM/wood/aluminum), hardware group reference.
- Flooring: product type (engineered wood, LVT/LVP, sheet vinyl, laminate, carpet tile), species or pattern, plank size, thickness, wear layer, AC rating, finish, installation method, underlayment.
- Tile: material (porcelain, ceramic), size, finish (matte/polished/honed), rectified, slip rating (DCOF), application (floor/wall/wet area).
- Windows: frame material (aluminum, vinyl, wood-clad), operation type (fixed, double-hung, casement, awning), glazing (single/double/triple, low-E, argon), U-value, SHGC, air/water rating.
- Storefront: system type (curtain wall, storefront, entrance), frame material, glazing type (tempered, laminated, insulated), thermal break.
- Cabinets: type (base, wall, tall, vanity), material (plywood, MDF, particleboard), face material, door style, finish, countertop material if included.
- Fixtures: fixture type (WC, lavatory, faucet, bathtub, shower, kitchen sink), material (vitreous china, stainless steel, acrylic), manufacturer/model if specified, ADA compliance.
- Lighting: fixture type (recessed, surface, pendant, sconce, exit), lamp type (LED), mounting, rated for wet/damp location, emergency/egress.
- Railings: type (guardrail, handrail, balcony), material (steel, aluminum, glass), finish, height.
- HVAC: equipment type (PTAC, PTHP, split system, DOAS), capacity, voltage/phase, efficiency rating.

For certifications, include only those actually called out on the drawings or specs. Don't infer.

If a category is absent from the document, just skip it. If schedules are unreadable or reference separate spec sections not included, surface that in 'notes'.

Do not include items outside the target categories (skip concrete, lumber, drywall, paint, fire alarm, sprinkler, elevator, electrical panels).`;

export async function extractItems(args: {
  pdfBytes: Buffer;
  fileName: string;
  categories: readonly Category[];
}): Promise<ExtractionResult> {
  const { pdfBytes, fileName, categories } = args;
  const client = anthropic();

  const useFilesApi = pdfBytes.byteLength > 25 * 1024 * 1024;

  const userInstruction = `Extract every importable item from this permit set.

File: ${fileName}
Target categories: ${categories.join(", ")}

Return strict JSON matching the schema. Be exhaustive — missing items mean missed savings later.`;

  let fileId: string | null = null;

  try {
    let responseText: string;

    if (useFilesApi) {
      const uploaded = await client.beta.files.upload({
        file: new File([new Uint8Array(pdfBytes)], fileName, { type: "application/pdf" }),
        betas: ["files-api-2025-04-14"],
      });
      fileId = uploaded.id;

      const response = await client.beta.messages.create({
        model: MODEL_ID,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        output_config: {
          format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
        },
        betas: ["files-api-2025-04-14"],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "file", file_id: uploaded.id },
                title: fileName,
                citations: { enabled: false },
              },
              { type: "text", text: userInstruction },
            ],
          },
        ],
      });
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") throw new Error("Claude returned no text block for extraction");
      responseText = block.text;
    } else {
      const response = await client.messages.create({
        model: MODEL_ID,
        max_tokens: 32000,
        system: SYSTEM_PROMPT,
        output_config: {
          format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBytes.toString("base64"),
                },
                title: fileName,
                citations: { enabled: false },
              },
              { type: "text", text: userInstruction },
            ],
          },
        ],
      });
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") throw new Error("Claude returned no text block for extraction");
      responseText = block.text;
    }

    const parsed = extractionResultSchema.parse(JSON.parse(responseText));
    // Defensive: drop items outside the requested categories.
    return {
      ...parsed,
      items: parsed.items.filter((item) => categories.includes(item.category)),
    };
  } finally {
    if (fileId) {
      await client.beta.files
        .delete(fileId, { betas: ["files-api-2025-04-14"] })
        .catch((err) => {
          console.warn(`Failed to delete uploaded file ${fileId}:`, err);
        });
    }
  }
}

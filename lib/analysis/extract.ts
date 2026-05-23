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

const SYSTEM_PROMPT = `You are a construction-document analyst extracting procurement-ready material schedules from permit-set PDFs.

You only care about two categories: doors and flooring. Ignore windows, fixtures, hardware, and everything else.

Be exhaustive within those two categories. Capture every distinct line item from door schedules and finish/flooring schedules. Each unique mark or product type is a separate item — do not collapse them.

When the document gives quantities, capture them as numbers (no units in the number field). Use the unit field for the unit of measure. If a schedule lists 12 of mark D-01, that is one item with quantity=12.

When dimensions appear, fill width/height/thickness when you can identify them; always include the original raw dimension string in 'raw' so nothing is lost. For doors that's typically nominal width x height (e.g. 3'-0" x 7'-0") and door thickness (1-3/8" or 1-3/4"). For flooring, capture plank/tile size and total square footage if shown.

Use the specs object for anything that affects sourcing:
- Doors: core type (solid core, hollow core, MDF), face material, swing/handing, fire rating (20/45/60/90-min), undercut, prep (hinges/lockset/closer), finish (primed, prefinished), frame type, hardware group reference.
- Flooring: product type (engineered wood, LVT/LVP, tile, sheet vinyl, laminate, carpet), species or pattern, plank/tile size, thickness, wear layer mil (for LVT/LVP), AC rating (for laminate), finish, installation method (glue-down, click-lock, nail), underlayment.
Keep keys lowercase snake_case.

For certifications, include only those actually called out on the drawings or specs. Don't infer.

If a category is absent from the document, return an empty items list for it (i.e. just include the items you found). If schedules are unreadable, missing pages, or you see "see Spec X" without the spec attached, surface that in 'notes'.

Do not include items outside the two target categories.`;

export async function extractItems(args: {
  pdfBytes: Buffer;
  fileName: string;
  categories: readonly Category[];
}): Promise<ExtractionResult> {
  const { pdfBytes, fileName, categories } = args;
  const client = anthropic();

  // Upload via the Files API (beta) so we don't hit the ~32 MB inline base64
  // ceiling. The same file_id can be reused across requests; we delete it
  // when extraction is done because no downstream stage needs the PDF.
  const uploaded = await client.beta.files.upload({
    file: new File([new Uint8Array(pdfBytes)], fileName, { type: "application/pdf" }),
    betas: ["files-api-2025-04-14"],
  });

  try {
    const userInstruction = `Extract every door and flooring item from this permit set.

File: ${fileName}
Target categories: ${categories.join(", ")}

Return strict JSON matching the schema. Be exhaustive — missing items mean missed savings later.`;

    const response = await client.beta.messages.create({
      model: MODEL_ID,
      max_tokens: 16000,
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

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude returned no text block for extraction");
    }

    const parsed = extractionResultSchema.parse(JSON.parse(textBlock.text));
    // Defensive: drop items outside the requested categories.
    return {
      ...parsed,
      items: parsed.items.filter((item) => categories.includes(item.category)),
    };
  } finally {
    await client.beta.files
      .delete(uploaded.id, { betas: ["files-api-2025-04-14"] })
      .catch((err) => {
        console.warn(`Failed to delete uploaded file ${uploaded.id}:`, err);
      });
  }
}

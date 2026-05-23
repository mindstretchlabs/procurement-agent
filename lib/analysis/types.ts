import { z } from "zod";

export const CATEGORIES = ["doors", "flooring"] as const;
export type Category = (typeof CATEGORIES)[number];

export const dimensionsSchema = z
  .object({
    width: z.string().nullable().optional(),
    height: z.string().nullable().optional(),
    thickness: z.string().nullable().optional(),
    raw: z.string().nullable().optional(),
  })
  .partial();

export const extractedItemSchema = z.object({
  category: z.enum(CATEGORIES),
  mark: z.string().nullable(),
  description: z.string(),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  dimensions: dimensionsSchema.nullable(),
  specs: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable(),
  certifications: z.array(z.string()),
});
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

export const extractionResultSchema = z.object({
  items: z.array(extractedItemSchema),
  notes: z.string().nullable(),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const scoredItemSchema = extractedItemSchema.extend({
  import_suitability_score: z.number().min(0).max(100),
  import_suitability_reasoning: z.string(),
  estimated_savings_low_pct: z.number().nullable(),
  estimated_savings_high_pct: z.number().nullable(),
  risk_notes: z.string().nullable(),
});
export type ScoredItem = z.infer<typeof scoredItemSchema>;

export const scoringResultSchema = z.object({
  items: z.array(scoredItemSchema),
});
export type ScoringResult = z.infer<typeof scoringResultSchema>;

export const summaryResultSchema = z.object({
  executive_summary: z.string(),
  total_estimated_savings_low_pct: z.number().nullable(),
  total_estimated_savings_high_pct: z.number().nullable(),
  key_risks: z.array(z.string()),
  recommended_next_steps: z.array(z.string()),
});
export type SummaryResult = z.infer<typeof summaryResultSchema>;

export const sourcingBriefItemSchema = z.object({
  category_zh: z.string(),
  mark: z.string().nullable(),
  description_zh: z.string(),
  quantity: z.number().nullable(),
  unit_zh: z.string().nullable(),
  dimensions_zh: z.string().nullable(),
  specs_zh: z.string(),
  certifications_zh: z.string(),
});
export type SourcingBriefItem = z.infer<typeof sourcingBriefItemSchema>;

export const sourcingBriefResultSchema = z.object({
  project_title_zh: z.string(),
  intro_zh: z.string(),
  items: z.array(sourcingBriefItemSchema),
  notes_zh: z.string().nullable(),
});
export type SourcingBriefResult = z.infer<typeof sourcingBriefResultSchema>;

import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  SUPABASE_STORAGE_BUCKET: z.string().min(1).default("permit-sets"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

function load(): ServerEnv {
  return serverSchema.parse({
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? "permit-sets",
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
}

/**
 * Lazily parse and validate server env. Throws on first access if any required
 * variable is missing. Cached after the first successful parse so we don't
 * re-validate per request.
 */
export const serverEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: keyof ServerEnv) {
    if (!cached) cached = load();
    return cached[prop];
  },
});

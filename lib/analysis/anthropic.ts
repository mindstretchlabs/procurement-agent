import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env.server";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (cached) return cached;
  cached = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  return cached;
}

export const MODEL_ID = "claude-opus-4-7";

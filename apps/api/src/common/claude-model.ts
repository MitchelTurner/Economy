/** Default vision/text model for receipt extraction + insight narration. */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';

/**
 * Retired Claude API IDs → current replacements.
 * Anthropic retired `claude-sonnet-4-20250514` / `claude-opus-4-20250514` (404 not_found).
 * Remap so Railway deploys that still set the old EXTRACTION_MODEL keep working.
 */
const RETIRED_MODEL_ALIASES: Record<string, string> = {
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-sonnet-4-0': 'claude-sonnet-4-6',
  'claude-opus-4-20250514': 'claude-opus-4-8',
  'claude-opus-4-0': 'claude-opus-4-8',
};

export function resolveClaudeModel(configured?: string | null): string {
  const raw = configured?.trim() || DEFAULT_CLAUDE_MODEL;
  return RETIRED_MODEL_ALIASES[raw] ?? raw;
}

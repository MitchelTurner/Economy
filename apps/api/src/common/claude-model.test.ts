import { describe, expect, it } from 'vitest';
import { DEFAULT_CLAUDE_MODEL, resolveClaudeModel } from './claude-model';

describe('resolveClaudeModel', () => {
  it('defaults to current Sonnet when unset', () => {
    expect(resolveClaudeModel(undefined)).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveClaudeModel('')).toBe(DEFAULT_CLAUDE_MODEL);
    expect(resolveClaudeModel('   ')).toBe(DEFAULT_CLAUDE_MODEL);
  });

  it('remaps retired Sonnet 4 / Opus 4 IDs that now 404', () => {
    expect(resolveClaudeModel('claude-sonnet-4-20250514')).toBe('claude-sonnet-4-6');
    expect(resolveClaudeModel('claude-opus-4-20250514')).toBe('claude-opus-4-8');
  });

  it('passes through current model IDs', () => {
    expect(resolveClaudeModel('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(resolveClaudeModel('claude-sonnet-5')).toBe('claude-sonnet-5');
  });
});

import { describe, expect, it } from 'vitest';
import { endOfUtcWeek, startOfUtcWeek } from './period-windows';

describe('budget period windows', () => {
  it('weekly window is Mon–Sun UTC', () => {
    // Wednesday Jul 22, 2026
    const now = new Date('2026-07-22T15:00:00Z');
    const start = startOfUtcWeek(now);
    const end = endOfUtcWeek(now);
    expect(start.toISOString()).toBe('2026-07-20T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-26T23:59:59.999Z');
  });

  it('Sunday belongs to the week that started the prior Monday', () => {
    const sunday = new Date('2026-07-26T12:00:00Z');
    expect(startOfUtcWeek(sunday).toISOString()).toBe('2026-07-20T00:00:00.000Z');
  });
});

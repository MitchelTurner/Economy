import { describe, expect, it } from 'vitest';
import { isHeicFile } from './image';

describe('isHeicFile', () => {
  it('detects by mime and extension', () => {
    expect(isHeicFile({ type: 'image/heic', name: 'a.jpg' } as File)).toBe(true);
    expect(isHeicFile({ type: '', name: 'photo.HEIF' } as File)).toBe(true);
    expect(isHeicFile({ type: 'image/jpeg', name: 'a.jpg' } as File)).toBe(false);
  });
});

/**
 * The rules about what may be uploaded.
 *
 * Pure, and tested directly, because both the form and the server action lean
 * on them and they have to agree: a form that allows what the action refuses
 * spends a minute uploading before saying no.
 */

import { describe, it, expect } from 'vitest';
import { MAX_IMAGE_BYTES, checkImage, isImageType, safeFileName } from '../lib/uploads';

describe('isImageType', () => {
  it('accepts the four types the app stores', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      expect(isImageType(type)).toBe(true);
    }
  });

  it('rejects anything else, including things that merely look like images', () => {
    for (const type of ['application/pdf', 'text/html', 'image/svg+xml', '', 'image']) {
      expect(isImageType(type)).toBe(false);
    }
  });

  // SVG is a document that can carry script, and it is served back to a
  // signed-in member. It is left out on purpose rather than by oversight.
  it('rejects SVG deliberately', () => {
    expect(isImageType('image/svg+xml')).toBe(false);
  });
});

describe('checkImage', () => {
  it('passes an ordinary screenshot', () => {
    expect(checkImage({ type: 'image/png', size: 200_000 })).toBeNull();
  });

  it('names the problem rather than just refusing', () => {
    expect(checkImage({ type: 'application/pdf', size: 10 })).toBe('uploads.error.type');
    expect(checkImage({ type: 'image/png', size: 0 })).toBe('uploads.error.empty');
    expect(checkImage({ type: 'image/png', size: MAX_IMAGE_BYTES + 1 })).toBe(
      'uploads.error.tooBig'
    );
  });

  it('allows a file exactly at the limit', () => {
    expect(checkImage({ type: 'image/png', size: MAX_IMAGE_BYTES })).toBeNull();
  });

  // An empty file of a type that is refused anyway: the emptier problem is
  // reported first, so the message matches what the person actually picked.
  it('reports an empty file before its type', () => {
    expect(checkImage({ type: 'application/pdf', size: 0 })).toBe('uploads.error.empty');
  });
});

describe('safeFileName', () => {
  it('keeps an ordinary name', () => {
    expect(safeFileName('screenshot 2026-09-17.png')).toBe('screenshot 2026-09-17.png');
  });

  it('keeps Thai names, which is most of them here', () => {
    expect(safeFileName('หน้าจอ.png')).toBe('หน้าจอ.png');
  });

  it('drops any path, whichever slash it came with', () => {
    expect(safeFileName('../../etc/passwd.png')).toBe('passwd.png');
    expect(safeFileName('C:\\Users\\me\\shot.png')).toBe('shot.png');
  });

  it('strips characters that have no business in a name', () => {
    expect(safeFileName('a<b>c:d"e|f?g*h.png')).toBe('abcdefgh.png');
  });

  it('falls back rather than returning nothing', () => {
    expect(safeFileName('')).toBe('image');
    expect(safeFileName('///')).toBe('image');
    expect(safeFileName('???')).toBe('image');
  });

  it('caps a name long enough to be a problem', () => {
    expect(safeFileName('x'.repeat(500)).length).toBe(120);
  });
});

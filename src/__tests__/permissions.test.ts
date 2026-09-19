import { describe, it, expect } from 'vitest';
import {
  ABILITIES,
  can,
  effectiveAbilities,
  parseOverrides,
  pruneOverrides,
  roleDefault,
  serializeOverrides,
  storedJson,
} from '../lib/permissions';

describe('roleDefault', () => {
  it('gives admin everything', () => {
    for (const ability of ABILITIES) expect(roleDefault('admin', ability)).toBe(true);
  });

  // The advisor directs the work; the topics on the agenda are other people's.
  it('lets an advisor direct work but not touch the agenda', () => {
    expect(roleDefault('professor', 'assignWork')).toBe(true);
    expect(roleDefault('professor', 'removeAnyWork')).toBe(true);
    expect(roleDefault('professor', 'addTopic')).toBe(false);
    expect(roleDefault('professor', 'arrangeOrder')).toBe(false);
  });

  it('leaves a student their own topic and nothing of anybody else', () => {
    expect(roleDefault('student', 'addTopic')).toBe(true);
    expect(roleDefault('student', 'editAnyTopic')).toBe(false);
    expect(roleDefault('student', 'assignWork')).toBe(false);
    expect(roleDefault('student', 'removeAnyWork')).toBe(false);
  });
});

describe('can', () => {
  it('falls back to the role when nothing is overridden', () => {
    expect(can({ role: 'student', abilities: {} }, 'assignWork')).toBe(false);
    expect(can({ role: 'professor', abilities: {} }, 'assignWork')).toBe(true);
  });

  // The whole point: the exception without the promotion.
  it('grants one ability without granting the role', () => {
    const actor = { role: 'student' as const, abilities: { arrangeOrder: true } };
    expect(can(actor, 'arrangeOrder')).toBe(true);
    expect(can(actor, 'assignWork')).toBe(false);
  });

  it('takes one away without demoting anybody', () => {
    const actor = { role: 'professor' as const, abilities: { assignWork: false } };
    expect(can(actor, 'assignWork')).toBe(false);
    expect(can(actor, 'editAnyWork')).toBe(true);
  });
});

describe('parseOverrides', () => {
  it('reads the stored shape', () => {
    expect(parseOverrides('{"addTopic":false,"arrangeOrder":true}')).toEqual({
      addTopic: false,
      arrangeOrder: true,
    });
  });

  it('treats an empty column as no override at all', () => {
    expect(parseOverrides('')).toEqual({});
    expect(parseOverrides('   ')).toEqual({});
    expect(parseOverrides(undefined)).toEqual({});
  });

  /**
   * A row mangled by a hand-edit must not lock somebody out: the role is
   * always a safe answer, so anything unreadable is simply no override.
   */
  it('survives junk in the column', () => {
    expect(parseOverrides('not json')).toEqual({});
    expect(parseOverrides('[1,2,3]')).toEqual({});
    expect(parseOverrides('null')).toEqual({});
  });

  /**
   * The repository decodes any cell beginning with `{` as JSON, so a saved
   * override comes back an object rather than a string. Reading only the
   * string was a silent no-op: written to the sheet, shown in the table, and
   * granting nothing at all.
   */
  it('reads the object the repository hands back, not only a string', () => {
    expect(parseOverrides({ arrangeOrder: true })).toEqual({ arrangeOrder: true });
    expect(storedJson({ arrangeOrder: true })).toBe('{"arrangeOrder":true}');
    expect(storedJson('')).toBe('');
    expect(storedJson(undefined)).toBe('');
  });

  it('ignores keys that are not abilities, and values that are not booleans', () => {
    expect(parseOverrides('{"beAdmin":true,"addTopic":"yes","arrangeOrder":true}')).toEqual({
      arrangeOrder: true,
    });
  });
});

describe('pruneOverrides and serializeOverrides', () => {
  /**
   * Only the difference is stored, so a later change to what a role means
   * still reaches everybody who was left on the default.
   */
  it('keeps only what differs from the role', () => {
    const wanted = { addTopic: true, arrangeOrder: true, assignWork: false };
    expect(pruneOverrides('student', wanted)).toEqual({ arrangeOrder: true });
  });

  it('writes nothing at all when the person matches their role', () => {
    const asRole = Object.fromEntries(
      ABILITIES.map((a) => [a, roleDefault('professor', a)])
    ) as Record<string, boolean>;
    expect(serializeOverrides('professor', asRole)).toBe('');
  });

  it('round-trips through the column', () => {
    const stored = serializeOverrides('student', { arrangeOrder: true, editAnyTopic: true });
    expect(parseOverrides(stored)).toEqual({ arrangeOrder: true, editAnyTopic: true });
  });
});

describe('effectiveAbilities', () => {
  it('resolves every ability for the table to draw', () => {
    const resolved = effectiveAbilities('student', '{"arrangeOrder":true}');

    expect(resolved.arrangeOrder).toBe(true);
    expect(resolved.addTopic).toBe(true); // the student default
    expect(resolved.assignWork).toBe(false);
    expect(Object.keys(resolved).sort()).toEqual([...ABILITIES].sort());
  });
});

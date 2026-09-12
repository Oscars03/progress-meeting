import { describe, it, expect } from 'vitest';
import { writeQueue } from '../lib/db/write-queue';

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status } });
}

describe('writeQueue mutual exclusion', () => {
  it('never lets two tasks hold the same tab concurrently', async () => {
    let concurrent = 0;
    let max = 0;

    const job = () =>
      writeQueue.enqueue('tasks', async () => {
        concurrent++;
        max = Math.max(max, concurrent);
        await new Promise((r) => setTimeout(r, Math.random() * 4));
        concurrent--;
      });

    const all: Promise<void>[] = [];
    for (let i = 0; i < 60; i++) {
      all.push(job());
      if (i % 3 === 0) await new Promise((r) => setTimeout(r, 1));
    }
    await Promise.all(all);

    expect(max).toBe(1);
  });

  it('releases the lock when a task throws', async () => {
    await expect(
      writeQueue.enqueue('users', async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');

    await expect(writeQueue.enqueue('users', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('writeQueue retry policy', () => {
  it('retries a 429', async () => {
    let attempts = 0;
    const result = await writeQueue.withRetry(async () => {
      attempts++;
      if (attempts < 2) throw httpError(429);
      return 'done';
    }, 3);

    expect(result).toBe('done');
    expect(attempts).toBe(2);
  });

  // Regression: 403 from the Sheets API is a permissions failure that will
  // never succeed, but it used to be retried three times.
  it('does not retry a 403', async () => {
    let attempts = 0;
    await expect(
      writeQueue.withRetry(async () => {
        attempts++;
        throw httpError(403);
      }, 3)
    ).rejects.toThrow('HTTP 403');

    expect(attempts).toBe(1);
  });

  it('does not retry a non-HTTP error', async () => {
    let attempts = 0;
    await expect(
      writeQueue.withRetry(async () => {
        attempts++;
        throw new Error('bad input');
      }, 3)
    ).rejects.toThrow('bad input');

    expect(attempts).toBe(1);
  });
});

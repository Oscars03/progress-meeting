type Task<T> = () => Promise<T>;

class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  async lock(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.locked = true;

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.locked = false;
      this.queue.shift()?.();
    };
  }

  get depth(): number {
    return this.queue.length;
  }

  get busy(): boolean {
    return this.locked;
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const e = error as { status?: unknown; response?: { status?: unknown } };
  const raw = e.response?.status ?? e.status;
  return typeof raw === 'number' ? raw : undefined;
}

function retryAfterMs(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const headers = (error as { response?: { headers?: Record<string, unknown> } }).response?.headers;
  const raw = headers?.['retry-after'];
  const seconds = Number.parseInt(String(raw ?? ''), 10);
  return Number.isNaN(seconds) ? undefined : seconds * 1000;
}

/**
 * Transient only. 403 is deliberately excluded: from the Sheets API it is
 * almost always a permissions failure that will never succeed, and retrying it
 * costs three attempts and several seconds of held mutex before surfacing.
 */
function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined) return false;
  return status === 429 || (status >= 500 && status < 600);
}

class WriteQueue {
  private mutexes = new Map<string, Mutex>();

  private getMutex(tabName: string): Mutex {
    let m = this.mutexes.get(tabName);
    if (!m) {
      m = new Mutex();
      this.mutexes.set(tabName, m);
    }
    return m;
  }

  async enqueue<T>(tabName: string, task: Task<T>): Promise<T> {
    const unlock = await this.getMutex(tabName).lock();
    try {
      return await this.withRetry(task);
    } finally {
      unlock();
    }
  }

  async withRetry<T>(task: Task<T>, maxRetries = 3): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (attempt >= maxRetries || !isTransient(error)) throw error;

        const delayMs = retryAfterMs(error) ?? 2 ** attempt * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  }

  /** Callers waiting for the lock, excluding the one currently holding it. */
  getQueueDepth(tabName: string): number {
    return this.mutexes.get(tabName)?.depth ?? 0;
  }

  isBusy(tabName: string): boolean {
    return this.mutexes.get(tabName)?.busy ?? false;
  }
}

export const writeQueue = new WriteQueue();

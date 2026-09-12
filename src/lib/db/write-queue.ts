type Task<T> = () => Promise<T>;

class Mutex {
  private queue: Array<(value: void | PromiseLike<void>) => void> = [];
  private locked = false;

  async lock(): Promise<() => void> {
    if (this.locked) {
      await new Promise<void>(resolve => this.queue.push(resolve));
    }
    this.locked = true;
    return () => {
      this.locked = false;
      const next = this.queue.shift();
      if (next) next();
    };
  }
}

class WriteQueue {
  private mutexes: Record<string, Mutex> = {};

  private getMutex(tabName: string) {
    if (!this.mutexes[tabName]) {
      this.mutexes[tabName] = new Mutex();
    }
    return this.mutexes[tabName];
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
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        return await task();
      } catch (error: any) {
        attempt++;
        const status = error?.response?.status;
        if ((status === 429 || status === 403) && attempt < maxRetries) {
          const retryAfter = error?.response?.headers?.['retry-after'];
          const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          throw error;
        }
      }
    }
    throw new Error('Max retries exceeded');
  }

  getQueueDepth(tabName: string): number {
    return this.mutexes[tabName] ? (this.mutexes[tabName] as any).queue.length : 0;
  }
}

export const writeQueue = new WriteQueue();

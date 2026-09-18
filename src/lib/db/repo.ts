/**
 * The whole surface the app uses to reach its data.
 *
 * Nothing outside `lib/db/` knows the rows live in a spreadsheet: no page
 * builds a range, no action knows what a tab is. Every one of the 228 call
 * sites goes through the ten methods below, which is the single most useful
 * fact about this codebase if the database ever moves -- see DB-MIGRATION.md.
 *
 * Writing that surface down does three things:
 *
 * - a second backend is a class that satisfies `Repo`, and the compiler says
 *   whether it does, rather than a search for everything that broke;
 * - it marks what may be added carelessly. A method here is a method every
 *   future backend has to implement, so `find` and `findOne` are cheap and a
 *   `getRawValues` is not;
 * - it names the two methods that are *not* about data at all.
 *   `preloadCache` and `clearCache` exist because reading a Google tab costs
 *   ~400 ms whatever is in it. A database answering in 10 ms would implement
 *   them as no-ops, and that is the honest shape of the thing.
 *
 * This is deliberately the surface as it is today, not a tidier one. A seam
 * that quietly changes the contract is not a seam.
 */

import type { AnyRecord, BaseRecord, CellValue, TableName } from './schema';
import { SheetRepo } from './sheet-repo';

/** What a `uniqueBy` match should do -- see `Repo.insert`. */
export type OnConflict = 'keep' | 'update';

export type InsertOptions = {
  /**
   * Column-value pairs that must be unique. A row already matching all of
   * them means the insert is skipped and that row returned.
   *
   * On Sheets this is a read inside a per-process mutex, which leaves a race
   * between instances. On a real database it is a `UNIQUE` index and an
   * `ON CONFLICT` clause, and the race closes -- which is the main reason
   * DB-MIGRATION.md exists.
   */
  uniqueBy?: Record<string, CellValue>;
  onConflict?: OnConflict;
};

export type Repo = {
  find<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    options?: { fresh?: boolean }
  ): Promise<T[]>;

  findOne<T extends BaseRecord = AnyRecord>(tabName: TableName, id: string): Promise<T | null>;

  insert<T extends Record<string, CellValue>>(
    tabName: TableName,
    record: T,
    actorId?: string,
    options?: InsertOptions
  ): Promise<T & BaseRecord>;

  /** Refuses unless `expectedVersion` is the version that was read. */
  update<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    id: string,
    record: Partial<Record<string, CellValue>>,
    expectedVersion: number,
    actorId?: string
  ): Promise<T>;

  delete(
    tabName: TableName,
    id: string,
    expectedVersion: number,
    actorId?: string
  ): Promise<void>;

  deleteMany(
    tabName: TableName,
    items: { id: string; expectedVersion: number }[],
    actorId?: string
  ): Promise<void>;

  updateMany<T extends BaseRecord = AnyRecord>(
    tabName: TableName,
    items: { id: string; fields: Partial<Record<string, CellValue>>; expectedVersion: number }[],
    actorId?: string
  ): Promise<T[]>;

  /** Rows as written, header included. Only the schema migration wants this. */
  getRawValues(tabName: TableName): Promise<string[][]>;

  /** Both exist to hide a slow backend; a fast one can leave them empty. */
  preloadCache(tabNames: TableName[]): Promise<void>;
  clearCache(): void;
};

/**
 * The backend in use.
 *
 * Exported as a value so the assignment itself is the check: if `SheetRepo`
 * ever stops satisfying `Repo`, this line fails to compile rather than some
 * page failing at run time. A future `PgRepo` swaps in here and nowhere else.
 *
 * Existing code calls `SheetRepo` directly and there is no reason to churn
 * 228 call sites to change the name. New code can import this instead.
 */
export const repo: Repo = SheetRepo;

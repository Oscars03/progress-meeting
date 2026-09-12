/**
 * Additive schema migration: create missing tabs, append missing columns.
 *
 * Use this rather than db:init once a sheet holds data. db:init rewrites every
 * header row in place, which shifts values out from under their columns if the
 * layout has drifted; this only ever appends to the right.
 */
import { migrateSchema, planMigration, SCHEMA_VERSION } from '../src/lib/db/migrate-schema';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  if (dryRun) {
    const plan = await planMigration();
    console.log('Dry run -- nothing will be written.');
    console.log('  tabs to create :', plan.createTabs.join(', ') || '(none)');
    for (const { tab, columns } of plan.addColumns) {
      console.log(`  add to ${tab} :`, columns.join(', '));
    }
    if (plan.addColumns.length === 0) console.log('  columns to add : (none)');
    if (plan.conflicts.length > 0) {
      console.log('  CONFLICTS:');
      for (const c of plan.conflicts) {
        console.log(`    ${c.tab} column ${c.position + 1}: found "${c.found}", expected "${c.expected}"`);
      }
    }
    return;
  }

  const result = await migrateSchema('cli');
  if (!result.applied) {
    console.log(`Already at schema version ${SCHEMA_VERSION}; nothing to do.`);
    return;
  }
  console.log(`Migrated schema ${result.fromVersion ?? '(unversioned)'} -> ${result.toVersion}`);
  console.log('  created tabs :', result.createTabs.join(', ') || '(none)');
  for (const { tab, columns } of result.addColumns) {
    console.log(`  added to ${tab} :`, columns.join(', '));
  }
}

main().catch((err) => {
  console.error('Migration failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});

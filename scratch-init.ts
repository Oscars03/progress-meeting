import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { initDatabase } from './src/lib/db/init-db';

initDatabase({ force: true })
  .then(res => console.log('Init success:', res))
  .catch(err => console.error('Init error:', err));

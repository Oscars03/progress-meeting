import { initDatabase } from '../src/lib/db/init-db';

console.log('Initializing database from CLI...');
initDatabase()
  .then((res) => {
    console.log(`Database initialized successfully. Seeded ${res.seededCount} users.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });

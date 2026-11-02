import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { getDb } from './db'

migrate(getDb(), { migrationsFolder: './drizzle' }).then(
  () => { console.log('Migrations applied'); process.exit(0) },
  (e) => { console.error(e); process.exit(1) },
)

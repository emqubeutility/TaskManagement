import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import ws from 'ws'
import * as schema from './schema'

neonConfig.webSocketConstructor = ws

let instance: ReturnType<typeof make> | undefined

function make() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  return drizzle(pool, { schema })
}

export function getDb() {
  return (instance ??= make())
}

export type Db = ReturnType<typeof getDb>
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
export type DbLike = Db | Tx

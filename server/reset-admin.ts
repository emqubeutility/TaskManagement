import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb } from './db'
import { loginAttempts, sessions, users } from './schema'

// Puts the admin back on TEMP_PASSWORD (they must change it at next sign-in) and clears any login lockout.
async function main() {
  const db = getDb()
  const email = (process.env.ADMIN_EMAIL ?? 'mohammed@emqube.com').toLowerCase()
  const temp = process.env.TEMP_PASSWORD
  if (!temp) throw new Error('TEMP_PASSWORD is not set')

  const [user] = await db
    .update(users)
    .set({ passwordHash: await bcrypt.hash(temp, 10), mustChangePassword: true, active: true })
    .where(eq(users.email, email))
    .returning({ id: users.id })
  if (!user) throw new Error(`No user with email ${email}. Run npm run db:seed first.`)

  await db.delete(sessions).where(eq(sessions.userId, user.id))
  await db.delete(loginAttempts)
  console.log(`Reset ${email}: sign in with TEMP_PASSWORD, then choose a new password. Lockouts cleared.`)
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })

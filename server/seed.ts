import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { makeInitials, pickColour } from './auth'
import { getDb } from './db'
import { clients, taskTypes, users } from './schema'

async function main() {
  const db = getDb()
  const email = (process.env.ADMIN_EMAIL ?? 'mohammed@emqube.com').toLowerCase()
  const name = process.env.ADMIN_NAME ?? 'Mohammed'
  const temp = process.env.TEMP_PASSWORD
  if (!temp) throw new Error('TEMP_PASSWORD is not set')

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email))
  if (existing) {
    console.log(`Admin ${email} already exists`)
  } else {
    await db.insert(users).values({
      name, email, passwordHash: await bcrypt.hash(temp, 10), initials: makeInitials(name),
      colour: pickColour(0), role: 'admin', mustChangePassword: true,
    })
    console.log(`Created admin ${email} (temporary password from TEMP_PASSWORD)`)
  }

  // Starter lists - edit freely in the Admin screen.
  await db.insert(taskTypes).values(['Reel', 'Post', 'Story', 'Carousel', 'Video', 'Blog'].map((n) => ({ name: n }))).onConflictDoNothing()
  await db.insert(clients).values([{ name: 'Internal' }]).onConflictDoNothing()
  console.log('Seed complete')
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1) })

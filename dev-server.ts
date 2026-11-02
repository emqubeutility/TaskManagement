import { serve } from '@hono/node-server'
import { app } from './server/app'

serve({ fetch: app.fetch, port: 3000 }, (i) => console.log(`API on http://localhost:${i.port}`))

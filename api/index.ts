import { handle } from 'hono/vercel'
import { app } from '../server/app'

const honoHandler = handle(app)

// vercel.json rewrites every /api/... request to this single function and passes the
// original path as ?__path=..., so routing does not depend on how the URL is rewritten.
function handler(req: Request) {
  const url = new URL(req.url)
  const original = url.searchParams.get('__path')
  if (original !== null) {
    url.searchParams.delete('__path')
    url.pathname = `/api/${original}`
    return honoHandler(new Request(url, req))
  }
  return honoHandler(req)
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler

import { readFileSync } from 'fs'

const API_PORT = 4000
const ANTHROPIC_BASE = 'https://api.anthropic.com'

// Load the captured API template
const template = JSON.parse(readFileSync('/api-debug/api.json', 'utf-8'))

// Get real auth token from credentials
function getAuthToken(): string {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    const creds = JSON.parse(readFileSync('/credentials/.credentials.json', 'utf-8'))
    return creds?.claudeAiOauth?.accessToken ?? ''
  } catch {
    return ''
  }
}

const authToken = getAuthToken()
const serverKey = process.env.API_SERVER_KEY || ''

// Determine which auth header the SDK uses (authorization vs x-api-key)
const authHeaderName = template.headers['authorization'] ? 'authorization' : 'x-api-key'
const authHeaderValue = authHeaderName === 'authorization' ? `Bearer ${authToken}` : authToken

// Headers to skip when building forwarding headers (connection-level or per-request)
const skipHeaders = new Set(['host', 'connection', 'content-length', 'transfer-encoding'])

function buildForwardingHeaders(bodyLength: number): Record<string, string> {
  const h: Record<string, string> = {}
  for (const [key, value] of Object.entries(template.headers)) {
    if (skipHeaders.has(key)) continue
    // Replace redacted auth with real token
    if (key === 'authorization' || key === 'x-api-key') {
      h[authHeaderName] = authHeaderValue
    } else {
      h[key] = value as string
    }
  }
  h['host'] = 'api.anthropic.com'
  h['content-length'] = String(bodyLength)
  return h
}

function buildSimpleHeaders(): Record<string, string> {
  return {
    [authHeaderName]: authHeaderValue,
    'anthropic-version': (template.headers['anthropic-version'] as string) || '2023-06-01',
    'content-type': 'application/json',
    'accept': 'application/json',
    ...(template.headers['anthropic-beta'] ? { 'anthropic-beta': template.headers['anthropic-beta'] as string } : {}),
    ...(template.headers['user-agent'] ? { 'user-agent': template.headers['user-agent'] as string } : {}),
  }
}

function validateApiKey(req: Request): Response | null {
  if (!serverKey) return null // no validation if no key configured
  const callerKey = req.headers.get('x-api-key') || ''
  if (callerKey !== serverKey) {
    return new Response(JSON.stringify({
      type: 'error',
      error: { type: 'authentication_error', message: 'Invalid API key' },
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return null
}

function mergeMessagesBody(callerBody: Record<string, unknown>): string {
  // Start with the caller's body as the base
  const merged: Record<string, unknown> = { ...callerBody }

  // System: always prepend template's system messages, then caller's
  const templateSystem = template.body.system || []
  if (callerBody.system) {
    const callerSystem = Array.isArray(callerBody.system)
      ? callerBody.system
      : [{ type: 'text', text: callerBody.system }]
    merged.system = [...templateSystem, ...callerSystem]
  } else {
    merged.system = templateSystem
  }

  // Metadata: always preserve template's
  merged.metadata = template.body.metadata

  return JSON.stringify(merged)
}

const server = Bun.serve({
  port: API_PORT,
  async fetch(req) {
    const url = new URL(req.url)
    console.log(`[api] ${req.method} ${url.pathname}`)

    // Validate caller's API key
    const authErr = validateApiKey(req)
    if (authErr) return authErr

    // POST /v1/messages — merge with template and forward
    if (url.pathname === '/v1/messages' && req.method === 'POST') {
      const callerBody = await req.json() as Record<string, unknown>
      const bodyStr = mergeMessagesBody(callerBody)
      const headers = buildForwardingHeaders(Buffer.byteLength(bodyStr))

      const resp = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
        method: 'POST',
        headers,
        body: bodyStr,
      })

      // Build response headers — pass through content-type and anthropic headers
      const respHeaders: Record<string, string> = {
        'Content-Type': resp.headers.get('Content-Type') || 'application/json',
      }
      resp.headers.forEach((value, key) => {
        if (key.startsWith('anthropic-') || key === 'request-id') {
          respHeaders[key] = value
        }
      })

      return new Response(resp.body, {
        status: resp.status,
        headers: respHeaders,
      })
    }

    // All other /v1/* endpoints — simple proxy
    if (url.pathname.startsWith('/v1/')) {
      const headers = buildSimpleHeaders()
      const fetchOpts: RequestInit = {
        method: req.method,
        headers,
      }

      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        const body = await req.text()
        fetchOpts.body = body
        ;(headers as Record<string, string>)['content-length'] = String(Buffer.byteLength(body))
      }

      const resp = await fetch(`${ANTHROPIC_BASE}${url.pathname}${url.search}`, fetchOpts)

      return new Response(resp.body, {
        status: resp.status,
        headers: { 'Content-Type': resp.headers.get('Content-Type') || 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  },
})

console.log(`[api-server] Listening on http://localhost:${API_PORT}`)
console.log(`[api-server] Auth validation: ${serverKey ? 'enabled' : 'disabled (no API_SERVER_KEY)'}`)
console.log(`[api-server] Forwarding to: ${ANTHROPIC_BASE}`)
console.log(`[api-server] Template auth header: ${authHeaderName}`)

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const DISTRIBUTION_DIRECTORY = new URL('./dist/', import.meta.url)
const INDEX_PATH = 'index.html'
const HEALTH_PATH = '/health/live'
const DEFAULT_PORT = 8080
const IMMUTABLE_ASSET_PREFIX = '/assets/'
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const REVALIDATE_CACHE_CONTROL = 'no-cache'

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
}

const port = Number(Bun.env.PORT ?? DEFAULT_PORT)

Bun.serve({
  port,
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === HEALTH_PATH) {
      return respond(new Response('ok'), REVALIDATE_CACHE_CONTROL)
    }

    const asset = resolveAsset(url.pathname)
    if (await asset.exists()) {
      return respond(new Response(asset), cacheControlFor(url.pathname))
    }

    // Navegação de rota do SPA não tem arquivo correspondente: cai no index sem cache.
    return respond(new Response(resolveAsset(`/${INDEX_PATH}`)), REVALIDATE_CACHE_CONTROL)
  },
})

function resolveAsset(pathname: string): Bun.BunFile {
  const relativePath = pathname === '/' ? INDEX_PATH : pathname.replace(/^\/+/, '')
  const resolved = new URL(relativePath, DISTRIBUTION_DIRECTORY)
  // Barra o path traversal: qualquer caminho que escape do diretório do build vira o index.
  if (!resolved.pathname.startsWith(DISTRIBUTION_DIRECTORY.pathname)) {
    return Bun.file(new URL(INDEX_PATH, DISTRIBUTION_DIRECTORY))
  }
  return Bun.file(resolved)
}

function cacheControlFor(pathname: string): string {
  return pathname.startsWith(IMMUTABLE_ASSET_PREFIX)
    ? IMMUTABLE_CACHE_CONTROL
    : REVALIDATE_CACHE_CONTROL
}

function respond(response: Response, cacheControl: string): Response {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value)
  }
  response.headers.set('Cache-Control', cacheControl)
  return response
}

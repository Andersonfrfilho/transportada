/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const DISTRIBUTION_DIRECTORY = new URL('./dist/', import.meta.url)
const INDEX_PATH = 'index.html'
const HEALTH_PATH = '/health/live'
const DEFAULT_PORT = 8080
const IMMUTABLE_ASSET_PREFIX = '/assets/'
/**
 * Modelo e runtime do recorte de fundo: 16 MB de artefato de terceiro com nome fixo. `no-cache`
 * faria o navegador revalidar 16 MB a cada uso; `immutable` prenderia uma versão para sempre, já
 * que o nome não muda quando a gente atualiza o arquivo. Trinta dias fica no meio: baixa uma vez e
 * uma troca chega sozinha dentro de um mês.
 */
const BACKGROUND_REMOVAL_PREFIX = '/background-removal/'
const BACKGROUND_REMOVAL_CACHE_CONTROL = 'public, max-age=2592000'
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'
const REVALIDATE_CACHE_CONTROL = 'no-cache'
const CONTENT_SECURITY_POLICY_PATH = 'content-security-policy.txt'
/**
 * O mapa de rua (ADR-0044 §6). Ele é **um arquivo**, lido por faixa de bytes: o MapLibre pede o
 * cabeçalho, depois o diretório, depois só as telhas da tela — nunca o arquivo inteiro. Por isso
 * este caminho tem tratamento próprio de `Range`, que `new Response(BunFile)` não faz sozinho.
 */
const MAP_TILES_PREFIX = '/map-tiles/'
/** Mapa envelhece por lei e por obra, não por semana; e o nome muda quando ele é refeito. */
const MAP_TILES_CACHE_CONTROL = 'public, max-age=2592000'

// A diretiva é composta no build, onde as origens da API e do Keycloak existem — aqui elas não
// chegam, porque `VITE_*` é inlinado no bundle. Sem o arquivo o servidor não sobe: publicar sem CSP
// seria a falha silenciosa que este arquivo existe para impedir.
const contentSecurityPolicyFile = Bun.file(
  new URL(CONTENT_SECURITY_POLICY_PATH, DISTRIBUTION_DIRECTORY),
)
if (!(await contentSecurityPolicyFile.exists())) {
  throw new Error('FRONTEND_MISSING_CONTENT_SECURITY_POLICY')
}
const contentSecurityPolicy = (await contentSecurityPolicyFile.text()).trim()
if (contentSecurityPolicy === '') {
  throw new Error('FRONTEND_EMPTY_CONTENT_SECURITY_POLICY')
}

const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': contentSecurityPolicy,
  // `camera=(self)` porque o separador bipa a nota pela câmera do celular, e `geolocation=(self)`
  // porque a entrega do motorista carimba onde ela aconteceu (ADR-0045 §3) — `()` nega a **própria**
  // origem, e a API falha antes de qualquer diálogo. O microfone segue fechado para todo mundo.
  'Permissions-Policy': 'camera=(self), geolocation=(self), microphone=()',
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
      if (url.pathname.startsWith(MAP_TILES_PREFIX)) {
        return respond(rangeResponse(asset, request), MAP_TILES_CACHE_CONTROL)
      }
      return respond(new Response(asset), cacheControlFor(url.pathname))
    }

    // Navegação de rota do SPA não tem arquivo correspondente: cai no index sem cache.
    return respond(new Response(resolveAsset(`/${INDEX_PATH}`)), REVALIDATE_CACHE_CONTROL)
  },
})

/**
 * ⚠️ Sem isto o MapLibre baixa o arquivo **inteiro** a cada telha pedida — centenas de MB por
 * movimento de mapa. O `206` com `Content-Range` é o que transforma um arquivo único em servidor de
 * telhas, e é a razão de o formato existir.
 *
 * Faixa ausente ou ilegível devolve o arquivo inteiro com `200`, como manda o RFC: pedido que o
 * servidor não entende não pode virar erro para um cliente que sabe ler o corpo completo.
 */
function rangeResponse(file: Bun.BunFile, request: Request): Response {
  const size = file.size
  const header = request.headers.get('range') ?? ''
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim())
  if (match === null) {
    return new Response(file, { headers: { 'Accept-Ranges': 'bytes' } })
  }

  const [, rawStart = '', rawEnd = ''] = match
  const start = rawStart === '' ? Math.max(size - Number(rawEnd), 0) : Number(rawStart)
  const end = rawStart === '' || rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (!Number.isFinite(start) || start > end || start >= size) {
    return new Response(null, {
      headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${size}` },
      status: 416,
    })
  }

  return new Response(file.slice(start, end + 1), {
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
    status: 206,
  })
}

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
  if (pathname.startsWith(IMMUTABLE_ASSET_PREFIX)) return IMMUTABLE_CACHE_CONTROL
  if (pathname.startsWith(BACKGROUND_REMOVAL_PREFIX)) return BACKGROUND_REMOVAL_CACHE_CONTROL
  return REVALIDATE_CACHE_CONTROL
}

function respond(response: Response, cacheControl: string): Response {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value)
  }
  response.headers.set('Cache-Control', cacheControl)
  return response
}

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
/**
 * O chunk do OpenCV (spec 152 T8, ADR-0065 §4): 3,05 MB brutos, ~0,89 MB comprimido. O Vite não
 * comprime nada — `openCvCompressionPlugin` do `vite.config.ts` grava `.gz`/`.br` ao lado do chunk
 * no build, e aqui a gente escolhe pelo `Accept-Encoding` do pedido, igual a um proxy faria.
 */
const OPENCV_CHUNK_PATTERN = /^\/assets\/opencv-[^/]+\.js$/u
/**
 * Spec 156 T14, ADR-0069 §2 (R1/R3): o motor de OCR do canhoto — worker, core WASM e modelo —
 * mora sob um caminho **versionado** (`/canhoto-ocr/<versão>/`). O nome que muda a cada troca de
 * pacote é o que torna `immutable` seguro aqui (diferente do recorte de fundo, que tem nome fixo).
 * `scripts/fetch-canhoto-ocr.ts` gera os `.br`/`.gz` ao lado de cada `.wasm.js`/`worker.min.js`.
 */
const CANHOTO_OCR_PREFIX = '/canhoto-ocr/'
/**
 * ADR-0075 §6: a medida que autoriza remover o módulo antigo do motorista — zero destes em 14 dias
 * de log de produção. A rota é **pública** (ninguém autentica um `sendBeacon`), então ela aceita só
 * o valor enumerado, lê no máximo ~32 bytes e responde `204` sempre: quem pergunta não distingue
 * válido de inválido, e valor arbitrário não vira linha de log.
 */
const DRIVER_LEGACY_BEACON_PATH = '/_driver-legacy-served'
const DRIVER_LEGACY_BEACON_MODE = 'pending-screen'
const DRIVER_LEGACY_BEACON_MAX_BYTES = 32

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
    if (url.pathname === DRIVER_LEGACY_BEACON_PATH) {
      if (
        request.method === 'POST' &&
        (await readSmallBody(request)) === DRIVER_LEGACY_BEACON_MODE
      ) {
        console.log(
          JSON.stringify({
            at: new Date().toISOString(),
            event: 'driver_legacy_served',
            mode: DRIVER_LEGACY_BEACON_MODE,
          }),
        )
      }
      return respond(new Response(null, { status: 204 }), REVALIDATE_CACHE_CONTROL)
    }

    const asset = resolveAsset(url.pathname)
    if (await asset.exists()) {
      if (url.pathname.startsWith(MAP_TILES_PREFIX)) {
        return respond(rangeResponse(asset, request), MAP_TILES_CACHE_CONTROL)
      }
      if (OPENCV_CHUNK_PATTERN.test(url.pathname) || url.pathname.startsWith(CANHOTO_OCR_PREFIX)) {
        return respond(
          await precompressedResponse(asset, url.pathname, request),
          cacheControlFor(url.pathname),
        )
      }
      return respond(new Response(asset), cacheControlFor(url.pathname))
    }

    // Arquivo de build que não existe é 404, nunca a página do app: o HTML com 200 trocava o erro
    // por "MIME text/html" e escondia o asset que faltou — foi assim com o shared do MapLibre.
    if (url.pathname.startsWith(IMMUTABLE_ASSET_PREFIX)) {
      return respond(new Response('Not Found', { status: 404 }), REVALIDATE_CACHE_CONTROL)
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

/**
 * `Accept-Encoding` é lista separada por vírgula, cada token com `;q=` opcional (RFC 9110 §12.5.3).
 * `.includes('br')` cru casava `br;q=0` — que É o cliente dizendo que **não** aceita — e `gzip`
 * como substring de `x-gzip`, um token diferente. T14 item 5: parseia de verdade, ignora `q=0`, e
 * devolve só o que o cliente realmente aceita, na ordem em que apareceu.
 */
function acceptedEncodings(acceptEncodingHeader: string): readonly string[] {
  return acceptEncodingHeader
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .flatMap((token) => {
      const [rawEncoding = '', ...parameters] = token.split(';').map((part) => part.trim())
      const qualityParameter = parameters.find((parameter) => parameter.startsWith('q='))
      const quality = qualityParameter === undefined ? 1 : Number(qualityParameter.slice(2))
      const encoding = rawEncoding.toLowerCase()
      return encoding === '' || quality === 0 ? [] : [encoding]
    })
}

/**
 * Prefere Brotli, cai para gzip, e serve o arquivo original se nenhum dos dois existir ou se o
 * cliente não anunciar a codificação — nunca lança e nunca falha 404 por falta de compressão.
 * `Vary: Accept-Encoding` vai em TODO ramo, inclusive o não comprimido: sem ele um cache
 * intermediário pode devolver a resposta sem compressão para um cliente que aceitava Brotli.
 */
async function precompressedResponse(
  original: Bun.BunFile,
  pathname: string,
  request: Request,
): Promise<Response> {
  const accepted = acceptedEncodings(request.headers.get('accept-encoding') ?? '')
  const candidates: readonly [string, string][] = [
    ['br', `${pathname}.br`],
    ['gzip', `${pathname}.gz`],
  ]
  for (const [encoding, encodedPathname] of candidates) {
    if (!accepted.includes(encoding)) continue
    const encodedAsset = resolveAsset(encodedPathname)
    if (!(await encodedAsset.exists())) continue
    // O `.br`/`.gz` no nome faz o Bun adivinhar `application/octet-stream` pela extensão errada —
    // com `X-Content-Type-Options: nosniff` isso quebra o `import()` do módulo no navegador
    // (sonda T9, `specs/152-medir-caixa-pela-camera/evidence.md` § T9). O tipo certo é o do
    // arquivo original, não o do arquivo comprimido.
    const response = new Response(encodedAsset, { headers: { 'Content-Type': original.type } })
    response.headers.set('Content-Encoding', encoding)
    response.headers.set('Vary', 'Accept-Encoding')
    return response
  }
  const fallback = new Response(original)
  fallback.headers.set('Vary', 'Accept-Encoding')
  return fallback
}

/**
 * O corpo do beacon, ou `undefined` se passar de `DRIVER_LEGACY_BEACON_MAX_BYTES`. O
 * `Content-Length` declarado grande nem é lido; sem ele (corpo em partes), a leitura para no
 * primeiro byte além do teto e cancela o resto — nunca se acumula o que o cliente quiser mandar.
 */
async function readSmallBody(request: Request): Promise<string | undefined> {
  const declaredLength = Number(request.headers.get('content-length') ?? '0')
  if (declaredLength > DRIVER_LEGACY_BEACON_MAX_BYTES) return undefined
  if (request.body === null) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > DRIVER_LEGACY_BEACON_MAX_BYTES) {
      await reader.cancel()
      return undefined
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
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
  if (pathname.startsWith(CANHOTO_OCR_PREFIX)) return IMMUTABLE_CACHE_CONTROL
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

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Serve **um arquivo** — o mapa de rua em PMTiles — por faixa de bytes.
 *
 * ⚠️ O `Range` é a razão de o formato existir: o MapLibre pede o cabeçalho, depois o diretório, e
 * daí só as telhas da tela. Sem `206` o cliente baixaria centenas de MB a cada movimento de mapa, e
 * o serviço pareceria "lento" quando na verdade estaria mandando o arquivo inteiro toda vez.
 */
const TILES_PATH = '/map-tiles/area.pmtiles'
/** Os glifos do rótulo, servidos como arquivo comum — o MapLibre os pede por faixa de código. */
const FONTS_PREFIX = '/map-tiles/fonts/'
const FONTS_DIRECTORY = new URL('./map-tiles/fonts/', import.meta.url)
const HEALTH_PATH = '/health/live'
const FILE = Bun.file(new URL('./map-tiles/area.pmtiles', import.meta.url))

if (!(await FILE.exists())) {
  // Falha no boot: um serviço de mapa sem mapa responde 404 em silêncio e parece rede ruim.
  throw new Error('MAP_TILES_MISSING_DATASET')
}

/** Mapa envelhece por obra, não por semana — e o arquivo é trocado por deploy, não no lugar. */
const CACHE_CONTROL = 'public, max-age=2592000'

Bun.serve({
  port: Number(Bun.env.PORT ?? 8080),
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === HEALTH_PATH) return new Response('ok')
    if (url.pathname.startsWith(FONTS_PREFIX)) {
      if (request.method === 'OPTIONS') return withHeaders(new Response(null, { status: 204 }))
      return withHeaders(await glyphResponse(url.pathname))
    }
    if (url.pathname !== TILES_PATH) return new Response(null, { status: 404 })

    /** O `Range` é pedido não-simples: sem a pré-vistoria o navegador nem chega a fazer o GET. */
    if (request.method === 'OPTIONS') return withHeaders(new Response(null, { status: 204 }))

    return withHeaders(rangeResponse(request))
  },
})

/**
 * ⚠️ O caminho é decodificado **e** barrado contra travessia: o nome da pilha de fontes vem da URL
 * ("Noto Sans Regular" chega percent-encoded), e aceitar `..` ali serviria qualquer arquivo da
 * imagem.
 */
async function glyphResponse(pathname: string): Promise<Response> {
  const relative = decodeURIComponent(pathname.slice(FONTS_PREFIX.length))
  const resolved = new URL(relative, FONTS_DIRECTORY)
  if (!resolved.pathname.startsWith(FONTS_DIRECTORY.pathname)) {
    return new Response(null, { status: 404 })
  }

  const file = Bun.file(resolved)
  if (!(await file.exists())) return new Response(null, { status: 404 })
  return new Response(file, { headers: { 'Content-Type': 'application/x-protobuf' } })
}

function rangeResponse(request: Request): Response {
  const size = FILE.size
  const match = /^bytes=(\d*)-(\d*)$/u.exec((request.headers.get('range') ?? '').trim())
  /** Pedido sem faixa devolve o corpo inteiro, como manda o RFC — não é erro. */
  if (match === null) return new Response(FILE)

  const [, rawStart = '', rawEnd = ''] = match
  const start = rawStart === '' ? Math.max(size - Number(rawEnd), 0) : Number(rawStart)
  const end = rawStart === '' || rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  if (!Number.isFinite(start) || start > end || start >= size) {
    return new Response(null, { headers: { 'Content-Range': `bytes */${size}` }, status: 416 })
  }

  return new Response(FILE.slice(start, end + 1), {
    headers: {
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
    },
    status: 206,
  })
}

function withHeaders(response: Response): Response {
  /**
   * ⚠️ O mapa é lido por um domínio diferente do que o serve — em desenvolvimento, `localhost`; em
   * produção, o domínio do painel. Sem CORS o navegador recusa **antes** de qualquer byte, e a tela
   * cai na reserva sem que o arquivo tenha nada de errado.
   *
   * `*` é deliberado e seguro **aqui**: o conteúdo é mapa público do OpenStreetMap, sem nada de
   * cliente e sem credencial — o serviço não tem sessão para uma origem hostil roubar. O que ele
   * **não** pode é aceitar credencial junto, e por isso `Allow-Credentials` fica de fora.
   */
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Headers', 'range')
  response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  /**
   * ⚠️ **Sem isto o navegador repete a pré-vistoria**, e o padrão dele é guardar por 5 segundos.
   * Uma panorâmica de mapa dispara dezenas de pedidos de faixa: cada um pagaria um `OPTIONS` de ida
   * e volta antes do byte. É o custo de latência real deste serviço — bem maior que a região em que
   * ele roda. O navegador limita o valor por conta própria (Chrome a 2 h, Firefox a 24 h); pedir um
   * dia é pedir o teto de cada um.
   */
  response.headers.set('Access-Control-Max-Age', '86400')
  /** Sem isto o cliente não enxerga o `Content-Range`, e o PMTiles não sabe onde caiu a faixa. */
  response.headers.set(
    'Access-Control-Expose-Headers',
    'accept-ranges, content-range, content-length',
  )
  response.headers.set('Accept-Ranges', 'bytes')
  response.headers.set('Cache-Control', CACHE_CONTROL)
  response.headers.set('X-Content-Type-Options', 'nosniff')
  return response
}

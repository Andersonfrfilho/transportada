/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ADR-0044 §6: o mapa de rua vem de um **PMTiles do nosso bucket**, lido por HTTP Range através do
 * nosso domínio. Nenhuma requisição a host de tile de terceiro: a coordenada da parada é dado
 * pessoal (`security.md` §1), e uma URL de tile é um log de servidor alheio.
 *
 * O caminho é relativo de propósito. Ele resolve contra a origem da API, que o `connect-src` já
 * declara — e é o que faz o CSP continuar sem nenhum host externo. Uma URL absoluta aqui seria
 * apanhada pelo contrato de CSP, que varre o `src/` procurando exatamente isso.
 */
export const ROUTE_MAP_TILES_PATH = '/route-map/area.pmtiles'

export type RouteMapTilesAvailability =
  | Readonly<{ available: false; reason: RouteMapUnavailableReason }>
  | Readonly<{ available: true; url: string }>

/**
 * Por que o mapa não está disponível. A tela **diz qual** — "não foi possível carregar o mapa" sem
 * motivo transforma uma degradação prevista em defeito aparente, e manda o operador abrir chamado
 * para o que é comportamento declarado.
 */
export type RouteMapUnavailableReason = 'missing' | 'unsupported'

/**
 * O arquivo pode não existir: ele é gerado offline do mesmo extract OSM que alimenta o OSRM
 * (`docs/runbooks/osrm-extract.md`), e num ambiente novo ainda não foi. **Isso não é erro** — o
 * painel cai para a lista ordenada e diz isso. O mapa confere a sugestão; ele não é a sugestão.
 */
export async function resolveRouteMapTiles(input: {
  readonly apiBaseUrl: string
  readonly fetchImplementation?: typeof fetch
  readonly supportsWebGl?: boolean
}): Promise<RouteMapTilesAvailability> {
  // WebGL ausente é máquina que não desenha mapa vetorial: a lista é a resposta certa, não um erro
  if (input.supportsWebGl === false) return { available: false, reason: 'unsupported' }

  const url = `${input.apiBaseUrl.replace(/\/$/u, '')}${ROUTE_MAP_TILES_PATH}`
  const fetchImplementation = input.fetchImplementation ?? fetch

  try {
    /**
     * `Range` de um byte: o PMTiles é lido assim de qualquer forma, e pedir o primeiro byte responde
     * "existe?" sem baixar centenas de MB só para descobrir que sim.
     */
    const response = await fetchImplementation(url, {
      headers: { range: 'bytes=0-0' },
      method: 'GET',
    })
    if (!response.ok) return { available: false, reason: 'missing' }
  } catch {
    return { available: false, reason: 'missing' }
  }

  return { available: true, url }
}

/** Mapa vetorial precisa de WebGL; sem contexto, não há o que desenhar. */
export function detectWebGlSupport(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null
  } catch {
    return false
  }
}

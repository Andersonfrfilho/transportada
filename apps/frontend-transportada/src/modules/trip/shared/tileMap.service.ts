/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O mapa de telha (*slippy map*) em Web Mercator, sem biblioteca.
 *
 * ⚠️ Isto reverte em parte a ADR-0037: a telha é imagem servida por terceiro e renderizada dentro
 * da nossa tela. O que **não** volta é `iframe` e script de terceiro — a telha é `<img>`, o
 * navegador não executa nada dela, e `frame-src 'none'` e `script-src 'self'` continuam de pé. O
 * que se paga é o CEP aproximado da carga chegando ao servidor de telhas pelo padrão de quadrados
 * pedidos; o termo digitado nunca sai por aqui.
 */
export const TILE_SIZE = 256
/**
 * ⚠️ A origem da telha é **nossa**, e isto não é preferência: a ADR-0044 §6 decidiu PMTiles servido
 * do nosso domínio, mantendo de pé a razão da ADR-0047 — endereço de cliente é dado pessoal, e a
 * coordenada da parada viajaria dentro da URL pedida a um servidor alheio.
 *
 * Enquanto o arquivo não existir, a tela cai na lista ordenada **e diz isso** (ADR-0044 §6): o mapa
 * confere a sugestão, ele não é a sugestão.
 */
export const TILE_ORIGIN = '/map-tiles'
/** Exigência da licença do OpenStreetMap: a atribuição é obrigatória e fica visível na tela. */
/** A atribuição continua devida: o dado é do OpenStreetMap, mesmo servido por nós. */
export const TILE_ATTRIBUTION = '© OpenStreetMap'
const MIN_ZOOM = 4
const MAX_ZOOM = 16
/** Respiro entre o pino mais externo e a borda, para o pino não nascer colado no corte. */
const EDGE_PADDING = 28

export type GeoPoint = Readonly<{ latitude: number; longitude: number }>

export type TileRef = Readonly<{ key: string; left: number; top: number; url: string }>

export type TileMap = Readonly<{
  height: number
  /** Onde o ponto cai **em pixel da caixa**, já descontada a origem da janela. */
  place: (point: GeoPoint) => Readonly<{ x: number; y: number }>
  tiles: readonly TileRef[]
  width: number
  zoom: number
}>

/** Longitude → pixel do mundo, na escala do zoom. Web Mercator, a mesma projeção das telhas. */
function worldX(longitude: number, zoom: number): number {
  return ((longitude + 180) / 360) * TILE_SIZE * 2 ** zoom
}

/**
 * Latitude → pixel do mundo. A conta cresce sem limite nos polos, e por isso a latitude é presa em
 * ±85,05°: fora disso o Mercator não tem telha, e o pino sairia para o infinito.
 */
function worldY(latitude: number, zoom: number): number {
  const clamped = Math.max(Math.min(latitude, 85.05112878), -85.05112878)
  const radians = (clamped * Math.PI) / 180
  const merc = Math.log(Math.tan(radians) + 1 / Math.cos(radians))
  return ((1 - merc / Math.PI) / 2) * TILE_SIZE * 2 ** zoom
}

/**
 * O zoom é o **maior** que ainda cabe a carga inteira na caixa: aproximar mais cortaria parada, e
 * afastar mais entregaria um mapa do estado onde as cidades viram um borrão só.
 *
 * ⚠️ Ponto único não tem extensão, e a conta daria zoom infinito — daí o piso e o teto.
 */
function resolveZoom(input: {
  readonly height: number
  readonly points: readonly GeoPoint[]
  readonly width: number
}): number {
  for (let zoom = MAX_ZOOM; zoom > MIN_ZOOM; zoom -= 1) {
    const xs = input.points.map((point) => worldX(point.longitude, zoom))
    const ys = input.points.map((point) => worldY(point.latitude, zoom))
    const spanX = Math.max(...xs) - Math.min(...xs)
    const spanY = Math.max(...ys) - Math.min(...ys)
    if (spanX <= input.width && spanY <= input.height) return zoom
  }
  return MIN_ZOOM
}

/**
 * A telha que responde "o servidor de telhas existe?". É a telha que cobre o ponto no zoom mínimo —
 * um extract regional serve a própria área e nada além dela, então sondar uma coordenada fixa (0/0)
 * diria "indisponível" com o servidor de pé.
 */
export function probeTileUrl(point: GeoPoint): string {
  const column = Math.floor(worldX(point.longitude, MIN_ZOOM) / TILE_SIZE)
  const row = Math.floor(worldY(point.latitude, MIN_ZOOM) / TILE_SIZE)
  return `${TILE_ORIGIN}/${MIN_ZOOM}/${column}/${row}.png`
}

/**
 * O endpoint pode não existir ainda (ADR-0044 §6: PMTiles servido do nosso domínio, gerado pelo
 * runbook do OSRM). **Isso não é erro** — quem chama cai no desenho vetorial e diz isso, em vez de
 * deixar o quadro vazio com as `<img>` falhando em silêncio.
 */
export async function resolveTileAvailability(input: {
  readonly fetchImplementation?: typeof fetch
  readonly point: GeoPoint
  readonly signal?: AbortSignal
}): Promise<boolean> {
  const fetchImplementation = input.fetchImplementation ?? fetch
  try {
    const response = await fetchImplementation(probeTileUrl(input.point), {
      method: 'GET',
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * A janela é centrada na carga e as telhas cobrem só o que ela mostra: pedir a moldura inteira do
 * estado seriam centenas de quadrados para desenhar quatro cidades.
 */
export function resolveTileMap(input: {
  readonly height: number
  /** Deslocamento em pixel acumulado pelo arraste do operador. */
  readonly pan?: Readonly<{ x: number; y: number }>
  readonly points: readonly GeoPoint[]
  /** Degraus de aproximação que o operador pediu, somados ao que coube sozinho. */
  readonly zoomOffset?: number
  readonly width: number
}): TileMap | null {
  if (input.points.length === 0) return null

  /**
   * ⚠️ A folga é margem de respiro, não meia telha. Descontar 128px de uma caixa de 260 deixava 132
   * para caber a carga, e o zoom caía dois degraus — quatro cidades vizinhas apareciam como um
   * borrão no meio do estado. Medido: zoom 7 onde o certo é 9.
   */
  const padded = {
    height: Math.max(input.height - EDGE_PADDING * 2, 1),
    width: Math.max(input.width - EDGE_PADDING * 2, 1),
  }
  /**
   * O zoom que cabe é o **ponto de partida**, não a última palavra: o operador aproxima para ver a
   * rua e afasta para achar a cidade vizinha. O limite continua sendo o do mundo de telhas.
   */
  const fitted = resolveZoom({ ...padded, points: input.points })
  const zoom = Math.max(Math.min(fitted + (input.zoomOffset ?? 0), MAX_ZOOM), MIN_ZOOM)
  const xs = input.points.map((point) => worldX(point.longitude, zoom))
  const ys = input.points.map((point) => worldY(point.latitude, zoom))
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2
  const pan = input.pan ?? { x: 0, y: 0 }
  const originX = centerX - input.width / 2 - pan.x
  const originY = centerY - input.height / 2 - pan.y

  const span = 2 ** zoom
  const tiles: TileRef[] = []
  const firstColumn = Math.floor(originX / TILE_SIZE)
  const firstRow = Math.floor(originY / TILE_SIZE)
  const lastColumn = Math.floor((originX + input.width) / TILE_SIZE)
  const lastRow = Math.floor((originY + input.height) / TILE_SIZE)

  for (let row = firstRow; row <= lastRow; row += 1) {
    /** Linha fora do mundo não existe — ao contrário da coluna, que dá a volta. */
    if (row < 0 || row >= span) continue
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const wrapped = ((column % span) + span) % span
      tiles.push({
        key: `${zoom}/${wrapped}/${row}`,
        left: column * TILE_SIZE - originX,
        top: row * TILE_SIZE - originY,
        url: `${TILE_ORIGIN}/${zoom}/${wrapped}/${row}.png`,
      })
    }
  }

  return {
    height: input.height,
    place: (point) => ({
      x: worldX(point.longitude, zoom) - originX,
      y: worldY(point.latitude, zoom) - originY,
    }),
    tiles,
    width: input.width,
    zoom,
  }
}

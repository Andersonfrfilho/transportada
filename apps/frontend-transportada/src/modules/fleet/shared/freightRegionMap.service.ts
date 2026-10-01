/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightRegion, FreightRegionCity } from './freightRegion.types'
import type { MeshFeature } from '@/modules/shared/ibgeMesh.service'
import { RADAR_SOURCE } from '@/modules/shared/vectorBasemap.service'
import type { MunicipalityIdentity } from './municipality.service'
import { cityKeyOf, foldRegionCityName } from './regionCityName.service'

/**
 * Uma cor por zona, na ordem da zona. São **cinco**: a matriz é a zona 0 e a família publica quatro
 * (`00[0-3]` vira 1 a 4, `region-coverage.policy.ts`). Uma paleta de quatro pintaria a zona 4 como
 * município sem rota — o desenho diria que a transportadora não paga uma rota que ela paga.
 */
export const FREIGHT_REGION_ZONE_FILL = [
  'var(--color-zone-0)',
  'var(--color-zone-1)',
  'var(--color-zone-2)',
  'var(--color-zone-3)',
  'var(--color-zone-4)',
] as const

/** Município sem rota é o que o mapa existe para mostrar, e por isso é desenhado, não escondido. */
const UNASSIGNED_FILL = 'var(--color-asphalt)'

export type FreightRegionMapClaim = Readonly<{
  code: string
  id: string
  name: string
  zone: number
}>

/** Anel cru do IBGE — longitude/latitude, sem projeção: o MapLibre projeta na própria tela. */
export type FreightRegionMapRing = MeshFeature['rings'][number]

export type FreightRegionMapShape = Readonly<{
  city: string
  claims: readonly FreightRegionMapClaim[]
  code: string
  rings: readonly FreightRegionMapRing[]
  zone: null | number
}>

export type FreightRegionMapMissingCity = Readonly<{
  city: string
  regionName: string
  state: string
}>

export type FreightRegionMapModel = Readonly<{
  outside: readonly FreightRegionMapMissingCity[]
  shapes: readonly FreightRegionMapShape[]
}>

export type FreightRegionMapInput = Readonly<{
  features: readonly MeshFeature[]
  municipalities: readonly MunicipalityIdentity[]
  regions: readonly FreightRegion[]
  state: string
}>

/**
 * A zona vira propriedade **numérica** da feição GeoJSON — expressão de estilo do MapLibre não lê
 * `null`. `-1` é o mesmo sentinela de `resolveZoneFill`: fora da paleta de zonas de verdade (0..4).
 */
export const FREIGHT_REGION_UNASSIGNED_ZONE = -1

export type FreightRegionZoneFeature = Readonly<{
  type: 'Feature'
  geometry: Readonly<{
    type: 'MultiPolygon'
    coordinates: readonly (readonly (readonly (readonly [number, number])[])[])[]
  }>
  id: string
  properties: Readonly<{ code: string; zone: number }>
}>

export type FreightRegionFeatureCollection = Readonly<{
  type: 'FeatureCollection'
  features: readonly FreightRegionZoneFeature[]
}>

export function resolveZoneFill(zone: null | number): string {
  return FREIGHT_REGION_ZONE_FILL[zone ?? -1] ?? UNASSIGNED_FILL
}

/**
 * A UF de abertura sai da própria carga: a aba abria em branco e o operador escolhia o mesmo estado
 * toda vez. Só rota ativa conta, pelo mesmo recorte de `buildFreightRegionMap` — abrir numa UF onde
 * nada é pintado é o mapa vazio de antes com outro nome. Empate desempata pela sigla, senão a mesma
 * carga abriria em telas diferentes.
 */
export function resolveDefaultMapState(regions: readonly FreightRegion[]): string {
  const totalByState = new Map<string, number>()
  for (const region of regions) {
    if (region.status !== 'active') continue
    for (const city of region.cities) {
      const state = city.state.trim().toUpperCase()
      if (state === '') continue
      totalByState.set(state, (totalByState.get(state) ?? 0) + 1)
    }
  }

  const ranked = [...totalByState.entries()].sort(
    ([leftState, leftTotal], [rightState, rightTotal]) =>
      rightTotal - leftTotal || leftState.localeCompare(rightState),
  )

  return ranked[0]?.[0] ?? ''
}

function toCodeByFold(municipalities: readonly MunicipalityIdentity[]): Map<string, string> {
  const codes = new Map<string, string>()
  for (const municipality of municipalities) {
    const key = foldRegionCityName(municipality.name)
    if (key === '' || codes.has(key)) continue
    codes.set(key, municipality.code)
  }

  return codes
}

function toNameByCode(municipalities: readonly MunicipalityIdentity[]): Map<string, string> {
  return new Map(municipalities.map((municipality) => [municipality.code, municipality.name]))
}

function toClaim(region: FreightRegion): FreightRegionMapClaim {
  return { code: region.code, id: region.id, name: region.name, zone: region.zone }
}

/**
 * A cidade em duas rotas não é defeito: `BARRINHA/SP` está em duas na planilha real do cliente, e a
 * unicidade do banco é `(empresa, rota, cidade, estado)` justamente por isso. O desenho pinta a
 * primeira por código e **nomeia todas** — mapa localiza, não decide qual rota vale.
 */
function sortClaims(claims: readonly FreightRegionMapClaim[]): readonly FreightRegionMapClaim[] {
  return [...claims].sort((left, right) => left.code.localeCompare(right.code))
}

/**
 * Cidade sem polígono volta **nomeada**: sumir do desenho em silêncio faz a pessoa procurar no mapa
 * uma cidade que a malha não tem, e é assim que erro de grafia na planilha passa em branco.
 */
export function buildFreightRegionMap(input: FreightRegionMapInput): FreightRegionMapModel {
  if (input.features.length === 0) {
    return { outside: [], shapes: [] }
  }

  const state = input.state.trim().toUpperCase()
  const codeByFold = toCodeByFold(input.municipalities)
  const drawnCodes = new Set(input.features.map((feature) => feature.code))
  const claimsByCode = new Map<string, FreightRegionMapClaim[]>()
  const outside: FreightRegionMapMissingCity[] = []

  for (const region of input.regions) {
    if (region.status !== 'active') continue
    for (const city of region.cities) {
      if (city.state.trim().toUpperCase() !== state) continue
      const code = codeByFold.get(foldRegionCityName(city.city))
      if (code === undefined || !drawnCodes.has(code)) {
        outside.push({ city: city.city, regionName: region.name, state })
        continue
      }

      claimsByCode.set(code, [...(claimsByCode.get(code) ?? []), toClaim(region)])
    }
  }

  const nameByCode = toNameByCode(input.municipalities)
  const shapes = input.features.map((feature) => {
    const claims = sortClaims(claimsByCode.get(feature.code) ?? [])
    return {
      city: nameByCode.get(feature.code) ?? '',
      claims,
      code: feature.code,
      rings: feature.rings,
      zone: claims[0]?.zone ?? null,
    }
  })

  return { outside, shapes }
}

/**
 * A malha vira fonte GeoJSON do MapLibre — pura, sem tocar o mapa. Todo anel de um município entra
 * no mesmo `MultiPolygon` (ilha e enclave são o mesmo município, igual ao `d` do SVG de antes), e a
 * zona vira propriedade numérica porque expressão de estilo do MapLibre não lê `null`.
 */
export function toFreightRegionFeatureCollection(
  shapes: readonly FreightRegionMapShape[],
): FreightRegionFeatureCollection {
  return {
    features: shapes
      .filter((shape) => shape.rings.length > 0)
      .map((shape) => ({
        geometry: {
          coordinates: shape.rings.map((ring) => [ring.map(([lng, lat]) => [lng, lat] as const)]),
          type: 'MultiPolygon' as const,
        },
        id: shape.code,
        properties: { code: shape.code, zone: shape.zone ?? FREIGHT_REGION_UNASSIGNED_ZONE },
        type: 'Feature' as const,
      })),
    type: 'FeatureCollection',
  }
}

/**
 * O quadro que enquadra o estado inteiro (`fitBounds`), pela extensão real das coordenadas — não há
 * `viewBox` pronto como no SVG: o MapLibre projeta, então quem enquadra é quem chama o mapa.
 */
export function resolveFreightRegionBounds(
  shapes: readonly FreightRegionMapShape[],
): readonly [number, number, number, number] | null {
  let minLng = Number.POSITIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY

  for (const shape of shapes) {
    for (const ring of shape.rings) {
      for (const [lng, lat] of ring) {
        if (lng < minLng) minLng = lng
        if (lng > maxLng) maxLng = lng
        if (lat < minLat) minLat = lat
        if (lat > maxLat) maxLat = lat
      }
    }
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null
  return [minLng, minLat, maxLng, maxLat]
}

/** O id da fonte GeoJSON de zonas no MapLibre — compartilhado entre o motor e a classificação de erro. */
export const FREIGHT_REGION_ZONE_SOURCE = 'zona-de-frete'

export type FreightRegionBasemapErrorContext = Readonly<{
  basemapLoaded: boolean
  sourceId?: string | undefined
  tile?: unknown
}>

/**
 * M5 (revisão final da T501) — nem todo `error` do MapLibre é "sem basemap". Confirmado contra o
 * código-fonte do `maplibre-gl` (`_loadTile`, em `dist/maplibre-gl-dev.mjs`): erro de **telha
 * isolada** (uma requisição que falhou, não um 404 esperado) chega com `tile` no próprio evento —
 * `this._source.fire(new ErrorEvent(err, { tile }))` — e não pode apagar o mapa inteiro por um
 * retângulo que falhou enquanto o resto carrega. Erro de **glifo** nem chega aqui: o
 * `GlyphManager._downloadAndCacheRangePromise` captura a falha, desenha local e só avisa no
 * console (`_warnOnMissingGlyphRange`), sem disparar `error` de mapa nenhum — o SVG antigo nunca
 * tinha esse risco porque não dependia de fonte nenhuma para desenhar polígono.
 *
 * O que sobra antes do `load` — sem `tile`, de uma fonte que não é a própria zona que este
 * componente desenha (`FREIGHT_REGION_ZONE_SOURCE`) nem o radar opcional (`RADAR_SOURCE`, ausente
 * por padrão em toda instalação sem o arquivo gerado) — é a ausência real do basemap, e só ela
 * conta como fatal.
 */
export function isFatalBasemapError(context: FreightRegionBasemapErrorContext): boolean {
  if (context.basemapLoaded) return false
  if (context.tile !== undefined) return false
  if (context.sourceId === FREIGHT_REGION_ZONE_SOURCE) return false
  if (context.sourceId === RADAR_SOURCE) return false
  return true
}

/** Clicar no mapa é a entrada de cidade pelo desenho: o mesmo clique acrescenta e devolve. */
export function toggleRegionMapCity(
  input: Readonly<{ cities: readonly FreightRegionCity[]; city: FreightRegionCity }>,
): readonly FreightRegionCity[] {
  const key = cityKeyOf(input.city)
  const kept = input.cities.filter((city) => cityKeyOf(city) !== key)
  if (kept.length !== input.cities.length) return kept

  return [...input.cities, { city: input.city.city, state: input.city.state.trim().toUpperCase() }]
}

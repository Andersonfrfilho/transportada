/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FreightRegion, FreightRegionCity } from './freightRegion.types'
import type { StateMesh } from './ibgeMesh.service'
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

export type FreightRegionMapShape = Readonly<{
  city: string
  claims: readonly FreightRegionMapClaim[]
  code: string
  path: string
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
  viewBox: string
}>

export type FreightRegionMapInput = Readonly<{
  mesh: StateMesh
  municipalities: readonly MunicipalityIdentity[]
  regions: readonly FreightRegion[]
  state: string
}>

export function resolveZoneFill(zone: null | number): string {
  return FREIGHT_REGION_ZONE_FILL[zone ?? -1] ?? UNASSIGNED_FILL
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
  if (input.mesh.shapes.length === 0) {
    return { outside: [], shapes: [], viewBox: input.mesh.viewBox }
  }

  const state = input.state.trim().toUpperCase()
  const codeByFold = toCodeByFold(input.municipalities)
  const drawnCodes = new Set(input.mesh.shapes.map((shape) => shape.code))
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
  const shapes = input.mesh.shapes.map((shape) => {
    const claims = sortClaims(claimsByCode.get(shape.code) ?? [])
    return {
      city: nameByCode.get(shape.code) ?? '',
      claims,
      code: shape.code,
      path: shape.path,
      zone: claims[0]?.zone ?? null,
    }
  })

  return { outside, shapes, viewBox: input.mesh.viewBox }
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

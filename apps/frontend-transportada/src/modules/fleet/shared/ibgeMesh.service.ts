/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BRAZIL_STATE } from './fleet.types'
import { isRecord } from './fleetGuards.validation'

/**
 * A malha vem do IBGE, e vem **por UF**: o desenho do país inteiro no recorte de município é
 * megabytes de coordenada para pintar a tabela de um estado. `qualidade=minima` é o suficiente —
 * quem olha o mapa quer reconhecer a região, não medir a divisa.
 */
const IBGE_MESH_URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados'

/** Divisa de município muda por lei, não por semana. */
export const IBGE_MESH_STALE_TIME_MS = 604_800_000

export const IBGE_MESH_QUERY_KEY = 'fleet-ibge-mesh'

export type MeshShape = Readonly<{ code: string; path: string }>

export type StateMesh = Readonly<{ shapes: readonly MeshShape[]; viewBox: string }>

export const EMPTY_STATE_MESH: StateMesh = { shapes: [], viewBox: '0 0 1 1' }

export type MeshLookupInput = Readonly<{
  fetch: typeof globalThis.fetch
  signal: AbortSignal
  state: string
}>

type Point = readonly [number, number]

type MeshFeature = Readonly<{ code: string; rings: readonly (readonly Point[])[] }>

const MINIMUM_RING_POINTS = 3

/** Quatro casas são ~11 m no equador, abaixo do que a qualidade mínima da malha já resolve. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function readCode(properties: unknown): string {
  if (!isRecord(properties)) return ''
  const code = properties['codarea']
  if (typeof code === 'number') return Number.isFinite(code) ? String(code) : ''
  return typeof code === 'string' ? code.trim() : ''
}

function readRing(value: unknown): null | readonly Point[] {
  if (!Array.isArray(value) || value.length < MINIMUM_RING_POINTS) return null
  const points: Point[] = []
  for (const entry of value) {
    if (!Array.isArray(entry)) return null
    const [longitude, latitude] = entry as readonly unknown[]
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null
    points.push([longitude, latitude])
  }

  return points
}

function toRingCandidates(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : []
}

/** MultiPolygon é o município com ilha ou enclave: cada anel entra no mesmo `d`, como subcaminho. */
function readRings(geometry: unknown): readonly (readonly Point[])[] {
  if (!isRecord(geometry)) return []
  const rings = toRingCandidates(geometry['coordinates'])
  const candidates = geometry['type'] === 'MultiPolygon' ? rings.flatMap(toRingCandidates) : rings

  return candidates.map(readRing).filter((ring): ring is readonly Point[] => ring !== null)
}

/** Município ilegível sai do desenho sozinho: o estado inteiro não cai por causa de uma feição. */
function readFeatures(payload: unknown): readonly MeshFeature[] {
  if (!isRecord(payload) || !Array.isArray(payload['features'])) {
    throw new Error('FLEET_IBGE_MESH_MALFORMED')
  }

  return payload['features']
    .filter(isRecord)
    .map((feature) => ({
      code: readCode(feature['properties']),
      rings: readRings(feature['geometry']),
    }))
    .filter((feature) => feature.code !== '' && feature.rings.length > 0)
}

/**
 * Equirretangular com a longitude encurtada pelo cosseno da latitude do estado: grau de longitude é
 * mais curto que grau de latitude fora do equador, e sem o fator o desenho sai esticado na
 * horizontal — mapa que o operador não reconhece não localiza nada. O `y` inverte porque o eixo do
 * SVG cresce para baixo.
 */
function toPath(rings: readonly (readonly Point[])[], scale: number): string {
  return rings
    .map((ring) =>
      ring
        .map(
          ([longitude, latitude], index) =>
            `${index === 0 ? 'M' : 'L'}${round(longitude * scale)} ${round(-latitude)}`,
        )
        .join(' ')
        .concat(' Z'),
    )
    .join(' ')
}

type Extent = Readonly<{
  highestLatitude: number
  highestLongitude: number
  lowestLatitude: number
  lowestLongitude: number
}>

function toExtent(features: readonly MeshFeature[]): Extent {
  const latitudes: number[] = []
  const longitudes: number[] = []
  for (const feature of features) {
    for (const ring of feature.rings) {
      for (const [longitude, latitude] of ring) {
        latitudes.push(latitude)
        longitudes.push(longitude)
      }
    }
  }

  return {
    highestLatitude: Math.max(...latitudes),
    highestLongitude: Math.max(...longitudes),
    lowestLatitude: Math.min(...latitudes),
    lowestLongitude: Math.min(...longitudes),
  }
}

function toViewBox(extent: Extent, scale: number): string {
  const left = extent.lowestLongitude * scale
  const top = -extent.highestLatitude

  return [left, top, extent.highestLongitude * scale - left, -extent.lowestLatitude - top]
    .map((value) => round(value))
    .join(' ')
}

export function projectStateMesh(payload: unknown): StateMesh {
  const features = readFeatures(payload)
  if (features.length === 0) return EMPTY_STATE_MESH

  const extent = toExtent(features)
  const scale = Math.cos((((extent.lowestLatitude + extent.highestLatitude) / 2) * Math.PI) / 180)
  const shapes = features.map((feature) => ({
    code: feature.code,
    path: toPath(feature.rings, scale),
  }))

  return { shapes, viewBox: toViewBox(extent, scale) }
}

export function buildStateMeshUrl(state: string): string {
  const parameters = new URLSearchParams({
    formato: 'application/vnd.geo+json',
    intrarregiao: 'municipio',
    qualidade: 'minima',
  })

  return `${IBGE_MESH_URL}/${state.trim().toUpperCase()}?${parameters.toString()}`
}

/** UF fora da lista não sai para a rede: o provedor responderia 404 e a tela ficaria carregando. */
export async function loadStateMesh(input: MeshLookupInput): Promise<StateMesh> {
  const state = input.state.trim().toUpperCase()
  if (!BRAZIL_STATE.some((candidate) => candidate === state)) return EMPTY_STATE_MESH

  const response = await input.fetch(buildStateMeshUrl(state), { signal: input.signal })
  if (!response.ok) throw new Error('FLEET_IBGE_MESH_REQUEST_FAILED')

  return projectStateMesh(await response.json())
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { BRAZIL_STATE } from '@/modules/fleet/shared/fleet.types'
import { isRecord } from '@/modules/fleet/shared/fleetGuards.validation'

/**
 * A malha vem do IBGE, e vem **por UF**: o desenho do país inteiro no recorte de município é
 * megabytes de coordenada para pintar a tabela de um estado. `qualidade=minima` é o suficiente —
 * quem olha o mapa quer reconhecer a região, não medir a divisa.
 */
const IBGE_MESH_URL = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados'

/** Divisa de município muda por lei, não por semana. */
export const IBGE_MESH_STALE_TIME_MS = 604_800_000

export const IBGE_MESH_QUERY_KEY = 'fleet-ibge-mesh'

export type MeshLookupInput = Readonly<{
  fetch: typeof globalThis.fetch
  signal: AbortSignal
  state: string
}>

type Point = readonly [number, number]

/**
 * O município como o IBGE o devolve: código e anéis em **longitude/latitude crus**. Quem desenha
 * projeta na própria escala — a aba Regiões enquadra o estado inteiro, o mapa da viagem enquadra as
 * paradas, e uma projeção só serviria mal aos dois.
 */
export type MeshFeature = Readonly<{ code: string; rings: readonly (readonly Point[])[] }>

const MINIMUM_RING_POINTS = 3

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
export function readStateMeshFeatures(payload: unknown): readonly MeshFeature[] {
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

export function buildStateMeshUrl(state: string): string {
  const parameters = new URLSearchParams({
    formato: 'application/vnd.geo+json',
    intrarregiao: 'municipio',
    qualidade: 'minima',
  })

  return `${IBGE_MESH_URL}/${state.trim().toUpperCase()}?${parameters.toString()}`
}

/**
 * A malha **sem projetar**, para quem enquadra noutra escala — o mapa da viagem enquadra as paradas,
 * a aba Regiões enquadra o estado inteiro, e uma projeção fixa serviria mal aos dois.
 */
export async function loadStateMeshFeatures(
  input: MeshLookupInput,
): Promise<readonly MeshFeature[]> {
  const state = input.state.trim().toUpperCase()
  if (!BRAZIL_STATE.some((candidate) => candidate === state)) return []

  const response = await input.fetch(buildStateMeshUrl(state), { signal: input.signal })
  if (!response.ok) throw new Error('FLEET_IBGE_MESH_REQUEST_FAILED')

  return readStateMeshFeatures(await response.json())
}

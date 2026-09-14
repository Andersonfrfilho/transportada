/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { parseTollBoothCharge } from './toll-booth-charge.policy.js'
import type { OsmTollBoothFeature, TollBoothExtractRecord } from './osm-toll-booth.types.js'

const NODE_ID_PREFIX = 'n'
const COORDINATE_DECIMALS = 7

/**
 * O extract real (166 praças) **não tem uma única tag `name`** — o que existe é `note`, texto livre
 * do mapeador ("Pedágio Nova Odessa (sentido Norte)"), presente em 159 de 166. `name` é preferida
 * quando existir, porque é o vocabulário padrão do OSM para "como isto se chama"; `note` é o que
 * sobra para a tela ter algo para imprimir hoje.
 */
export function mapOsmTollBoothFeature(feature: OsmTollBoothFeature): TollBoothExtractRecord {
  const { chargeCar, chargePerAxle } = parseTollBoothCharge(feature.properties['charge'])
  const [longitude, latitude] = feature.geometry.coordinates

  return {
    chargeCar,
    chargePerAxle,
    latitude: latitude.toFixed(COORDINATE_DECIMALS),
    longitude: longitude.toFixed(COORDINATE_DECIMALS),
    name: feature.properties['name'] ?? feature.properties['note'] ?? null,
    operator: feature.properties['operator'] ?? null,
    osmNodeId: parseOsmNodeId(feature.id),
  }
}

function parseOsmNodeId(id: string): bigint {
  if (!id.startsWith(NODE_ID_PREFIX)) {
    throw new Error(`toll booth feature id is not a node: ${id}`)
  }

  return BigInt(id.slice(NODE_ID_PREFIX.length))
}

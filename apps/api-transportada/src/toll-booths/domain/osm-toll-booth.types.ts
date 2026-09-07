/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Uma linha do `osmium export -f jsonseq -u type_id`, já filtrada por `barrier=toll_booth`. */
export type OsmTollBoothFeature = Readonly<{
  geometry: Readonly<{
    /** GeoJSON: `[longitude, latitude]`, nessa ordem. */
    coordinates: readonly [number, number]
    type: 'Point'
  }>
  /** `"n<id>"` — o prefixo de tipo que `-u type_id` acrescenta. */
  id: string
  properties: Readonly<Record<string, string>>
  type: 'Feature'
}>

/** O registro pronto para o seed (T3), antes de ganhar `observedOn`. */
export type TollBoothExtractRecord = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  latitude: string
  longitude: string
  name: null | string
  operator: null | string
  osmNodeId: bigint
}>

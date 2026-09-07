/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Uma praça pronta para o seed — o extract (T2) mais a data em que ele rodou. */
export type TollBoothSeedRecord = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  latitude: string
  longitude: string
  name: null | string
  /** A data do extract, não a de cada nó — ver `toll-booth.schema.ts`. */
  observedOn: string
  operator: null | string
  osmNodeId: bigint
}>

export type TollBoothRepository = Readonly<{
  /** Idempotente por `osm_node_id`: reexecutar o seed não duplica praça (D1). */
  saveMany: (booths: readonly TollBoothSeedRecord[]) => Promise<number>
}>

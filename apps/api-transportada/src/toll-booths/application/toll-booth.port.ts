/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TollBoothRecord } from '../domain/toll-route-cost.policy.js'

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

/**
 * A praça, pronta para `resolveTollRouteCost` (spec 090 T7), mais a data em que a tarifa foi
 * observada — a política pura não conhece data, e é a tela que precisa dela ao lado do total.
 */
export type TollBoothRouteRecord = TollBoothRecord & Readonly<{ observedOn: string }>

export type TollBoothRepository = Readonly<{
  /** Idempotente por `osm_node_id`: reexecutar o seed não duplica praça (D1). */
  saveMany: (booths: readonly TollBoothSeedRecord[]) => Promise<number>
  /**
   * As praças que a rota **pode** ter passado, pelos ids de nó — nunca a tabela inteira (spec 090
   * D1/T7). Quem decide quais delas a rota passou de verdade é `resolveTollRouteCost`, não esta
   * consulta.
   */
  readByNodeIds: (nodeIds: readonly number[]) => Promise<readonly TollBoothRouteRecord[]>
}>

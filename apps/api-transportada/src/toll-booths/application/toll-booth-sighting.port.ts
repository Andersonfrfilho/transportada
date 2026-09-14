/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type TollBoothSightingPort = Readonly<{
  /**
   * Os `osm_node_id` distintos que a empresa já viu em algum pedágio congelado de viagem (spec 090
   * T11 / spec 095 item 4) — nunca as 166 do catálogo. Ordem: a primeira vez que cada nó apareceu.
   */
  readSeenOsmNodeIds(input: { readonly companyId: string }): Promise<readonly number[]>
}>

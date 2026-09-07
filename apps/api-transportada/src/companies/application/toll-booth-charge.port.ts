/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TollBoothChargeAdjustmentRow } from '../domain/toll-booth-charge.policy.js'

export type SaveTollBoothChargeAdjustment = Readonly<{
  actorUserId: string
  chargeCar: null | string
  chargePerAxle: null | string
  companyId: string
  observedOn: string
  osmNodeId: number
}>

export type TollBoothChargeSelection = Readonly<{
  companyId: string
  osmNodeId: number
}>

export type TollBoothChargePort = Readonly<{
  clearAdjustment(input: TollBoothChargeSelection): Promise<void>
  /** Todos os ajustes da empresa, para a página de correção. */
  loadAdjustments(input: {
    readonly companyId: string
  }): Promise<readonly TollBoothChargeAdjustmentRow[]>
  /**
   * Só os nós pedidos (spec 090 D1/T7, mesma regra de `TollBoothRepository.readByNodeIds`): nunca a
   * tabela inteira, porque quem decide quais praças a rota passou é `resolveTollRouteCost`.
   */
  loadAdjustmentsByNodeIds(input: {
    readonly companyId: string
    readonly osmNodeIds: readonly number[]
  }): Promise<readonly TollBoothChargeAdjustmentRow[]>
  saveAdjustment(input: SaveTollBoothChargeAdjustment): Promise<void>
}>

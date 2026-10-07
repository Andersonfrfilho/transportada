/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  CARGO_CASE_ACTIONS,
  CARGO_CASE_DECISION_KINDS,
  CARGO_SETTLEMENT_AMOUNT_SOURCE,
  CARGO_SETTLEMENT_API_PAYER_KINDS,
  CARGO_SETTLEMENT_PAYER_KINDS,
} from './cargoOccurrenceCase.constant'
import type { CargoOccurrenceCaseStatus } from './cargoOccurrence.types'

export type CargoCaseAction = (typeof CARGO_CASE_ACTIONS)[number]
export type CargoCaseDecisionKind = (typeof CARGO_CASE_DECISION_KINDS)[number]
export type CargoSettlementPayerKind = (typeof CARGO_SETTLEMENT_PAYER_KINDS)[number]

export type ChangeCargoCaseInput = Readonly<{
  action: CargoCaseAction
  /** Só em `decide`. */
  kind?: CargoCaseDecisionKind | undefined
  /** Obrigatória em decidir, devolver ao galpão e cancelar. */
  note?: string | undefined
  occurrenceId: string
}>

/** A rota devolve só o desfecho e o estado novo; `unchanged` é a mesma ação repetida (a rede cai, o dedo repete). */
export type CargoCaseResult = Readonly<{
  kind: 'changed' | 'unchanged'
  status: CargoOccurrenceCaseStatus
}>

/** O que o `PUT` do acerto aceita: um item por linha, sempre digitado (`manual`), nunca com `payerId`. */
export type CargoSettlementItem = Readonly<{
  amount: string
  amountSource: (typeof CARGO_SETTLEMENT_AMOUNT_SOURCE)[keyof typeof CARGO_SETTLEMENT_AMOUNT_SOURCE]
  payerKind: (typeof CARGO_SETTLEMENT_API_PAYER_KINDS)[number]
  productCode: string
}>

export type CargoSettlementView = Readonly<{
  items: readonly CargoSettlementItem[]
  total: string
}>

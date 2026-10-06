/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: a tratativa da avaria de recebimento montada de verdade, com um servidor dublado que aplica as
 * MESMAS regras da API (`occurrence-case-state.policy.ts`, `occurrence-settlement.policy.ts`): a máquina de seis
 * ações (`TRANSITIONS`), nota obrigatória, `redelivery_authorized` recusada com a política `blocked`, `closure` de
 * `goods_paid` sem acerto recusada, o acerto só gravável em `decided` + `goods_paid`, o item do acerto conferido
 * contra os itens da ocorrência. Mexe nas mesmas `occurrences` do dublê da avaria (o `case.status` muda de
 * verdade). ⚠️ `mock.module` não se desfaz: o cliente novo é trocado UMA vez, aqui.
 */
import { mock } from 'bun:test'
import { act } from 'react'

import type { CargoOccurrenceCaseClient } from '@/modules/cargo-receiving/shared/cargoOccurrenceCaseClient.service'
import type {
  CargoCaseAction,
  CargoCaseDecisionKind,
  CargoSettlementItem,
} from '@/modules/cargo-receiving/shared/cargoOccurrenceCase.types'
import type { CargoOccurrenceCaseStatus } from '@/modules/cargo-receiving/shared/cargoOccurrence.types'
import { CargoReceivingRequestError } from '@/modules/cargo-receiving/shared/cargoReceivingRequest.service'

import { cargoOccurrenceFakes } from './cargoOccurrenceHarness.helper'

export type RecordedCaseChange = {
  action: CargoCaseAction
  kind: CargoCaseDecisionKind | undefined
  note: string | undefined
  occurrenceId: string
}

export type CargoCaseDouble = {
  readonly calls: {
    change: RecordedCaseChange[]
    readSettlement: string[]
    recordSettlement: { items: readonly CargoSettlementItem[]; occurrenceId: string }[]
  }
  readonly decisions: Map<string, CargoCaseDecisionKind>
  /** Fila de falhas: a próxima ESCRITA (ação ou acerto) rejeita com a primeira. */
  failures: Error[]
  /** Segura as respostas de escrita até `releaseCaseGate()`. */
  isGated: boolean
  readonly pending: (() => void)[]
  readonly settlements: Map<string, readonly CargoSettlementItem[]>
}

export const cargoCaseFakes: { client: CargoOccurrenceCaseClient; double: CargoCaseDouble } = {
  client: undefined as unknown as CargoOccurrenceCaseClient,
  double: undefined as unknown as CargoCaseDouble,
}

const TRANSITIONS: Readonly<
  Record<
    CargoCaseAction,
    { from: readonly CargoOccurrenceCaseStatus[]; to: CargoOccurrenceCaseStatus }
  >
> = {
  cancel: { from: ['recorded', 'under_review'], to: 'cancelled' },
  close: { from: ['decided'], to: 'closed' },
  decide: { from: ['awaiting_contractor'], to: 'decided' },
  review: { from: ['recorded'], to: 'under_review' },
  submit: { from: ['under_review'], to: 'awaiting_contractor' },
  'warehouse-return': { from: ['under_review'], to: 'returned_to_warehouse' },
}

const NOTE_REQUIRED: readonly CargoCaseAction[] = ['cancel', 'decide', 'warehouse-return']

const refuse = (code: string) => Promise.reject(new CargoReceivingRequestError(code))

function findOccurrence(occurrenceId: string) {
  return cargoOccurrenceFakes.double.occurrences.find((item) => item.id === occurrenceId)
}

function setStatus(input: { occurrenceId: string; status: CargoOccurrenceCaseStatus }): void {
  const double = cargoOccurrenceFakes.double
  double.occurrences = double.occurrences.map((item) =>
    item.id === input.occurrenceId && item.case !== null
      ? { ...item, case: { ...item.case, status: input.status } }
      : item,
  )
}

function decideChange(
  double: CargoCaseDouble,
  input: RecordedCaseChange,
): Promise<never> | undefined {
  const occurrence = findOccurrence(input.occurrenceId)
  if (occurrence?.case === null || occurrence === undefined) {
    return refuse('OCCURRENCE_CASE_NOT_FOUND')
  }
  const transition = TRANSITIONS[input.action]
  const status = occurrence.case.status
  if (status !== transition.to && !transition.from.includes(status)) {
    return refuse('OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED')
  }
  if (NOTE_REQUIRED.includes(input.action) && (input.note ?? '').trim() === '') {
    return refuse('OCCURRENCE_CASE_NOTE_REQUIRED')
  }
  if (input.action === 'decide' && input.kind === 'redelivery_authorized') {
    return refuse('OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED')
  }
  const isGoodsPaid = double.decisions.get(input.occurrenceId) === 'goods_paid'
  const hasSettlement = (double.settlements.get(input.occurrenceId) ?? []).length > 0
  if (input.action === 'close' && status === 'decided' && isGoodsPaid && !hasSettlement) {
    return refuse('OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS')
  }
  return undefined
}

async function afterFailures<TValue>(double: CargoCaseDouble, run: () => Promise<TValue>) {
  if (double.isGated) await new Promise<void>((resolve) => double.pending.push(resolve))
  const failure = double.failures.shift()
  if (failure !== undefined) throw failure
  return run()
}

function changeCase(double: CargoCaseDouble, input: RecordedCaseChange) {
  const refusal = decideChange(double, input)
  if (refusal !== undefined) return refusal
  const status = findOccurrence(input.occurrenceId)?.case?.status ?? 'recorded'
  const target = TRANSITIONS[input.action].to
  if (status === target) return Promise.resolve({ kind: 'unchanged' as const, status })
  if (input.action === 'decide' && input.kind !== undefined) {
    double.decisions.set(input.occurrenceId, input.kind)
  }
  setStatus({ occurrenceId: input.occurrenceId, status: target })
  return Promise.resolve({ kind: 'changed' as const, status: target })
}

function recordSettlement(
  double: CargoCaseDouble,
  input: { items: readonly CargoSettlementItem[]; occurrenceId: string },
) {
  const occurrence = findOccurrence(input.occurrenceId)
  if (occurrence?.case === null || occurrence === undefined) {
    return refuse('OCCURRENCE_CASE_NOT_FOUND')
  }
  const isWritable =
    occurrence.case.status === 'decided' &&
    double.decisions.get(input.occurrenceId) === 'goods_paid'
  if (!isWritable) return refuse('OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED')
  const known = new Set(occurrence.items.map((item) => item.code))
  if (input.items.some((item) => !known.has(item.productCode))) {
    return refuse('OCCURRENCE_SETTLEMENT_ITEM_UNKNOWN')
  }
  if (input.items.some((item) => !(Number(item.amount) > 0))) {
    return refuse('OCCURRENCE_SETTLEMENT_AMOUNT_INVALID')
  }
  double.settlements.set(input.occurrenceId, input.items)
  return Promise.resolve(buildSettlementView(input.items))
}

function buildSettlementView(items: readonly CargoSettlementItem[]) {
  const cents = items.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0)
  return {
    items: items.map((item) => ({ ...item, reimbursedAt: null })),
    total: `${(cents / 100).toFixed(4)}`,
  }
}

function buildClient(double: CargoCaseDouble): CargoOccurrenceCaseClient {
  return {
    changeCase: (input) => {
      const recorded: RecordedCaseChange = {
        action: input.action,
        kind: input.kind,
        note: input.note,
        occurrenceId: input.occurrenceId,
      }
      double.calls.change.push(recorded)
      return afterFailures(double, () => changeCase(double, recorded))
    },
    readSettlement: (occurrenceId) => {
      double.calls.readSettlement.push(occurrenceId)
      return Promise.resolve(buildSettlementView(double.settlements.get(occurrenceId) ?? []))
    },
    recordSettlement: (input) => {
      double.calls.recordSettlement.push(input)
      return afterFailures(double, () => recordSettlement(double, input))
    },
  }
}

/** O dublê da tratativa: chame DEPOIS de montar a tela só se precisar do estado; a tela lê o cliente na hora de usar. */
export function installCargoCaseDouble(overrides: Partial<CargoCaseDouble> = {}): CargoCaseDouble {
  const double: CargoCaseDouble = {
    calls: { change: [], readSettlement: [], recordSettlement: [] },
    decisions: new Map(),
    failures: [],
    isGated: false,
    pending: [],
    settlements: new Map(),
    ...overrides,
  }
  cargoCaseFakes.double = double
  cargoCaseFakes.client = buildClient(double)
  return double
}

export async function releaseCaseGate(double: CargoCaseDouble): Promise<void> {
  await act(async () => {
    for (const resolve of double.pending.splice(0)) resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

void mock.module('@/modules/cargo-receiving/shared/cargoOccurrenceCaseClient.service', () => ({
  getCargoOccurrenceCaseClient: () => cargoCaseFakes.client,
}))

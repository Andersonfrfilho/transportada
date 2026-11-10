/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320 D7/D10: o escritório libera ou descarta o relato retido. Liberar reaplica o corpo guardado pelo caminho
 * normal, com a mesma chave de idempotência: liberar duas vezes devolve o mesmo registro e nunca cria outro (CA4).
 */
import {
  FieldReportHoldAlreadyDecidedError,
  FieldReportHoldNotFoundError,
} from '../domain/trip.error.js'
import type {
  DrizzleFieldReportHoldRepository,
  FieldReportHoldRecord,
} from '../infrastructure/drizzle-field-report-hold.repository.js'

export type FieldReportHoldDecisionRepository = Pick<
  DrizzleFieldReportHoldRepository,
  'decide' | 'findById' | 'list'
>

export type DecideFieldReportHoldDependencies = {
  readonly repository: FieldReportHoldDecisionRepository
  /** A mesma função que a rota do motorista usa; devolve o id do que foi registrado. */
  readonly register: (
    payload: Readonly<Record<string, unknown>>,
  ) => Promise<{ readonly id: string }>
}

export type DecidedFieldReportHold = {
  readonly id: string
  readonly releasedResultId: null | string
  readonly state: 'discarded' | 'released'
}

export async function releaseFieldReportHold(
  dependencies: DecideFieldReportHoldDependencies,
  input: { readonly companyId: string; readonly deciderUserId: string; readonly id: string },
): Promise<DecidedFieldReportHold> {
  const hold = await requireHold(dependencies, input)
  if (hold.state === 'released') {
    return { id: hold.id, releasedResultId: hold.releasedResultId, state: 'released' }
  }
  if (hold.state === 'discarded') throw new FieldReportHoldAlreadyDecidedError(hold.state)

  /** Idempotente pela chave do app: uma segunda liberação (ou a corrida de duas) recai no mesmo registro. */
  const registered = await dependencies.register(hold.payload)
  await dependencies.repository.decide({
    companyId: input.companyId,
    decidedByUserId: input.deciderUserId,
    id: hold.id,
    reason: null,
    releasedResultId: registered.id,
    state: 'released',
  })
  const decided = await requireHold(dependencies, input)

  return { id: decided.id, releasedResultId: decided.releasedResultId, state: 'released' }
}

export async function discardFieldReportHold(
  dependencies: DecideFieldReportHoldDependencies,
  input: {
    readonly companyId: string
    readonly deciderUserId: string
    readonly id: string
    readonly reason: null | string
  },
): Promise<DecidedFieldReportHold> {
  const hold = await requireHold(dependencies, input)
  if (hold.state === 'discarded') return { id: hold.id, releasedResultId: null, state: 'discarded' }
  if (hold.state === 'released') throw new FieldReportHoldAlreadyDecidedError(hold.state)

  const changed = await dependencies.repository.decide({
    companyId: input.companyId,
    decidedByUserId: input.deciderUserId,
    id: hold.id,
    reason: input.reason,
    releasedResultId: null,
    state: 'discarded',
  })
  if (!changed) {
    const current = await requireHold(dependencies, input)
    if (current.state !== 'discarded') throw new FieldReportHoldAlreadyDecidedError(current.state)
  }

  return { id: hold.id, releasedResultId: null, state: 'discarded' }
}

async function requireHold(
  dependencies: DecideFieldReportHoldDependencies,
  input: { readonly companyId: string; readonly id: string },
): Promise<FieldReportHoldRecord> {
  const hold = await dependencies.repository.findById({ companyId: input.companyId, id: input.id })
  if (hold === null) throw new FieldReportHoldNotFoundError()

  return hold
}

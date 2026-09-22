/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T4: escritor único de `trip_occurrence_cases` / `trip_occurrence_case_events`.
 *
 * `openOccurrenceCase` é chamada de **dentro** da transação que já grava a ocorrência
 * (`saveTripOccurrence`, `delivery-proof-read.support.ts`) — nunca uma segunda transação. Tipo
 * `unset` não abre (RF3): é a mesma `resolveOccurrenceCaseOpening` da T2.
 *
 * `DrizzleOccurrenceCaseRepository.transition` é o molde de `DrizzleTripRepository.close`
 * (`drizzle-trip.repository.ts`): `select … for no key update` imediatamente antes do `update`, e
 * **nunca** `for update` — a inserção do evento pega `FOR KEY SHARE` pela FK composta
 * (`trip_occurrence_case_events_company_case_fk`), e `FOR UPDATE` deadlocka contra isso (CLAUDE.md
 * da app). A máquina (`checkOccurrenceCaseTransition`) roda de novo **depois** do lock, porque a
 * precondição do caso de uso (T5) foi lida fora da transação; a escrita é compare-and-set pelo
 * status travado — zero linhas afetadas é 409 (`OccurrenceCaseTransitionNotAllowedError`), nunca
 * 404 e nunca silêncio. Evento só quando o status muda de fato — o CHECK
 * `trip_occurrence_case_events_transition_check` reprova o contrário de qualquer forma.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { tripOccurrenceCaseEvents, tripOccurrenceCases } from '../../database/trip.schema.js'
import type {
  RedeliveryPolicy,
  TripOccurrenceCaseActorKind,
  TripOccurrenceCaseDecisionKind,
  TripOccurrenceCaseRedeliveryApplication,
  TripOccurrenceCaseStatus,
} from '../../database/trip.schema.js'
import {
  checkOccurrenceCaseTransition,
  OCCURRENCE_CASE_TERMINAL_STATUSES,
  OCCURRENCE_CASE_TRANSITION_REFUSALS,
} from '../domain/occurrence-case-state.policy.js'
import type {
  OccurrenceCaseAction,
  OccurrenceCaseTransitionRefusalCode,
} from '../domain/occurrence-case-state.policy.js'
import { resolveOccurrenceCaseOpening } from '../domain/occurrence-case.policy.js'
import {
  OccurrenceCaseNotFoundError,
  OccurrenceCaseRedeliveryNotAllowedError,
  OccurrenceCaseSettlementWithoutItemsError,
  OccurrenceCaseTransitionNotAllowedError,
} from '../domain/trip.error.js'
import type { TripQueryable, TripTransaction } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const TERMINAL_STATUSES = new Set<TripOccurrenceCaseStatus>(OCCURRENCE_CASE_TERMINAL_STATUSES)

/**
 * Chamada de dentro da transação de `saveTripOccurrence`: `unset` não abre (T2, RF3); `allowed`/
 * `blocked` abrem em `recorded` com o evento de abertura (`from_status` nulo, `actor_kind:
 * 'internal'` — quem abre é sempre quem registrou a ocorrência, nunca o contratante).
 */
export async function openOccurrenceCase(
  queryable: TripQueryable,
  input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly occurrenceId: string
    readonly redeliveryPolicy: RedeliveryPolicy
  },
): Promise<void> {
  const opening = resolveOccurrenceCaseOpening(input.redeliveryPolicy)
  if (!opening.opens) return

  const [created] = await queryable
    .insert(tripOccurrenceCases)
    .values({
      companyId: input.companyId,
      occurrenceId: input.occurrenceId,
      redeliveryPolicy: input.redeliveryPolicy,
      status: opening.status,
    })
    .returning({ id: tripOccurrenceCases.id })
  if (created === undefined) throw new Error('OCCURRENCE_CASE_OPEN_FAILED')

  await queryable.insert(tripOccurrenceCaseEvents).values({
    actorKind: 'internal',
    actorUserId: input.actorUserId,
    caseId: created.id,
    companyId: input.companyId,
    toStatus: opening.status,
  })
}

export type OccurrenceCaseTransitionInput = {
  readonly action: OccurrenceCaseAction
  readonly actorKind: TripOccurrenceCaseActorKind
  readonly actorUserId: string | null
  readonly caseId: string
  readonly companyId: string
  /** Só em `decide`: a decisão sendo aplicada agora (T5/T9-T10) — `null` nas demais ações. */
  readonly decisionKind?: TripOccurrenceCaseDecisionKind
  readonly decisionNote?: string
  /** Existe ao menos um item de `trip_occurrence_item_settlements` gravado (T16) — o caso de uso chamador calcula. */
  readonly hasSettlementItems: boolean
  readonly note: string
  readonly redeliveryApplication?: TripOccurrenceCaseRedeliveryApplication
}

export type OccurrenceCaseTransitionResult = {
  readonly kind: 'changed' | 'unchanged'
  readonly status: TripOccurrenceCaseStatus
}

/**
 * Escritor único das transições da tratativa — usado pelas quatro ações internas (T5) e pela
 * decisão do contratante (T9/T10). Nenhuma outra camada faz `update` em `trip_occurrence_cases`.
 */
export class DrizzleOccurrenceCaseRepository {
  public constructor(private readonly database: Database) {}

  public async transition(
    input: OccurrenceCaseTransitionInput,
  ): Promise<OccurrenceCaseTransitionResult> {
    return this.database.transaction((transaction) => applyTransition(transaction, input))
  }
}

async function applyTransition(
  transaction: TripTransaction,
  input: OccurrenceCaseTransitionInput,
): Promise<OccurrenceCaseTransitionResult> {
  const [locked] = await transaction
    .select({
      decisionKind: tripOccurrenceCases.decisionKind,
      redeliveryPolicy: tripOccurrenceCases.redeliveryPolicy,
      status: tripOccurrenceCases.status,
    })
    .from(tripOccurrenceCases)
    .where(
      and(
        eq(tripOccurrenceCases.companyId, input.companyId),
        eq(tripOccurrenceCases.id, input.caseId),
      ),
    )
    .for('no key update')
    .limit(1)
  if (locked === undefined) throw new OccurrenceCaseNotFoundError()

  const transition = checkOccurrenceCaseTransition({
    action: input.action,
    decisionKind: input.decisionKind ?? locked.decisionKind,
    hasSettlementItems: input.hasSettlementItems,
    redeliveryPolicy: locked.redeliveryPolicy,
    status: locked.status,
  })

  if (transition.kind === 'refused') throw refusalError(transition.code)
  if (transition.kind === 'unchanged') return { kind: 'unchanged', status: transition.to }

  const isDecide = input.action === 'decide'
  const resolvesNow = TERMINAL_STATUSES.has(transition.to)

  const updated = await transaction
    .update(tripOccurrenceCases)
    .set({
      status: transition.to,
      updatedAt: new Date(),
      ...(isDecide
        ? {
            decidedAt: new Date(),
            decidedByUserId: input.actorUserId,
            decisionKind: input.decisionKind ?? null,
            decisionNote: input.decisionNote ?? '',
          }
        : {}),
      ...(input.redeliveryApplication === undefined
        ? {}
        : { redeliveryApplication: input.redeliveryApplication }),
      ...(resolvesNow ? { resolvedAt: new Date() } : {}),
    })
    .where(
      and(
        eq(tripOccurrenceCases.companyId, input.companyId),
        eq(tripOccurrenceCases.id, input.caseId),
        eq(tripOccurrenceCases.status, locked.status),
      ),
    )
    .returning({ id: tripOccurrenceCases.id })

  /** Corrida perdida entre o lock e o CAS: outra transação já mudou o status. Nunca 404, nunca silêncio. */
  if (updated.length === 0) throw new OccurrenceCaseTransitionNotAllowedError()

  await transaction.insert(tripOccurrenceCaseEvents).values({
    actorKind: input.actorKind,
    actorUserId: input.actorUserId,
    caseId: input.caseId,
    companyId: input.companyId,
    fromStatus: locked.status,
    note: input.note,
    toStatus: transition.to,
  })

  return { kind: 'changed', status: transition.to }
}

function refusalError(code: OccurrenceCaseTransitionRefusalCode): Error {
  if (code === OCCURRENCE_CASE_TRANSITION_REFUSALS.settlementWithoutItems) {
    return new OccurrenceCaseSettlementWithoutItemsError()
  }
  if (
    code === OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryNotAllowed ||
    code === OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryBlockedHasNoQuestion
  ) {
    return new OccurrenceCaseRedeliveryNotAllowedError(
      code === OCCURRENCE_CASE_TRANSITION_REFUSALS.redeliveryNotAllowed
        ? 'redeliveryNotAllowed'
        : 'redeliveryBlockedHasNoQuestion',
    )
  }
  return new OccurrenceCaseTransitionNotAllowedError()
}

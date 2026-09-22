/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T9: a fronteira de visibilidade do portal (D5) é desta consulta, não de tela — `inner
 * join` com `trip_occurrence_cases` filtrado por `CONTRACTOR_VISIBLE_CASE_STATUSES`, e o recorte do
 * contratante é `exists` sobre `nfe_participants`, nunca `innerJoin` + `distinct`: a nota casa duas
 * vezes quando emitente e destinatário estão no mesmo escopo, e um `distinct` sobre isso faz o
 * `limit` mentir (a página perde uma linha real para cada nota assim).
 *
 * Projeção enumerada campo a campo (correção do `architect`): nenhuma coluna interna
 * (`actor_user_id`, `channel`, `trip_id`, `stop_id`, `trip_document_id`, `occurrence_type_id`,
 * `redelivery_policy`/`redelivery_application`, `decided_by_user_id`, histórico de eventos) sai
 * daqui — ver o rodapé do `plan.md` da spec 164.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, exists, inArray } from 'drizzle-orm'

import { nfeParticipants } from '../../database/nfe.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrences,
  tripDocuments,
  tripOccurrenceCases,
} from '../../database/trip.schema.js'
import type {
  TripOccurrenceCaseDecisionKind,
  TripOccurrenceCaseStatus,
} from '../../database/trip.schema.js'
import { CONTRACTOR_VISIBLE_CASE_STATUSES } from '../../trips/domain/occurrence-case.policy.js'
import type { ContractorScope } from '../domain/contractor-scope.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const CONTRACTOR_ROLES = ['emitter', 'recipient'] as const

export type ContractorOccurrenceListItem = {
  readonly caseStatus: TripOccurrenceCaseStatus
  readonly decidedAt: string | null
  readonly decisionKind: TripOccurrenceCaseDecisionKind | null
  readonly occurrenceId: string
  readonly occurrenceTypeName: string
  readonly openedAt: string
  readonly stage: string
}

export type ContractorOccurrenceDetail = ContractorOccurrenceListItem & {
  readonly caseId: string
  readonly decisionNote: string
  readonly note: string
}

/** A mesma condição de escopo que `listContractorDeliveries` usa — a nota é do contratante quando ele emitiu ou recebe. */
function buildScopeCondition(database: Database, scope: ContractorScope) {
  return exists(
    database
      .select({ one: nfeParticipants.id })
      .from(nfeParticipants)
      .where(
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          inArray(nfeParticipants.role, [...CONTRACTOR_ROLES]),
          inArray(nfeParticipants.taxId, [...scope.taxIds]),
        ),
      ),
  )
}

export async function listContractorOccurrences(
  database: Database,
  input: { readonly companyId: string; readonly limit: number; readonly scope: ContractorScope },
): Promise<readonly ContractorOccurrenceListItem[]> {
  const rows = await database
    .select({
      caseStatus: tripOccurrenceCases.status,
      decidedAt: tripOccurrenceCases.decidedAt,
      decisionKind: tripOccurrenceCases.decisionKind,
      occurrenceId: tripDocumentOccurrences.id,
      occurrenceTypeName: companyOccurrenceTypes.name,
      openedAt: tripOccurrenceCases.openedAt,
      stage: tripDocumentOccurrences.stage,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripOccurrenceCases,
      and(
        eq(tripOccurrenceCases.companyId, tripDocumentOccurrences.companyId),
        eq(tripOccurrenceCases.occurrenceId, tripDocumentOccurrences.id),
        inArray(tripOccurrenceCases.status, [...CONTRACTOR_VISIBLE_CASE_STATUSES]),
      ),
    )
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        buildScopeCondition(database, input.scope),
      ),
    )
    .orderBy(desc(tripOccurrenceCases.openedAt))
    .limit(input.limit)

  return rows.map((row) => ({
    caseStatus: row.caseStatus,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionKind: row.decisionKind,
    occurrenceId: row.occurrenceId,
    occurrenceTypeName: row.occurrenceTypeName,
    openedAt: row.openedAt.toISOString(),
    stage: row.stage,
  }))
}

/**
 * A mesma fronteira da listagem, para **um** id — usada pelo caso de uso (T10) antes de qualquer
 * leitura e antes da decisão. `null` cobre os três casos por igual: ocorrência de outra empresa,
 * ocorrência sem tratativa visível ao contratante, e ocorrência que não é dele — distinguir um do
 * outro já seria informação (correção 3 do `architect`).
 */
export async function findContractorOccurrenceDetail(
  database: Database,
  input: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly scope: ContractorScope
  },
): Promise<ContractorOccurrenceDetail | null> {
  const [row] = await database
    .select({
      caseId: tripOccurrenceCases.id,
      caseStatus: tripOccurrenceCases.status,
      decidedAt: tripOccurrenceCases.decidedAt,
      decisionKind: tripOccurrenceCases.decisionKind,
      decisionNote: tripOccurrenceCases.decisionNote,
      note: tripDocumentOccurrences.note,
      occurrenceId: tripDocumentOccurrences.id,
      occurrenceTypeName: companyOccurrenceTypes.name,
      openedAt: tripOccurrenceCases.openedAt,
      stage: tripDocumentOccurrences.stage,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripOccurrenceCases,
      and(
        eq(tripOccurrenceCases.companyId, tripDocumentOccurrences.companyId),
        eq(tripOccurrenceCases.occurrenceId, tripDocumentOccurrences.id),
        inArray(tripOccurrenceCases.status, [...CONTRACTOR_VISIBLE_CASE_STATUSES]),
      ),
    )
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
        buildScopeCondition(database, input.scope),
      ),
    )
    .limit(1)

  if (row === undefined) return null

  return {
    caseId: row.caseId,
    caseStatus: row.caseStatus,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionKind: row.decisionKind,
    decisionNote: row.decisionNote,
    note: row.note,
    occurrenceId: row.occurrenceId,
    occurrenceTypeName: row.occurrenceTypeName,
    openedAt: row.openedAt.toISOString(),
    stage: row.stage,
  }
}

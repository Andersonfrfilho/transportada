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
import type { AnyColumn } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { contractorPortalBindings } from '../../database/client-portal.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
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
import { resolveOccurrenceItems } from '../../trips/infrastructure/occurrence-items.support.js'
import type { OccurrenceItemView } from '../../trips/infrastructure/occurrence-items.support.js'
import { resolveContractorScope } from '../domain/contractor-scope.policy.js'
import type { ContractorScope } from '../domain/contractor-scope.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const CONTRACTOR_ROLES = ['emitter', 'recipient'] as const

/** Spec 164 RF13: o item apontado — código e descrição vêm da nota, quantidade/unidade da marcação. */
/** O mesmo item do detalhe do escritório (spec 183 T207): um formato, um leitor. */
export type ContractorOccurrenceItem = OccurrenceItemView

export type ContractorOccurrenceListItem = {
  readonly caseStatus: TripOccurrenceCaseStatus
  readonly decidedAt: string | null
  readonly decisionKind: TripOccurrenceCaseDecisionKind | null
  /** Lista vazia é a nota inteira (RF13) — nunca "sem item". */
  readonly items: readonly ContractorOccurrenceItem[]
  readonly nfeAccessKey: string
  readonly nfeNumber: string
  readonly nfeSeries: string
  readonly note: string
  readonly occurrenceId: string
  readonly occurrenceTypeName: string
  readonly openedAt: string
  readonly stage: string
}

export type ContractorOccurrenceDetail = ContractorOccurrenceListItem & {
  readonly caseId: string
  readonly decisionNote: string
}

/** A mesma condição de escopo que `listContractorDeliveries` usa — a nota é do contratante quando ele emitiu ou recebe. */
function buildScopeCondition(
  database: Pick<Database, 'select'>,
  scope: ContractorScope,
  documents: { readonly companyId: AnyColumn; readonly nfeDocumentId: AnyColumn } = tripDocuments,
) {
  return exists(
    database
      .select({ one: nfeParticipants.id })
      .from(nfeParticipants)
      .where(
        and(
          eq(nfeParticipants.companyId, documents.companyId),
          eq(nfeParticipants.documentId, documents.nfeDocumentId),
          inArray(nfeParticipants.role, [...CONTRACTOR_ROLES]),
          inArray(nfeParticipants.taxId, [...scope.taxIds]),
        ),
      ),
  )
}

const visibleOccurrence = alias(tripDocumentOccurrences, 'contractor_visible_occurrence')
const visibleCase = alias(tripOccurrenceCases, 'contractor_visible_case')
const visibleDocument = alias(tripDocuments, 'contractor_visible_document')

/**
 * Spec 183 T651: a fronteira desta listagem — ocorrência de nota, tratativa visível (D5) e nota do
 * recorte — como condição sobre a ocorrência de **outra** consulta. A conversa do portal filtra por
 * aqui, e não repete a regra: a tratativa continua sendo assunto só deste módulo (D4 da 183, que um
 * contrato por texto de fonte cobra da conversa). Tabelas com apelido próprio, para não colidir com
 * as da consulta de fora.
 */
export function buildContractorVisibleOccurrenceCondition(
  database: Pick<Database, 'select'>,
  input: {
    readonly companyId: AnyColumn
    readonly occurrenceId: AnyColumn
    readonly scope: ContractorScope
  },
) {
  return exists(
    database
      .select({ one: visibleOccurrence.id })
      .from(visibleOccurrence)
      .innerJoin(
        visibleCase,
        and(
          eq(visibleCase.companyId, visibleOccurrence.companyId),
          eq(visibleCase.occurrenceId, visibleOccurrence.id),
          inArray(visibleCase.status, [...CONTRACTOR_VISIBLE_CASE_STATUSES]),
        ),
      )
      .innerJoin(
        visibleDocument,
        and(
          eq(visibleDocument.companyId, visibleOccurrence.companyId),
          eq(visibleDocument.id, visibleOccurrence.tripDocumentId),
        ),
      )
      .where(
        and(
          eq(visibleOccurrence.companyId, input.companyId),
          eq(visibleOccurrence.id, input.occurrenceId),
          buildScopeCondition(database, input.scope, visibleDocument),
        ),
      ),
  )
}

/**
 * Spec 183 T654 (RF21, D9): quem lê esta ocorrência pelo portal. A contratante é o emitente da nota
 * (T203); a ocorrência tem de estar visível ao portal pela mesma fronteira da listagem, com o recorte
 * dessa contratante; e as contas são as ligadas a ela por `contractor_portal_bindings` com vínculo
 * ativo. `null` quando o portal não mostra a ocorrência a ninguém — lista vazia quando mostraria, mas
 * ninguém tem conta.
 */
export async function findContractorPortalAudience(
  database: Pick<Database, 'select'>,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<{ readonly contractorId: string; readonly userIds: readonly string[] } | null> {
  const [emitter] = await database
    .select({ contractorId: contractors.id, taxId: contractors.taxId })
    .from(tripDocumentOccurrences)
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .innerJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, 'emitter'),
      ),
    )
    .innerJoin(
      contractors,
      and(
        eq(contractors.companyId, nfeParticipants.companyId),
        eq(contractors.taxId, nfeParticipants.taxId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .limit(1)
  if (emitter === undefined || emitter.taxId.trim() === '') return null

  const scope = resolveContractorScope([emitter])
  const [visible] = await database
    .select({ id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
        buildContractorVisibleOccurrenceCondition(database, {
          companyId: tripDocumentOccurrences.companyId,
          occurrenceId: tripDocumentOccurrences.id,
          scope,
        }),
      ),
    )
    .limit(1)
  if (visible === undefined) return null

  const accounts = await database
    .select({ userId: userCompanyMemberships.userId })
    .from(contractorPortalBindings)
    .innerJoin(
      userCompanyMemberships,
      and(
        eq(userCompanyMemberships.companyId, contractorPortalBindings.companyId),
        eq(userCompanyMemberships.id, contractorPortalBindings.membershipId),
        eq(userCompanyMemberships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(contractorPortalBindings.companyId, input.companyId),
        eq(contractorPortalBindings.contractorId, emitter.contractorId),
      ),
    )
  return {
    contractorId: emitter.contractorId,
    userIds: [...new Set(accounts.map((account) => account.userId))],
  }
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
      nfeAccessKey: nfeDocuments.accessKey,
      nfeDocumentId: nfeDocuments.id,
      nfeNumber: nfeDocuments.number,
      nfeSeries: nfeDocuments.series,
      note: tripDocumentOccurrences.note,
      occurrenceId: tripDocumentOccurrences.id,
      occurrenceTypeName: companyOccurrenceTypes.name,
      openedAt: tripOccurrenceCases.openedAt,
      productCode: tripDocumentOccurrences.productCode,
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
    .innerJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
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

  const itemsByOccurrence = await resolveOccurrenceItems(database, {
    companyId: input.companyId,
    rows,
  })

  return rows.map((row) => ({
    caseStatus: row.caseStatus,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionKind: row.decisionKind,
    items: itemsByOccurrence.get(row.occurrenceId) ?? [],
    nfeAccessKey: row.nfeAccessKey,
    nfeNumber: row.nfeNumber,
    nfeSeries: row.nfeSeries,
    note: row.note,
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
      nfeAccessKey: nfeDocuments.accessKey,
      nfeDocumentId: nfeDocuments.id,
      nfeNumber: nfeDocuments.number,
      nfeSeries: nfeDocuments.series,
      note: tripDocumentOccurrences.note,
      occurrenceId: tripDocumentOccurrences.id,
      occurrenceTypeName: companyOccurrenceTypes.name,
      openedAt: tripOccurrenceCases.openedAt,
      productCode: tripDocumentOccurrences.productCode,
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
    .innerJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
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

  const itemsByOccurrence = await resolveOccurrenceItems(database, {
    companyId: input.companyId,
    rows: [row],
  })

  return {
    caseId: row.caseId,
    caseStatus: row.caseStatus,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionKind: row.decisionKind,
    decisionNote: row.decisionNote,
    items: itemsByOccurrence.get(row.occurrenceId) ?? [],
    nfeAccessKey: row.nfeAccessKey,
    nfeNumber: row.nfeNumber,
    nfeSeries: row.nfeSeries,
    note: row.note,
    occurrenceId: row.occurrenceId,
    occurrenceTypeName: row.occurrenceTypeName,
    openedAt: row.openedAt.toISOString(),
    stage: row.stage,
  }
}

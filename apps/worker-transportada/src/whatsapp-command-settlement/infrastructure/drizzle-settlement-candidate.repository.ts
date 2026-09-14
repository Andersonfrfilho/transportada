/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — os pedidos em trabalho, com o estado de cada documento deles, lidos pelas cópias de
 * schema do worker. A varredura é da instalação inteira, mas **toda junção carrega a empresa**: o id
 * do lote e o da NFS-e vêm do diário de uma empresa, e sem a empresa na junção um id alcançaria a
 * linha de outra.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
} from 'drizzle-orm'

import {
  cteBatchItems,
  cteFiscalDocuments,
  cteIssuanceAttempts,
} from '../../database/cte-issuance-execution.schema.js'
import { nfseServiceInvoices } from '../../database/nfse-issuance-execution.schema.js'
import { userWhatsAppPhones } from '../../database/user-whatsapp-phone.schema.js'
import {
  whatsAppCommandDocuments,
  whatsAppCommandRequests,
} from '../../database/whatsapp-command.schema.js'
import type {
  SettlementCandidate,
  SettlementCandidateSourcePort,
  SettlementRecipientPort,
} from '../application/whatsapp-command-settlement.port.js'
import {
  classifyWhatsAppCommandDocument,
  type WhatsAppCommandDocumentOutcome,
} from '../domain/whatsapp-command-settlement.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const requests = whatsAppCommandRequests
const documents = whatsAppCommandDocuments
const NO_ATTEMPT_STATUS = 'pending'

/**
 * T020 (B2): o pedido em recuo fica fora até a hora dele. Sem isso, os que lançam erro voltavam a
 * cada batida no topo da fila (`confirmed_at asc`) e, somando o teto, calavam o resto.
 */
export function buildCandidateFilters(input: {
  readonly now: Date
  readonly stuckConfirmingBefore: Date
}): SQL {
  return and(
    or(
      eq(requests.status, 'dispatched'),
      and(eq(requests.status, 'confirming'), lt(requests.confirmedAt, input.stuckConfirmingBefore)),
    ),
    or(isNull(requests.nextSettlementAt), lte(requests.nextSettlementAt, input.now)),
  ) as SQL
}

export function buildCandidateJournalJoin(): SQL {
  return and(
    eq(documents.companyId, requests.companyId),
    eq(documents.requestId, requests.id),
  ) as SQL
}

export function buildCandidateBatchItemJoin(): SQL {
  return and(
    eq(cteBatchItems.companyId, documents.companyId),
    eq(cteBatchItems.batchId, documents.documentId),
    eq(documents.documentKind, 'cte_batch'),
  ) as SQL
}

export function buildCandidateNfseJoin(): SQL {
  return and(
    eq(nfseServiceInvoices.companyId, documents.companyId),
    eq(nfseServiceInvoices.id, documents.documentId),
    eq(documents.documentKind, 'nfse_invoice'),
  ) as SQL
}

const companyKey = (companyId: string, id: string): string => `${companyId}:${id}`

export class DrizzleSettlementCandidateRepository
  implements SettlementCandidateSourcePort, SettlementRecipientPort
{
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async listCandidates(input: {
    readonly limit: number
    readonly now: Date
    readonly stuckConfirmingBefore: Date
  }): Promise<readonly SettlementCandidate[]> {
    const rows = await this.#database
      .select({
        actorUserId: requests.actorUserId,
        companyId: requests.companyId,
        confirmedAt: requests.confirmedAt,
        id: requests.id,
        status: requests.status,
      })
      .from(requests)
      .where(buildCandidateFilters(input))
      .orderBy(asc(requests.confirmedAt), asc(requests.id))
      .limit(input.limit)
    if (rows.length === 0) return []

    const outcomes = await this.readOutcomes(rows.map((row) => row.id))
    return rows.map((row) => ({
      actorUserId: row.actorUserId,
      companyId: row.companyId,
      confirmedAt: row.confirmedAt ?? undefined,
      documents: outcomes.get(row.id) ?? [],
      id: row.id,
      status: row.status,
    }))
  }

  async findVerifiedPhone(input: {
    readonly userId: string
    readonly verifiedSince: Date
  }): Promise<string | undefined> {
    const [row] = await this.#database
      .select({ phone: userWhatsAppPhones.phone })
      .from(userWhatsAppPhones)
      .where(
        and(
          eq(userWhatsAppPhones.userId, input.userId),
          isNotNull(userWhatsAppPhones.verifiedAt),
          gte(userWhatsAppPhones.verifiedAt, input.verifiedSince),
        ),
      )
      .limit(1)
    return row?.phone
  }

  private async readOutcomes(
    requestIds: readonly string[],
  ): Promise<ReadonlyMap<string, WhatsAppCommandDocumentOutcome[]>> {
    const [journal, cteStatuses, nfseRows] = await Promise.all([
      this.#database
        .select({
          documentKind: documents.documentKind,
          requestId: documents.requestId,
          status: documents.status,
        })
        .from(documents)
        .innerJoin(requests, buildCandidateJournalJoin())
        .where(inArray(documents.requestId, [...requestIds])),
      this.readCteStatuses(requestIds),
      this.#database
        .select({ requestId: documents.requestId, status: nfseServiceInvoices.status })
        .from(nfseServiceInvoices)
        .innerJoin(documents, buildCandidateNfseJoin())
        .where(inArray(documents.requestId, [...requestIds])),
    ])

    const outcomes = new Map<string, WhatsAppCommandDocumentOutcome[]>()
    const push = (requestId: string, outcome: WhatsAppCommandDocumentOutcome) =>
      outcomes.set(requestId, [...(outcomes.get(requestId) ?? []), outcome])
    for (const step of journal) {
      if (step.documentKind === 'billing_invoice') continue
      if (step.status === 'failed') push(step.requestId, 'failure')
      if (step.status === 'pending') push(step.requestId, 'pending')
    }
    for (const row of [...cteStatuses, ...nfseRows]) {
      push(row.requestId, classifyWhatsAppCommandDocument(row.status))
    }
    return outcomes
  }

  /**
   * Por nota: o documento fiscal quando existe, senão a última tentativa, senão `pending`. A
   * tentativa de cancelamento é posterior ao documento autorizado, e o documento vence por isso.
   */
  private async readCteStatuses(
    requestIds: readonly string[],
  ): Promise<readonly { readonly requestId: string; readonly status: string }[]> {
    const items = await this.#database
      .select({
        companyId: cteBatchItems.companyId,
        id: cteBatchItems.id,
        requestId: documents.requestId,
      })
      .from(cteBatchItems)
      .innerJoin(documents, buildCandidateBatchItemJoin())
      .where(inArray(documents.requestId, [...requestIds]))
    if (items.length === 0) return []

    const itemIds = items.map((item) => item.id)
    const [attempts, fiscal] = await Promise.all([
      this.#database
        .select({
          batchItemId: cteIssuanceAttempts.batchItemId,
          companyId: cteIssuanceAttempts.companyId,
          status: cteIssuanceAttempts.status,
        })
        .from(cteIssuanceAttempts)
        .where(inArray(cteIssuanceAttempts.batchItemId, itemIds))
        .orderBy(desc(cteIssuanceAttempts.createdAt), desc(cteIssuanceAttempts.id)),
      this.#database
        .select({
          batchItemId: cteFiscalDocuments.batchItemId,
          companyId: cteFiscalDocuments.companyId,
          status: cteFiscalDocuments.status,
        })
        .from(cteFiscalDocuments)
        .where(inArray(cteFiscalDocuments.batchItemId, itemIds)),
    ])
    const latestAttempt = new Map<string, string>()
    for (const attempt of attempts) {
      const key = companyKey(attempt.companyId, attempt.batchItemId)
      if (!latestAttempt.has(key)) latestAttempt.set(key, attempt.status)
    }
    const fiscalStatus = new Map(
      fiscal.map((document) => [
        companyKey(document.companyId, document.batchItemId),
        document.status,
      ]),
    )
    return items.map((item) => {
      const key = companyKey(item.companyId, item.id)
      return {
        requestId: item.requestId,
        status: fiscalStatus.get(key) ?? latestAttempt.get(key) ?? NO_ATTEMPT_STATUS,
      }
    })
  }
}

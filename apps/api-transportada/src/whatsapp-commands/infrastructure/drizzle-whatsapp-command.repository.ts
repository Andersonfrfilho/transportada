/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gt, lt, lte, or, sql, type SQL } from 'drizzle-orm'

import {
  userCompanyMemberships,
  WHATSAPP_COMMAND_DOCUMENT_KINDS,
  whatsAppCommandDocuments,
  whatsAppCommandRequests,
} from '../../database/database.schema.js'
import { inList } from '../../database/schema-check.constant.js'
import type {
  ClaimWhatsAppCommandInput,
  CreateWhatsAppCommandPreviewInput,
  MarkWhatsAppCommandJournalStepInput,
  WhatsAppCommandJournalStep,
  WhatsAppCommandRepositoryPort,
  WhatsAppCommandRequest,
  WhatsAppCommandSettlementOutcome,
} from '../application/whatsapp-command.port.js'

type WhatsAppCommandDatabase = ReturnType<typeof createDrizzleProvider>['db']

const requests = whatsAppCommandRequests
const documents = whatsAppCommandDocuments

/** Os passos nascem na mesma transação, com o mesmo `created_at`: desempata a ordem de execução. */
const JOURNAL_KIND_ORDER = sql`array_position(array[${sql.raw(inList(WHATSAPP_COMMAND_DOCUMENT_KINDS))}]::text[], ${documents.documentKind})`

type RequestRow = typeof requests.$inferSelect
type DocumentRow = typeof documents.$inferSelect

export function buildRequestFilters(input: {
  readonly companyId: string
  readonly id: string
}): readonly SQL[] {
  return [eq(requests.companyId, input.companyId), eq(requests.id, input.id)]
}

export function buildClaimFilters(input: {
  readonly companyId: string
  readonly id: string
  readonly now: Date
  readonly previewSha256: string
}): readonly SQL[] {
  return [
    ...buildRequestFilters(input),
    eq(requests.status, 'previewed'),
    eq(requests.previewSha256, input.previewSha256),
    gt(requests.expiresAt, input.now),
  ]
}

export function buildJournalFilters(input: {
  readonly companyId: string
  readonly requestId: string
}): readonly SQL[] {
  return [eq(documents.companyId, input.companyId), eq(documents.requestId, input.requestId)]
}

export function buildJournalStepFilters(input: {
  readonly companyId: string
  readonly id: string
}): readonly SQL[] {
  return [eq(documents.companyId, input.companyId), eq(documents.id, input.id)]
}

export function buildSettlementFilters(input: {
  readonly companyId: string
  readonly stuckConfirmingBefore: Date
}): readonly SQL[] {
  return [
    eq(requests.companyId, input.companyId),
    or(
      eq(requests.status, 'dispatched'),
      and(eq(requests.status, 'confirming'), lt(requests.confirmedAt, input.stuckConfirmingBefore)),
    ) as SQL,
  ]
}

function toRequest(row: RequestRow): WhatsAppCommandRequest {
  return {
    actorUserId: row.actorUserId,
    classification: row.classification,
    companyId: row.companyId,
    confirmedAt: row.confirmedAt ?? undefined,
    dueDate: row.dueDate ?? undefined,
    expiresAt: row.expiresAt,
    groupingMode: row.groupingMode ?? undefined,
    id: row.id,
    kind: row.kind,
    lastErrorCode: row.lastErrorCode ?? undefined,
    membershipId: row.membershipId,
    period: row.period ?? undefined,
    previewSha256: row.previewSha256,
    selection: row.selection,
    settledAt: row.settledAt ?? undefined,
    settlementOutcome: row.settlementOutcome ?? undefined,
    status: row.status,
  }
}

function toJournalStep(row: DocumentRow): WhatsAppCommandJournalStep {
  return {
    documentId: row.documentId ?? undefined,
    documentKind: row.documentKind,
    groupKey: row.groupKey,
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    lastErrorCode: row.lastErrorCode ?? undefined,
    requestId: row.requestId,
    status: row.status,
  }
}

export class DrizzleWhatsAppCommandRepository implements WhatsAppCommandRepositoryPort {
  public constructor(private readonly database: WhatsAppCommandDatabase) {}

  public async createPreview(
    input: CreateWhatsAppCommandPreviewInput,
  ): Promise<WhatsAppCommandRequest | undefined> {
    const [membership] = await this.database
      .select({ id: userCompanyMemberships.id })
      .from(userCompanyMemberships)
      .where(
        and(
          eq(userCompanyMemberships.companyId, input.companyId),
          eq(userCompanyMemberships.userId, input.actorUserId),
        ),
      )
      .limit(1)
    if (membership === undefined) return undefined

    const [row] = await this.database
      .insert(requests)
      .values({
        actorUserId: input.actorUserId,
        classification: input.classification,
        companyId: input.companyId,
        dueDate: input.dueDate ?? null,
        expiresAt: input.expiresAt,
        groupingMode: input.groupingMode ?? null,
        id: input.id,
        kind: input.kind,
        membershipId: membership.id,
        period: input.period ?? null,
        previewSha256: input.previewSha256,
        selection: input.selection,
      })
      .returning()
    return row === undefined ? undefined : toRequest(row)
  }

  public async findById(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<WhatsAppCommandRequest | undefined> {
    const [row] = await this.database
      .select()
      .from(requests)
      .where(and(...buildRequestFilters(input)))
      .limit(1)
    return row === undefined ? undefined : toRequest(row)
  }

  /** Quem decide o vencedor é o `WHERE status = 'previewed'` do `UPDATE`, não uma leitura antes dele. */
  public async claimForConfirmation(
    input: ClaimWhatsAppCommandInput,
  ): Promise<WhatsAppCommandRequest | undefined> {
    return this.database.transaction(async (transaction) => {
      const [claimed] = await transaction
        .update(requests)
        .set({ confirmedAt: input.now, status: 'confirming', updatedAt: input.now })
        .where(and(...buildClaimFilters(input)))
        .returning()
      if (claimed === undefined) return undefined

      if (input.steps.length > 0) {
        await transaction.insert(documents).values(
          input.steps.map((step) => ({
            companyId: input.companyId,
            documentKind: step.documentKind,
            groupKey: step.groupKey,
            idempotencyKey: step.idempotencyKey,
            requestId: claimed.id,
          })),
        )
      }
      return toRequest(claimed)
    })
  }

  public async markSuperseded(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<boolean> {
    return this.transitionFromPreviewed(input, [])
  }

  public async markExpired(input: {
    readonly companyId: string
    readonly id: string
    readonly now: Date
  }): Promise<boolean> {
    return this.transitionFromPreviewed(input, [lte(requests.expiresAt, input.now)], 'expired')
  }

  public async listJournal(input: {
    readonly companyId: string
    readonly requestId: string
  }): Promise<readonly WhatsAppCommandJournalStep[]> {
    const rows = await this.database
      .select()
      .from(documents)
      .where(and(...buildJournalFilters(input)))
      .orderBy(asc(documents.createdAt), JOURNAL_KIND_ORDER, asc(documents.groupKey))
    return rows.map(toJournalStep)
  }

  public async markJournalStep(input: MarkWhatsAppCommandJournalStepInput): Promise<boolean> {
    const updated = await this.database
      .update(documents)
      .set({
        ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
        lastErrorCode: input.errorCode ?? null,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(and(...buildJournalStepFilters(input)))
      .returning({ id: documents.id })
    return updated.length > 0
  }

  public async markDispatched(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<boolean> {
    const updated = await this.database
      .update(requests)
      .set({ status: 'dispatched', updatedAt: new Date() })
      .where(and(...buildRequestFilters(input), eq(requests.status, 'confirming')))
      .returning({ id: requests.id })
    return updated.length > 0
  }

  public async listForSettlement(input: {
    readonly companyId: string
    readonly stuckConfirmingBefore: Date
  }): Promise<readonly WhatsAppCommandRequest[]> {
    const rows = await this.database
      .select()
      .from(requests)
      .where(and(...buildSettlementFilters(input)))
      .orderBy(asc(requests.confirmedAt), asc(requests.id))
    return rows.map(toRequest)
  }

  /** `where status = 'dispatched'` torna a repetição da liquidação inofensiva. */
  public async markSettled(input: {
    readonly companyId: string
    readonly id: string
    readonly now: Date
    readonly outcome: WhatsAppCommandSettlementOutcome
  }): Promise<boolean> {
    const updated = await this.database
      .update(requests)
      .set({
        settledAt: input.now,
        settlementOutcome: input.outcome,
        status: input.outcome,
        updatedAt: input.now,
      })
      .where(and(...buildRequestFilters(input), eq(requests.status, 'dispatched')))
      .returning({ id: requests.id })
    return updated.length > 0
  }

  private async transitionFromPreviewed(
    input: { readonly companyId: string; readonly id: string },
    extraFilters: readonly SQL[],
    status: 'expired' | 'superseded' = 'superseded',
  ): Promise<boolean> {
    const updated = await this.database
      .update(requests)
      .set({ status, updatedAt: new Date() })
      .where(and(...buildRequestFilters(input), eq(requests.status, 'previewed'), ...extraFilters))
      .returning({ id: requests.id })
    return updated.length > 0
  }
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320: os relatos do app retidos para o escritório. Toda consulta e toda escrita leva `company_id`.
 */
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'

import {
  companyFieldReportHoldSettings,
  companyOccurrenceTypes,
  nfeDocuments,
  tripDocuments,
  FIELD_REPORT_HOLD_STATES,
  tripDocumentOccurrences,
  tripFieldReportHolds,
  tripFieldReports,
  type FieldReportHoldState,
} from '../../database/database.schema.js'
import type {
  FieldReportHoldPort,
  FieldReportHoldRecordInput,
} from '../application/field-report-hold.port.js'
import type { TripQueryable } from './trip-queryable.type.js'

export type FieldReportHoldSettings = {
  readonly enabled: boolean
  readonly updatedAt: Date | null
}

export type FieldReportHoldDisplay = {
  readonly invoiceNumber: null | string
  readonly occurrenceTypeName: null | string
}

export type FieldReportHoldRecord = {
  readonly actorUserId: string
  readonly decidedAt: Date | null
  readonly decidedByUserId: null | string
  readonly decisionReason: null | string
  readonly id: string
  readonly occurredAt: Date
  readonly operation: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly probableDuplicateOf: null | string
  readonly receivedAt: Date
  readonly releasedResultId: null | string
  readonly state: FieldReportHoldState
  readonly tappedAt: Date
  readonly tripDocumentId: null | string
}

const HOLD_COLUMNS = {
  actorUserId: tripFieldReportHolds.actorUserId,
  decidedAt: tripFieldReportHolds.decidedAt,
  decidedByUserId: tripFieldReportHolds.decidedByUserId,
  decisionReason: tripFieldReportHolds.decisionReason,
  id: tripFieldReportHolds.id,
  occurredAt: tripFieldReportHolds.occurredAt,
  operation: tripFieldReportHolds.operation,
  payload: tripFieldReportHolds.payload,
  probableDuplicateOf: tripFieldReportHolds.probableDuplicateOf,
  receivedAt: tripFieldReportHolds.receivedAt,
  releasedResultId: tripFieldReportHolds.releasedResultId,
  state: tripFieldReportHolds.state,
  tappedAt: tripFieldReportHolds.tappedAt,
  tripDocumentId: tripFieldReportHolds.tripDocumentId,
} as const

const LIST_LIMIT = 200

export class DrizzleFieldReportHoldRepository implements FieldReportHoldPort {
  constructor(private readonly database: TripQueryable) {}

  async isEnabled(companyId: string): Promise<boolean> {
    const [row] = await this.database
      .select({ enabled: companyFieldReportHoldSettings.holdEnabled })
      .from(companyFieldReportHoldSettings)
      .where(eq(companyFieldReportHoldSettings.companyId, companyId))
      .limit(1)

    return row?.enabled === true
  }

  /** Sem linha é resposta válida: desligado (spec 320 D8). */
  async readSettings(companyId: string): Promise<FieldReportHoldSettings> {
    const [row] = await this.database
      .select({
        enabled: companyFieldReportHoldSettings.holdEnabled,
        updatedAt: companyFieldReportHoldSettings.updatedAt,
      })
      .from(companyFieldReportHoldSettings)
      .where(eq(companyFieldReportHoldSettings.companyId, companyId))
      .limit(1)

    return { enabled: row?.enabled === true, updatedAt: row?.updatedAt ?? null }
  }

  async saveSettings(input: {
    readonly companyId: string
    readonly enabled: boolean
    readonly userId: string
  }): Promise<FieldReportHoldSettings> {
    const now = new Date()
    await this.database
      .insert(companyFieldReportHoldSettings)
      .values({
        companyId: input.companyId,
        holdEnabled: input.enabled,
        updatedAt: now,
        updatedByUserId: input.userId,
      })
      .onConflictDoUpdate({
        set: { holdEnabled: input.enabled, updatedAt: now, updatedByUserId: input.userId },
        target: companyFieldReportHoldSettings.companyId,
      })

    return { enabled: input.enabled, updatedAt: now }
  }

  async isKeyRegistered(input: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<boolean> {
    const [row] = await this.database
      .select({ id: tripFieldReports.id })
      .from(tripFieldReports)
      .where(
        and(
          eq(tripFieldReports.companyId, input.companyId),
          eq(tripFieldReports.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)

    return row !== undefined
  }

  /** Qualquer canal: o fato que o escritório ou o bot já registrou é justamente o que o app duplica. */
  async findProbableDuplicate(input: {
    readonly companyId: string
    readonly documentId: string
    readonly occurrenceTypeId: string
    readonly since: Date
  }): Promise<null | string> {
    const [row] = await this.database
      .select({ id: tripDocumentOccurrences.id })
      .from(tripDocumentOccurrences)
      .where(
        and(
          eq(tripDocumentOccurrences.companyId, input.companyId),
          eq(tripDocumentOccurrences.tripDocumentId, input.documentId),
          eq(tripDocumentOccurrences.occurrenceTypeId, input.occurrenceTypeId),
          gte(tripDocumentOccurrences.createdAt, input.since),
          isNull(tripDocumentOccurrences.cancelledAt),
        ),
      )
      .orderBy(desc(tripDocumentOccurrences.createdAt))
      .limit(1)

    return row === undefined ? null : `occurrence:${row.id}`
  }

  async record(input: FieldReportHoldRecordInput): Promise<{ readonly id: string }> {
    const [inserted] = await this.database
      .insert(tripFieldReportHolds)
      .values({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        idempotencyKey: input.idempotencyKey,
        occurredAt: input.occurredAt,
        operation: input.operation,
        payload: input.payload,
        probableDuplicateOf: input.probableDuplicateOf,
        receivedAt: input.receivedAt,
        tappedAt: input.tappedAt,
        tripDocumentId: input.tripDocumentId,
      })
      .onConflictDoNothing({
        target: [tripFieldReportHolds.companyId, tripFieldReportHolds.idempotencyKey],
      })
      .returning({ id: tripFieldReportHolds.id })
    if (inserted !== undefined) return inserted

    const [existing] = await this.database
      .select({ id: tripFieldReportHolds.id })
      .from(tripFieldReportHolds)
      .where(
        and(
          eq(tripFieldReportHolds.companyId, input.companyId),
          eq(tripFieldReportHolds.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    if (existing === undefined) throw new Error('field report hold vanished after conflict')

    return existing
  }

  async list(input: {
    readonly companyId: string
    readonly state: FieldReportHoldState
  }): Promise<readonly FieldReportHoldRecord[]> {
    const rows = await this.database
      .select(HOLD_COLUMNS)
      .from(tripFieldReportHolds)
      .where(
        and(
          eq(tripFieldReportHolds.companyId, input.companyId),
          eq(tripFieldReportHolds.state, input.state),
        ),
      )
      .orderBy(desc(tripFieldReportHolds.receivedAt), desc(tripFieldReportHolds.id))
      .limit(LIST_LIMIT)

    return rows.map(toRecord)
  }

  /** O que o escritório precisa ler na tela: número da nota e nome do tipo (o corpo guardado só tem ids). */
  async describe(input: {
    readonly companyId: string
    readonly holds: readonly FieldReportHoldRecord[]
  }): Promise<ReadonlyMap<string, FieldReportHoldDisplay>> {
    const documentIds = [
      ...new Set(
        input.holds.flatMap((hold) => (hold.tripDocumentId === null ? [] : [hold.tripDocumentId])),
      ),
    ]
    const typeIds = [
      ...new Set(
        input.holds.flatMap((hold) =>
          typeof hold.payload.occurrenceTypeId === 'string' ? [hold.payload.occurrenceTypeId] : [],
        ),
      ),
    ]
    const invoices =
      documentIds.length === 0
        ? []
        : await this.database
            .select({
              id: tripDocuments.id,
              number: nfeDocuments.number,
              series: nfeDocuments.series,
            })
            .from(tripDocuments)
            .innerJoin(nfeDocuments, eq(nfeDocuments.id, tripDocuments.nfeDocumentId))
            .where(
              and(
                eq(tripDocuments.companyId, input.companyId),
                inArray(tripDocuments.id, documentIds),
              ),
            )
    const types =
      typeIds.length === 0
        ? []
        : await this.database
            .select({ id: companyOccurrenceTypes.id, name: companyOccurrenceTypes.name })
            .from(companyOccurrenceTypes)
            .where(
              and(
                eq(companyOccurrenceTypes.companyId, input.companyId),
                inArray(companyOccurrenceTypes.id, typeIds),
              ),
            )
    const invoiceById = new Map(invoices.map((row) => [row.id, row]))
    const typeById = new Map(types.map((row) => [row.id, row.name]))

    return new Map(
      input.holds.map((hold) => {
        const invoice =
          hold.tripDocumentId === null ? undefined : invoiceById.get(hold.tripDocumentId)
        const typeId = hold.payload.occurrenceTypeId

        return [
          hold.id,
          {
            invoiceNumber: invoice === undefined ? null : `${invoice.number}/${invoice.series}`,
            occurrenceTypeName: typeof typeId === 'string' ? (typeById.get(typeId) ?? null) : null,
          },
        ]
      }),
    )
  }

  async findById(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<FieldReportHoldRecord | null> {
    const [row] = await this.database
      .select(HOLD_COLUMNS)
      .from(tripFieldReportHolds)
      .where(
        and(
          eq(tripFieldReportHolds.companyId, input.companyId),
          eq(tripFieldReportHolds.id, input.id),
        ),
      )
      .limit(1)

    return row === undefined ? null : toRecord(row)
  }

  /** Só sai de `held`: a segunda decisão encontra a linha já decidida e não escreve (CA4). */
  async decide(input: {
    readonly companyId: string
    readonly decidedByUserId: string
    readonly id: string
    readonly reason: null | string
    readonly releasedResultId: null | string
    readonly state:
      | typeof FIELD_REPORT_HOLD_STATES.discarded
      | typeof FIELD_REPORT_HOLD_STATES.released
  }): Promise<boolean> {
    const updated = await this.database
      .update(tripFieldReportHolds)
      .set({
        decidedAt: sql`now()`,
        decidedByUserId: input.decidedByUserId,
        decisionReason: input.reason,
        releasedResultId: input.releasedResultId,
        state: input.state,
      })
      .where(
        and(
          eq(tripFieldReportHolds.companyId, input.companyId),
          eq(tripFieldReportHolds.id, input.id),
          eq(tripFieldReportHolds.state, FIELD_REPORT_HOLD_STATES.held),
        ),
      )
      .returning({ id: tripFieldReportHolds.id })

    return updated.length > 0
  }
}

function toRecord(row: {
  readonly payload: unknown
  [key: string]: unknown
}): FieldReportHoldRecord {
  return {
    ...row,
    payload: row.payload as Readonly<Record<string, unknown>>,
  } as FieldReportHoldRecord
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 320: os relatos do app retidos para o escritório. Toda consulta e toda escrita leva `company_id`.
 */
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'

import {
  companyFieldReportHoldSettings,
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

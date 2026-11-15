/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, desc, eq, inArray, lt, lte, sql } from 'drizzle-orm'

import type {
  CompanySettingsDatabase,
  CompanySettingsQueryable,
} from '../../companies/infrastructure/drizzle-company-settings.types.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { pickupRequestNotifications, pickupRequests } from '../../database/pickup-request.schema.js'
import type {
  PickupNotificationEvent,
  PickupRequestStatus,
} from '../../database/pickup-request.schema.js'
import { tripStops, trips } from '../../database/trip.schema.js'
import { TRIP_STATUSES_BEFORE_DISPATCH } from '../../trips/domain/trip-state.policy.js'
import type {
  NewPickupRequest,
  PickupRequestAuditEntry,
  PickupRequestRecord,
  PickupRequestRepositoryPort,
  PickupRequestTransitionPatch,
  SuggestedTrip,
} from '../application/pickup-request.port.js'

type Row = typeof pickupRequests.$inferSelect

const AUDIT_ENTITY_TYPE = 'pickup-request'

/** Toda instrução filtra por `company_id` do contexto — exceto as duas varreduras do cron, que são de serviço. */
export class DrizzlePickupRequestRepository implements PickupRequestRepositoryPort {
  public constructor(private readonly database: CompanySettingsDatabase) {}

  public async insert(input: NewPickupRequest): Promise<{
    readonly created: boolean
    readonly record: PickupRequestRecord
  }> {
    return this.database.transaction(async (tx) => this.insertIn(tx, input))
  }

  private async insertIn(
    database: CompanySettingsQueryable,
    input: NewPickupRequest,
  ): Promise<{ readonly created: boolean; readonly record: PickupRequestRecord }> {
    const [inserted] = await database
      .insert(pickupRequests)
      .values({
        cargoDescription: input.cargoDescription,
        companyId: input.companyId,
        contractorId: input.contractorId,
        destination: input.destination,
        expiresAt: input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        integrationKeyId: input.integrationKeyId ?? null,
        kind: input.kind,
        note: input.note,
        origin: input.origin,
        quotedTotalAmount: input.quotedTotalAmount,
        quoteValidUntil: input.quoteValidUntil,
        requesterEmail: input.requesterEmail,
        requesterName: input.requesterName,
        requesterPhone: input.requesterPhone,
        requesterTaxId: input.requesterTaxId,
        source: input.source,
        volumes: input.volumes,
        weightKg: input.weightKg,
        windowEnd: input.windowEnd,
        windowStart: input.windowStart,
      })
      .onConflictDoNothing({
        target: [pickupRequests.companyId, pickupRequests.source, pickupRequests.idempotencyKey],
      })
      .returning()
    if (inserted !== undefined) {
      await enqueueNotifications(database, toRecord(inserted), 'requested')
      return { created: true, record: toRecord(inserted) }
    }

    const [existing] = await database
      .select()
      .from(pickupRequests)
      .where(
        and(
          eq(pickupRequests.companyId, input.companyId),
          eq(pickupRequests.source, input.source),
          eq(pickupRequests.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    if (existing === undefined) throw new Error('PICKUP_REQUEST_INSERT_RETURNED_NOTHING')
    return { created: false, record: toRecord(existing) }
  }

  public async resolveContractorByTaxId(input: {
    readonly companyId: string
    readonly displayName: string
    readonly taxId: string
  }): Promise<{ readonly contractorId: string; readonly created: boolean }> {
    const [existing] = await this.database
      .select({ id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.companyId, input.companyId), eq(contractors.taxId, input.taxId)))
      .limit(1)
    if (existing !== undefined) return { contractorId: existing.id, created: false }
    const [created] = await this.database
      .insert(contractors)
      .values({
        companyId: input.companyId,
        displayName: input.displayName,
        notes: 'Cadastrado automaticamente ao aceitar um pedido de coleta. Conferir os dados.',
        taxId: input.taxId,
      })
      .onConflictDoNothing({ target: [contractors.companyId, contractors.taxId] })
      .returning({ id: contractors.id })
    if (created !== undefined) return { contractorId: created.id, created: true }
    // Corrida: outro pedido criou o mesmo documento entre a leitura e a escrita.
    const [raced] = await this.database
      .select({ id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.companyId, input.companyId), eq(contractors.taxId, input.taxId)))
      .limit(1)
    if (raced === undefined) throw new Error('PICKUP_REQUEST_CONTRACTOR_RESOLVE_FAILED')
    return { contractorId: raced.id, created: false }
  }

  public async find(input: {
    readonly companyId: string
    readonly id: string
  }): Promise<PickupRequestRecord | null> {
    const [row] = await this.database
      .select()
      .from(pickupRequests)
      .where(and(eq(pickupRequests.companyId, input.companyId), eq(pickupRequests.id, input.id)))
      .limit(1)
    return row === undefined ? null : toRecord(row)
  }

  public async listForContractor(input: {
    readonly companyId: string
    readonly contractorIds: readonly string[]
    readonly limit: number
  }): Promise<readonly PickupRequestRecord[]> {
    if (input.contractorIds.length === 0) return []
    const rows = await this.database
      .select()
      .from(pickupRequests)
      .where(
        and(
          eq(pickupRequests.companyId, input.companyId),
          inArray(pickupRequests.contractorId, [...input.contractorIds]),
        ),
      )
      .orderBy(desc(pickupRequests.createdAt))
      .limit(input.limit)
    return rows.map(toRecord)
  }

  public async listForOffice(input: {
    readonly companyId: string
    readonly limit: number
    readonly status: PickupRequestStatus | undefined
  }): Promise<readonly PickupRequestRecord[]> {
    const rows = await this.database
      .select()
      .from(pickupRequests)
      .where(
        and(
          eq(pickupRequests.companyId, input.companyId),
          input.status === undefined ? undefined : eq(pickupRequests.status, input.status),
        ),
      )
      .orderBy(desc(pickupRequests.createdAt))
      .limit(input.limit)
    return rows.map(toRecord)
  }

  public async transition(input: {
    readonly companyId: string
    readonly contractorIds?: readonly string[]
    readonly integrationKeyId?: string
    readonly from: PickupRequestStatus
    readonly id: string
    readonly patch: PickupRequestTransitionPatch
    readonly to: PickupRequestStatus
  }): Promise<PickupRequestRecord | null> {
    const now = new Date()
    return this.database.transaction(async (tx) => {
      const [row] = await tx
        .update(pickupRequests)
        .set({
          ...input.patch,
          ...(input.patch.decidedByUserId === undefined ? {} : { decidedAt: now }),
          status: input.to,
          updatedAt: now,
        })
        .where(
          and(
            eq(pickupRequests.companyId, input.companyId),
            eq(pickupRequests.id, input.id),
            eq(pickupRequests.status, input.from),
            input.contractorIds === undefined
              ? undefined
              : inArray(pickupRequests.contractorId, [...input.contractorIds]),
            input.integrationKeyId === undefined
              ? undefined
              : eq(pickupRequests.integrationKeyId, input.integrationKeyId),
          ),
        )
        .returning()
      if (row === undefined) return null
      const record = toRecord(row)
      await enqueueNotifications(tx, record, eventForStatus(input.to))
      return record
    })
  }

  public async listOpenTrips(input: {
    readonly companyId: string
    readonly limit: number
  }): Promise<readonly SuggestedTrip[]> {
    const rows = await this.database
      .select({
        createdAt: trips.createdAt,
        id: trips.id,
        status: trips.status,
        stopCount: sql<number>`(select count(*)::int from ${tripStops} where ${tripStops.tripId} = ${trips.id} and ${tripStops.companyId} = ${trips.companyId})`,
      })
      .from(trips)
      .where(
        and(
          eq(trips.companyId, input.companyId),
          inArray(trips.status, [...TRIP_STATUSES_BEFORE_DISPATCH]),
        ),
      )
      .orderBy(desc(trips.createdAt))
      .limit(input.limit)
    return rows
  }

  public async isTripOpen(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<boolean> {
    const [row] = await this.database
      .select({ id: trips.id })
      .from(trips)
      .where(
        and(
          eq(trips.companyId, input.companyId),
          eq(trips.id, input.tripId),
          inArray(trips.status, [...TRIP_STATUSES_BEFORE_DISPATCH]),
        ),
      )
      .limit(1)
    return row !== undefined
  }

  public async expireDue(input: { readonly now: Date }): Promise<readonly PickupRequestRecord[]> {
    const rows = await this.database
      .update(pickupRequests)
      .set({ status: 'expired', updatedAt: input.now })
      .where(and(eq(pickupRequests.status, 'requested'), lte(pickupRequests.expiresAt, input.now)))
      .returning()
    return rows.map(toRecord)
  }

  public async listStale(input: {
    readonly olderThan: Date
  }): Promise<readonly PickupRequestRecord[]> {
    const rows = await this.database
      .select()
      .from(pickupRequests)
      .where(
        and(
          eq(pickupRequests.status, 'requested'),
          lt(pickupRequests.createdAt, input.olderThan),
          sql`${pickupRequests.staleAlertedAt} is null`,
        ),
      )
      .limit(200)
    return rows.map(toRecord)
  }

  public async markAlerted(input: {
    readonly ids: readonly string[]
    readonly now: Date
  }): Promise<void> {
    if (input.ids.length === 0) return
    await this.database
      .update(pickupRequests)
      .set({ staleAlertedAt: input.now })
      .where(inArray(pickupRequests.id, [...input.ids]))
  }

  public async appendAudit(entry: PickupRequestAuditEntry): Promise<void> {
    await this.database.insert(auditLogs).values({
      action: entry.action,
      actorUserId: entry.actorUserId,
      companyId: entry.companyId,
      correlationId: entry.correlationId,
      entityId: entry.requestId,
      entityType: AUDIT_ENTITY_TYPE,
      metadata: { after: entry.after, before: entry.before },
      permission: entry.action === 'pickup-request.created' ? 'pickup.request' : 'pickup.manage',
      targetId: entry.requestId,
      targetType: AUDIT_ENTITY_TYPE,
    })
  }
}

function toRecord(row: Row): PickupRequestRecord {
  return {
    acceptedTotalAmount: row.acceptedTotalAmount,
    acceptedWindowEnd: row.acceptedWindowEnd,
    acceptedWindowStart: row.acceptedWindowStart,
    cargoDescription: row.cargoDescription,
    companyId: row.companyId,
    contractorId: row.contractorId,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    decisionNote: row.decisionNote,
    destination: row.destination,
    expiresAt: row.expiresAt,
    id: row.id,
    integrationKeyId: row.integrationKeyId,
    kind: row.kind,
    note: row.note,
    origin: row.origin,
    quotedTotalAmount: row.quotedTotalAmount,
    quoteValidUntil: row.quoteValidUntil,
    requesterEmail: row.requesterEmail,
    requesterName: row.requesterName,
    requesterPhone: row.requesterPhone,
    requesterTaxId: row.requesterTaxId,
    source: row.source,
    staleAlertedAt: row.staleAlertedAt,
    status: row.status,
    tripId: row.tripId,
    tripStopId: row.tripStopId,
    volumes: row.volumes,
    weightKg: row.weightKg,
    windowEnd: row.windowEnd,
    windowStart: row.windowStart,
  }
}

function eventForStatus(status: PickupRequestStatus): PickupNotificationEvent | null {
  switch (status) {
    case 'accepted':
    case 'refused':
    case 'scheduled':
    case 'canceled':
    case 'expired':
      return status
    default:
      return null
  }
}

/**
 * Spec 339 T4: grava os avisos na caixa de saída, na mesma transação da mudança de estado. O cliente é avisado do que o
 * escritório decidiu (e-mail e WhatsApp, só onde há contato); o escritório, de pedido novo e de cancelamento (e-mail).
 * `on conflict do nothing`: o mesmo aviso nunca entra duas vezes.
 */
async function enqueueNotifications(
  database: CompanySettingsQueryable,
  record: PickupRequestRecord,
  event: PickupNotificationEvent | null,
): Promise<void> {
  if (event === null) return
  const rows: (typeof pickupRequestNotifications.$inferInsert)[] = []
  const base = { companyId: record.companyId, event, pickupRequestId: record.id }
  const toOffice = event === 'requested' || event === 'canceled'
  if (toOffice) rows.push({ ...base, audience: 'office', channel: 'email' })
  else {
    if (record.requesterEmail !== null) rows.push({ ...base, audience: 'client', channel: 'email' })
    if (record.requesterPhone !== null) {
      rows.push({ ...base, audience: 'client', channel: 'whatsapp' })
    }
  }
  if (rows.length === 0) return
  await database.insert(pickupRequestNotifications).values(rows).onConflictDoNothing()
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, ne, sql, type SQL } from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { nfeDocumentStatusChanges, nfeDocuments, nfeEvents } from '../../database/nfe.schema.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ApiError } from '../../shared/api.error.js'
import type {
  NfeDocumentEventActor,
  NfeDocumentEventEntry,
  NfeDocumentEventPage,
  NfeDocumentEventRepositoryPort,
} from '../application/nfe-document-event.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const actorMembership = alias(userCompanyMemberships, 'nfe_event_actor_membership')
const actorProfile = alias(identityUserProfiles, 'nfe_event_actor_profile')
const requesterMembership = alias(userCompanyMemberships, 'nfe_event_requester_membership')
const requesterProfile = alias(identityUserProfiles, 'nfe_event_requester_profile')

const statusActorMembership = alias(userCompanyMemberships, 'nfe_status_change_actor_membership')
const statusActorProfile = alias(identityUserProfiles, 'nfe_status_change_actor_profile')
const statusRequesterMembership = alias(
  userCompanyMemberships,
  'nfe_status_change_requester_membership',
)
const statusRequesterProfile = alias(identityUserProfiles, 'nfe_status_change_requester_profile')

type MergedRow = {
  readonly actor: NfeDocumentEventActor | null
  readonly correctionText: string | null
  readonly eventType: string | null
  readonly id: string
  readonly kind: 'event' | 'statusChange'
  readonly occurredAt: Date | null
  readonly origin: 'automatic' | 'manual' | 'unknown'
  readonly protocol: string | null
  readonly registeredAt: Date
  readonly registeredAtKey: string
  readonly requestedBy: NfeDocumentEventActor | null
  readonly sequence: string | null
  readonly statusAfter: NfeDocumentEventEntry['statusAfter']
  readonly statusBefore: NfeDocumentEventEntry['statusBefore']
  readonly statusCode: string | null
}

/**
 * Spec 149 D19 — dois ramos (`nfe_events` e `nfe_document_status_changes` com `cause <> 'event'`),
 * cada um com `limit + 1` e o próprio keyset, mesclados em memória por `(registered_at, id)` desc: os
 * `limit + 1` primeiros de cada ramo bastam para os `limit + 1` primeiros da união (h1-parecer-architect
 * §3), sem depender de `UNION ALL` que o restante do repositório não usa em lugar nenhum.
 */
export class DrizzleNfeDocumentEventRepository implements NfeDocumentEventRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async listEvents(input: {
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly documentId: string
    readonly limit: number
  }): Promise<NfeDocumentEventPage> {
    const companyId = input.context.companyId
    const document = await this.findDocumentAccessKey(companyId, input.documentId)
    if (document === null) throw documentNotFound()
    const cursor = decodeCursor(input.cursor)

    const [eventRows, statusChangeRows] = await Promise.all([
      this.selectEventRows({
        accessKey: document.accessKey,
        companyId,
        cursor,
        limit: input.limit,
      }),
      this.selectStatusChangeRows({
        companyId,
        cursor,
        documentId: document.id,
        limit: input.limit,
      }),
    ])

    const merged = mergeDescending(eventRows, statusChangeRows).slice(0, input.limit + 1)
    const page = merged.slice(0, input.limit)
    const last = page.at(-1)
    return {
      items: page.map(toEntry),
      nextCursor:
        merged.length > input.limit && last !== undefined
          ? `${last.registeredAtKey}::${last.id}`
          : null,
    }
  }

  private async findDocumentAccessKey(
    companyId: string,
    documentId: string,
  ): Promise<{ readonly accessKey: string; readonly id: string } | null> {
    const [row] = await this.database
      .select({ accessKey: nfeDocuments.accessKey, id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.id, documentId)))
      .limit(1)
    return row ?? null
  }

  private async selectEventRows(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly cursor: EventCursor | null
    readonly limit: number
  }): Promise<readonly MergedRow[]> {
    const filters = [
      eq(nfeEvents.companyId, input.companyId),
      eq(nfeEvents.targetAccessKey, input.accessKey),
    ]
    if (input.cursor !== null) {
      filters.push(
        sql`(${nfeEvents.createdAt}, ${nfeEvents.id}) < (${input.cursor.registeredAt}::timestamptz, ${input.cursor.id}::uuid)`,
      )
    }
    const rows = await this.database
      .select({
        actorName: actorProfile.name,
        actorUserId: nfeEvents.actorUserId,
        correctionText: nfeEvents.correctionText,
        eventType: nfeEvents.eventType,
        id: nfeEvents.id,
        occurredAt: nfeEvents.occurredAt,
        origin: nfeEvents.origin,
        protocol: nfeEvents.protocol,
        registeredAt: nfeEvents.createdAt,
        registeredAtKey: formatCursorTimestamp(nfeEvents.createdAt),
        requestedByName: requesterProfile.name,
        requestedByUserId: nfeEvents.requestedByUserId,
        sequence: sql<string>`${nfeEvents.eventSequence}::text`,
        statusAfter: nfeEvents.documentStatusAfter,
        statusBefore: nfeEvents.documentStatusBefore,
        statusCode: nfeEvents.statusCode,
      })
      .from(nfeEvents)
      .leftJoin(
        actorMembership,
        and(
          eq(actorMembership.userId, nfeEvents.actorUserId),
          eq(actorMembership.companyId, input.companyId),
          eq(actorMembership.status, 'active'),
        ),
      )
      .leftJoin(actorProfile, eq(actorProfile.userId, actorMembership.userId))
      .leftJoin(
        requesterMembership,
        and(
          eq(requesterMembership.userId, nfeEvents.requestedByUserId),
          eq(requesterMembership.companyId, input.companyId),
          eq(requesterMembership.status, 'active'),
        ),
      )
      .leftJoin(requesterProfile, eq(requesterProfile.userId, requesterMembership.userId))
      .where(and(...filters))
      .orderBy(desc(nfeEvents.createdAt), desc(nfeEvents.id))
      .limit(input.limit + 1)

    return rows.map((row) => ({
      actor: buildActor(row.actorUserId, row.actorName),
      correctionText: row.correctionText,
      eventType: row.eventType,
      id: row.id,
      kind: 'event' as const,
      occurredAt: row.occurredAt,
      origin: row.origin ?? 'unknown',
      protocol: row.protocol,
      registeredAt: row.registeredAt,
      registeredAtKey: row.registeredAtKey,
      requestedBy: buildActor(row.requestedByUserId, row.requestedByName),
      sequence: row.sequence,
      statusAfter: row.statusAfter,
      statusBefore: row.statusBefore,
      statusCode: row.statusCode,
    }))
  }

  private async selectStatusChangeRows(input: {
    readonly companyId: string
    readonly cursor: EventCursor | null
    readonly documentId: string
    readonly limit: number
  }): Promise<readonly MergedRow[]> {
    const filters = [
      eq(nfeDocumentStatusChanges.companyId, input.companyId),
      eq(nfeDocumentStatusChanges.documentId, input.documentId),
      ne(nfeDocumentStatusChanges.cause, 'event'),
    ]
    if (input.cursor !== null) {
      filters.push(
        sql`(${nfeDocumentStatusChanges.changedAt}, ${nfeDocumentStatusChanges.id}) < (${input.cursor.registeredAt}::timestamptz, ${input.cursor.id}::uuid)`,
      )
    }
    const rows = await this.database
      .select({
        actorName: statusActorProfile.name,
        actorUserId: nfeDocumentStatusChanges.actorUserId,
        changedAt: nfeDocumentStatusChanges.changedAt,
        changedAtKey: formatCursorTimestamp(nfeDocumentStatusChanges.changedAt),
        id: nfeDocumentStatusChanges.id,
        origin: nfeDocumentStatusChanges.origin,
        requestedByName: statusRequesterProfile.name,
        requestedByUserId: nfeDocumentStatusChanges.requestedByUserId,
        statusAfter: nfeDocumentStatusChanges.statusAfter,
        statusBefore: nfeDocumentStatusChanges.statusBefore,
      })
      .from(nfeDocumentStatusChanges)
      .leftJoin(
        statusActorMembership,
        and(
          eq(statusActorMembership.userId, nfeDocumentStatusChanges.actorUserId),
          eq(statusActorMembership.companyId, input.companyId),
          eq(statusActorMembership.status, 'active'),
        ),
      )
      .leftJoin(statusActorProfile, eq(statusActorProfile.userId, statusActorMembership.userId))
      .leftJoin(
        statusRequesterMembership,
        and(
          eq(statusRequesterMembership.userId, nfeDocumentStatusChanges.requestedByUserId),
          eq(statusRequesterMembership.companyId, input.companyId),
          eq(statusRequesterMembership.status, 'active'),
        ),
      )
      .leftJoin(
        statusRequesterProfile,
        eq(statusRequesterProfile.userId, statusRequesterMembership.userId),
      )
      .where(and(...filters))
      .orderBy(desc(nfeDocumentStatusChanges.changedAt), desc(nfeDocumentStatusChanges.id))
      .limit(input.limit + 1)

    return rows.map((row) => ({
      actor: buildActor(row.actorUserId, row.actorName),
      correctionText: null,
      eventType: null,
      id: row.id,
      kind: 'statusChange' as const,
      occurredAt: null,
      origin: row.origin ?? 'unknown',
      protocol: null,
      registeredAt: row.changedAt,
      registeredAtKey: row.changedAtKey,
      requestedBy: buildActor(row.requestedByUserId, row.requestedByName),
      sequence: null,
      statusAfter: row.statusAfter,
      statusBefore: row.statusBefore,
      statusCode: null,
    }))
  }
}

type EventCursor = {
  readonly id: string
  readonly registeredAt: string
}

function decodeCursor(value: string | null): EventCursor | null {
  if (value === null) return null
  const [registeredAt, id] = value.split('::')
  if (registeredAt === undefined || id === undefined) return null
  return { id, registeredAt }
}

/**
 * `null` só quando não havia ninguém gravado (`userId === null`). Com id gravado mas sem membership
 * ativa nesta empresa (nome não resolvido pelo `left join`), vira `{ removed: true }` — nunca o id
 * cru (D16, H13), e nunca confundido com "não havia ninguém".
 */
function buildActor(
  userId: string | null,
  name: string | null | undefined,
): NfeDocumentEventActor | null {
  if (userId === null) return null
  if (name === null || name === undefined) return { removed: true }
  return { id: userId, name }
}

/** Mescla dois ramos já ordenados desc por `(registeredAtKey, id)` — cada um trouxe `limit + 1`. */
function mergeDescending(
  left: readonly MergedRow[],
  right: readonly MergedRow[],
): readonly MergedRow[] {
  const merged: MergedRow[] = []
  let leftIndex = 0
  let rightIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const a = left[leftIndex]!
    const b = right[rightIndex]!
    if (isAfter(a, b)) {
      merged.push(a)
      leftIndex += 1
    } else {
      merged.push(b)
      rightIndex += 1
    }
  }
  while (leftIndex < left.length) {
    merged.push(left[leftIndex]!)
    leftIndex += 1
  }
  while (rightIndex < right.length) {
    merged.push(right[rightIndex]!)
    rightIndex += 1
  }
  return merged
}

function isAfter(a: MergedRow, b: MergedRow): boolean {
  if (a.registeredAtKey !== b.registeredAtKey) return a.registeredAtKey > b.registeredAtKey
  return a.id > b.id
}

function toEntry(row: MergedRow): NfeDocumentEventEntry {
  return {
    actor: row.actor,
    correctionText: row.correctionText,
    eventType: row.eventType,
    id: row.id,
    kind: row.kind,
    occurredAt: row.occurredAt === null ? null : row.occurredAt.toISOString(),
    origin: row.origin,
    protocol: row.protocol,
    registeredAt: row.registeredAt.toISOString(),
    requestedBy: row.requestedBy,
    sequence: row.sequence,
    statusAfter: row.statusAfter,
    statusBefore: row.statusBefore,
    statusCode: row.statusCode,
  }
}

/** Texto com microssegundos: o `Date` do JS os truncaria e o cursor pularia a entrada vizinha. */
function formatCursorTimestamp(column: AnyPgColumn): SQL<string> {
  return sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
}

function documentNotFound(): ApiError {
  return new ApiError({
    code: 'NFE_DOCUMENT_NOT_FOUND',
    message: 'NF-e document not found',
    status: 404,
  })
}

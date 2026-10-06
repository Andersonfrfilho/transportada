/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: o que os repositórios da chegada compartilham — a trava da chegada (sempre a
 * primeira, para escritas concorrentes nunca travarem em ordem diferente), a auditoria e a página.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, lt, or, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import { contractorReceivingProfiles } from '../../database/contractor-receiving-profile.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import {
  CARGO_ARRIVAL_WRITE_PERMISSION,
  type CargoArrivalStatus,
} from '../../shared/cargo-arrival.constant.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.js'
import type { Page } from '../application/cargo-arrival.types.js'
import type { ArrivalProfileRules } from '../domain/cargo-arrival-transition.policy.js'

export type Database = ReturnType<typeof createDrizzleProvider>['db']
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const AUDIT_ENTITY_TYPE = 'cargo-arrival'
const AUDIT_TARGET_TYPE = 'contractor'

export function buildArrivalFilters(params: {
  readonly arrivalId: string
  readonly companyId: string
}): SQL[] {
  return [eq(cargoArrivals.companyId, params.companyId), eq(cargoArrivals.id, params.arrivalId)]
}

/** `no key update`: serializa as escritas na chegada sem bloquear quem só cria FK para ela. */
export async function lockArrival(
  transaction: Transaction,
  params: { readonly arrivalId: string; readonly companyId: string },
): Promise<{ readonly contractorId: string; readonly status: CargoArrivalStatus } | undefined> {
  const [arrival] = await transaction
    .select({ contractorId: cargoArrivals.contractorId, status: cargoArrivals.status })
    .from(cargoArrivals)
    .where(and(...buildArrivalFilters(params)))
    .for('no key update')
  return arrival
}

/** O perfil lido dentro da transação do registro: a chegada copia o que vale neste instante. */
export async function findArrivalProfileRules(
  transaction: Transaction,
  params: { readonly companyId: string; readonly contractorId: string },
): Promise<ArrivalProfileRules | undefined> {
  const [profile] = await transaction
    .select({
      deliveryDeadlineBusinessDays: contractorReceivingProfiles.deliveryDeadlineBusinessDays,
      isEnabled: contractorReceivingProfiles.isEnabled,
      separationWindowHours: contractorReceivingProfiles.separationWindowHours,
    })
    .from(contractorReceivingProfiles)
    .where(
      and(
        eq(contractorReceivingProfiles.companyId, params.companyId),
        eq(contractorReceivingProfiles.contractorId, params.contractorId),
      ),
    )
  return profile
}

export type InsertArrivalAuditParams = {
  readonly action: string
  readonly actorUserId: string
  readonly arrivalId: string
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  readonly metadata: Readonly<Record<string, unknown>>
}

export async function insertArrivalAudit(
  transaction: Transaction,
  params: InsertArrivalAuditParams,
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: params.action,
    actorUserId: params.actorUserId,
    companyId: params.companyId,
    correlationId: params.correlationId,
    entityId: params.arrivalId,
    entityType: AUDIT_ENTITY_TYPE,
    metadata: params.metadata,
    permission: CARGO_ARRIVAL_WRITE_PERMISSION,
    targetId: params.contractorId,
    targetType: AUDIT_TARGET_TYPE,
  })
}

/** Keyset decrescente `(data, id)`: o cursor `<iso>::<uuid>` já foi validado na rota. */
export function buildDescendingCursorFilter(params: {
  readonly cursor: string | null
  readonly dateColumn: AnyPgColumn
  readonly idColumn: AnyPgColumn
}): SQL | undefined {
  const cursor = decodeKeysetCursor(params.cursor)
  if (cursor === null) return undefined
  return or(
    lt(params.dateColumn, cursor.createdAt),
    and(eq(params.dateColumn, cursor.createdAt), lt(params.idColumn, cursor.id)),
  )
}

export function toPage<TRow extends { readonly id: string }, TItem>(params: {
  readonly dateOf: (row: TRow) => Date
  readonly limit: number
  readonly map: (row: TRow) => TItem
  readonly rows: readonly TRow[]
}): Page<TItem> {
  const visible = params.rows.slice(0, params.limit)
  const last = visible.at(-1)
  const hasMore = params.rows.length > params.limit
  return {
    items: visible.map(params.map),
    nextCursor:
      hasMore && last !== undefined
        ? encodeKeysetCursor({ createdAt: params.dateOf(last), id: last.id })
        : null,
  }
}

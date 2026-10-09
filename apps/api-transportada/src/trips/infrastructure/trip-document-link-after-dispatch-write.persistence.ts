/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257: as escritas das notas acrescentadas a uma viagem na rua — o vínculo já `loaded`, os eventos
 * da nota, o histórico e a auditoria. Rodam na transação e **sob o lock** da viagem, em sequência.
 */
import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'

import { auditLogs } from '../../database/database.schema.js'
import { cteBatchItems } from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments } from '../../database/cte-issuance.schema.js'
import { mdfeManifests } from '../../database/mdfe.schema.js'
import {
  tripDocumentEvents,
  tripDocumentLinkEvents,
  tripDocuments,
} from '../../database/trip.schema.js'
import type {
  LinkTripDocumentsAfterDispatchParams,
  LinkedAfterDispatchDocument,
} from '../application/trip-document-link-after-dispatch.types.js'
import { TRIP_DOCUMENT_LINK_AFTER_DISPATCH_AUDIT_ACTION } from '../domain/trip-document-link-after-dispatch.constant.js'
import { TRIP_AUDIT_ENTITY_TYPE } from '../domain/trip-crew-transfer.constant.js'
import { TRIP_REPORT_ON_BEHALF_PERMISSION } from '../domain/trip-permission.constant.js'
import type { TripTransaction } from './trip-queryable.type.js'

const AUTHORIZED_STATUS = 'authorized'
const LOADED_STATUS = 'loaded' as const

type CompanyScope = { readonly companyId: string }

/** `D4`: sem saída `separate`/`load` na rua, a nota nasce no caminhão. Conflito = outra escrita levou a nota. */
export async function insertLoadedLinks(
  transaction: TripTransaction,
  { companyId, nfeDocumentIds, tripId }: LinkTripDocumentsAfterDispatchParams,
): Promise<readonly { readonly id: string; readonly nfeDocumentId: string }[]> {
  const created = await transaction
    .insert(tripDocuments)
    .values(
      nfeDocumentIds.map((nfeDocumentId) => ({
        companyId,
        freightCalculationId: null,
        loadedAt: sql`now()`,
        nfeDocumentId,
        separatedAt: sql`now()`,
        separationStatus: LOADED_STATUS,
        tripId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: tripDocuments.id, nfeDocumentId: tripDocuments.nfeDocumentId })

  return created.flatMap((row) =>
    row.nfeDocumentId === null ? [] : [{ id: row.id, nfeDocumentId: row.nfeDocumentId }],
  )
}

export async function recordLoadedEvents(
  transaction: TripTransaction,
  {
    params,
    tripDocumentIds,
  }: {
    readonly params: LinkTripDocumentsAfterDispatchParams
    readonly tripDocumentIds: readonly string[]
  },
): Promise<void> {
  await transaction.insert(tripDocumentEvents).values(
    tripDocumentIds.map((tripDocumentId) => ({
      actorUserId: params.actorUserId,
      channel: params.channel,
      companyId: params.companyId,
      fromStatus: null,
      note: params.reason,
      toStatus: LOADED_STATUS,
      tripDocumentId,
    })),
  )
}

export async function findLiveLinkedIds(
  transaction: TripTransaction,
  { companyId, nfeDocumentIds }: CompanyScope & { readonly nfeDocumentIds: readonly string[] },
): Promise<ReadonlySet<string>> {
  const live = await transaction
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, companyId),
        inArray(tripDocuments.nfeDocumentId, [...nfeDocumentIds]),
        isNull(tripDocuments.releasedAt),
      ),
    )
  return new Set(live.flatMap((row) => (row.nfeDocumentId === null ? [] : [row.nfeDocumentId])))
}

/** D7: MDF-e `authorized` já foi assinado sem estas notas — o aviso, não a recusa. */
export async function hasAuthorizedManifest(
  transaction: TripTransaction,
  { companyId, tripId }: CompanyScope & { readonly tripId: string },
): Promise<boolean> {
  const [manifest] = await transaction
    .select({ id: mdfeManifests.id })
    .from(mdfeManifests)
    .where(
      and(
        eq(mdfeManifests.companyId, companyId),
        eq(mdfeManifests.tripId, tripId),
        eq(mdfeManifests.status, AUTHORIZED_STATUS),
      ),
    )
    .limit(1)
  return manifest !== undefined
}

/** Quantas das notas acrescentadas ainda não têm CT-e autorizado — nota solta recém-chegada é o caso comum. */
export async function countDocumentsWithoutCte(
  transaction: TripTransaction,
  { companyId, nfeDocumentIds }: CompanyScope & { readonly nfeDocumentIds: readonly string[] },
): Promise<number> {
  if (nfeDocumentIds.length === 0) return 0
  const authorized = await transaction
    .selectDistinct({ nfeDocumentId: cteBatchItems.nfeDocumentId })
    .from(cteBatchItems)
    .innerJoin(
      cteFiscalDocuments,
      and(
        eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
        eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
      ),
    )
    .where(
      and(
        eq(cteBatchItems.companyId, companyId),
        inArray(cteBatchItems.nfeDocumentId, [...nfeDocumentIds]),
        eq(cteFiscalDocuments.status, AUTHORIZED_STATUS),
        isNotNull(cteFiscalDocuments.authorizedAt),
      ),
    )
  return nfeDocumentIds.length - authorized.length
}

export type RecordLinkEventParams = {
  readonly createdStopIds: readonly string[]
  readonly documentsWithoutCte: number
  readonly linked: readonly LinkedAfterDispatchDocument[]
  readonly mdfeDocumentDivergence: boolean
  readonly params: LinkTripDocumentsAfterDispatchParams
}

export async function recordLinkEvent(
  transaction: TripTransaction,
  {
    createdStopIds,
    documentsWithoutCte,
    linked,
    mdfeDocumentDivergence,
    params,
  }: RecordLinkEventParams,
): Promise<string> {
  const [event] = await transaction
    .insert(tripDocumentLinkEvents)
    .values({
      actorUserId: params.actorUserId,
      channel: params.channel,
      companyId: params.companyId,
      /** `now()` é o início da transação: dois lotes serializados pelo lock sairiam fora de ordem. */
      createdAt: sql`clock_timestamp()`,
      createdStopIds: [...createdStopIds],
      documentsWithoutCte,
      mdfeDocumentDivergence,
      nfeDocumentIds: linked.map((document) => document.nfeDocumentId),
      reason: params.reason,
      tripId: params.tripId,
    })
    .returning({ id: tripDocumentLinkEvents.id })
  if (event === undefined) throw new Error('TRIP_DOCUMENT_LINK_EVENT_NOT_RECORDED')
  return event.id
}

/** `security.md` §10: o motivo e os dados da nota são negócio e nunca entram em `metadata`; só ids opacos. */
export async function recordLinkAudit(
  transaction: TripTransaction,
  {
    eventId,
    linkedCount,
    mdfeDocumentDivergence,
    params,
  }: {
    readonly eventId: string
    readonly linkedCount: number
    readonly mdfeDocumentDivergence: boolean
    readonly params: LinkTripDocumentsAfterDispatchParams
  },
): Promise<void> {
  await transaction.insert(auditLogs).values({
    action: TRIP_DOCUMENT_LINK_AFTER_DISPATCH_AUDIT_ACTION,
    actorUserId: params.actorUserId,
    companyId: params.companyId,
    correlationId: params.correlationId,
    entityId: params.tripId,
    entityType: TRIP_AUDIT_ENTITY_TYPE,
    metadata: {
      ipAddress: params.ipAddress,
      linkEventId: eventId,
      linkedCount,
      mdfeDocumentDivergence,
    },
    permission: TRIP_REPORT_ON_BEHALF_PERMISSION,
    targetId: params.tripId,
    targetType: TRIP_AUDIT_ENTITY_TYPE,
  })
}

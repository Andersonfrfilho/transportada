/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 167 T301-T304: escritor único de `trip_document_occurrence_corrections` e das três colunas
 * de cancelamento. `DrizzleOccurrenceCorrectionUnitOfWork.execute` é a única porta de entrada — a
 * leitura da tratativa (`hasOpenCase`) e a escrita acontecem sempre dentro da mesma
 * `database.transaction`, nunca em duas chamadas separadas.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { alias } from 'drizzle-orm/pg-core'
import { and, asc, eq } from 'drizzle-orm'

import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import {
  companyOccurrenceTypes,
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrenceCorrections,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripDocuments,
  tripOccurrenceCases,
} from '../../database/trip.schema.js'
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type { OccurrenceItemQuantity } from '../domain/occurrence-item-quantity.policy.js'
import { resolveOccurrenceProductCodes } from '../domain/occurrence-scope.policy.js'
import { findOccurrenceType, listDocumentProducts } from './delivery-proof-read.support.js'
import {
  insertOccurrenceProductRows,
  listOccurrenceProducts,
} from './drizzle-occurrence-product.repository.js'
import type {
  CorrectedOccurrenceView,
  LockedOccurrenceRow,
  OccurrenceCorrectionTransactionPort,
  OccurrenceCorrectionUnitOfWork,
} from '../application/occurrence-correction.port.js'
import {
  listOccurrenceCancellationsByIds,
  listOccurrenceCorrectionsByIds,
} from './occurrence-correction-read.query.js'
import type { TripQueryable } from './trip-queryable.type.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const occurrenceActorMembership = alias(
  userCompanyMemberships,
  'trip_occurrence_correction_actor_membership',
)
const occurrenceActorProfile = alias(
  identityUserProfiles,
  'trip_occurrence_correction_actor_profile',
)
const occurrenceOnBehalfDriver = alias(fleetDrivers, 'trip_occurrence_correction_on_behalf_driver')

export class DrizzleOccurrenceCorrectionUnitOfWork implements OccurrenceCorrectionUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>(
    operation: (transaction: OccurrenceCorrectionTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createOccurrenceCorrectionTransactionPort(transaction)),
    )
  }
}

function createOccurrenceCorrectionTransactionPort(
  queryable: TripQueryable,
): OccurrenceCorrectionTransactionPort {
  return {
    findOccurrenceType: (input) => findOccurrenceType(queryable, input),
    hasOpenCase: (input) => hasOpenOccurrenceCase(queryable, input),
    insertCorrection: (input) => insertOccurrenceCorrection(queryable, input),
    listCurrentItems: (input) => listCurrentOccurrenceItems(queryable, input),
    listDocumentProducts: (input) => listDocumentProducts(queryable, input),
    lockOccurrence: (input) => lockOccurrenceForWrite(queryable, input),
    readOccurrenceView: (input) => readOccurrenceView(queryable, input),
    replaceItems: (input) => replaceOccurrenceItems(queryable, input),
    writeCancellation: (input) => writeOccurrenceCancellation(queryable, input),
  }
}

async function lockOccurrenceForWrite(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<(LockedOccurrenceRow & { readonly productCode: string }) | null> {
  /**
   * ⚠️ **`FOR NO KEY UPDATE` só na linha da ocorrência**, nunca em junção — travar duas tabelas na
   * mesma cláusula é o padrão que o CLAUDE.md da app recusa (contenção contra a FK composta que
   * outra escrita pega com `FOR KEY SHARE`). O `tripId` vem de uma segunda leitura, sem lock.
   */
  const [row] = await queryable
    .select({
      cancelledAt: tripDocumentOccurrences.cancelledAt,
      occurrenceTypeId: tripDocumentOccurrences.occurrenceTypeId,
      productCode: tripDocumentOccurrences.productCode,
      tripDocumentId: tripDocumentOccurrences.tripDocumentId,
    })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .for('no key update')
    .limit(1)
  if (row === undefined) return null

  const [document] = await queryable
    .select({ tripId: tripDocuments.tripId })
    .from(tripDocuments)
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, row.tripDocumentId)),
    )
    .limit(1)
  if (document === undefined) return null

  return {
    cancelledAt: row.cancelledAt === null ? null : row.cancelledAt.toISOString(),
    occurrenceTypeId: row.occurrenceTypeId,
    productCode: row.productCode,
    tripDocumentId: row.tripDocumentId,
    tripId: document.tripId,
  }
}

async function hasOpenOccurrenceCase(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<boolean> {
  const [row] = await queryable
    .select({ id: tripOccurrenceCases.id })
    .from(tripOccurrenceCases)
    .where(
      and(
        eq(tripOccurrenceCases.companyId, input.companyId),
        eq(tripOccurrenceCases.occurrenceId, input.occurrenceId),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** O conjunto de hoje: da tabela nova, ou o fallback da coluna antiga (ocorrência sem linha lá). */
async function listCurrentOccurrenceItems(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<readonly OccurrenceItemQuantity[]> {
  const [occurrence] = await queryable
    .select({ productCode: tripDocumentOccurrences.productCode })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .limit(1)

  const productsByOccurrence = await listOccurrenceProducts(queryable, {
    companyId: input.companyId,
    occurrenceIds: [input.occurrenceId],
  })
  const storedProducts = productsByOccurrence.get(input.occurrenceId) ?? []
  if (storedProducts.length > 0) {
    return storedProducts.map((product) => ({
      code: product.code,
      quantity: product.quantity,
      unit: product.unit,
    }))
  }

  const productCodes = resolveOccurrenceProductCodes({
    productCode: occurrence?.productCode ?? '',
    productCodes: [],
  })
  return productCodes.map((code) => ({ code, quantity: null, unit: null }))
}

async function replaceOccurrenceItems(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly items: readonly OccurrenceItemQuantity[]
    readonly occurrenceId: string
    readonly productCode: string
  },
): Promise<void> {
  await queryable
    .delete(tripDocumentOccurrenceProducts)
    .where(
      and(
        eq(tripDocumentOccurrenceProducts.companyId, input.companyId),
        eq(tripDocumentOccurrenceProducts.occurrenceId, input.occurrenceId),
      ),
    )
  await insertOccurrenceProductRows(queryable, {
    companyId: input.companyId,
    items: input.items,
    occurrenceId: input.occurrenceId,
  })
  await queryable
    .update(tripDocumentOccurrences)
    .set({ productCode: input.productCode })
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
}

async function insertOccurrenceCorrection(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly correctedByUserId: string
    readonly occurrenceId: string
    readonly previousItems: readonly OccurrenceItemQuantity[]
  },
): Promise<void> {
  await queryable.insert(tripDocumentOccurrenceCorrections).values({
    companyId: input.companyId,
    correctedByUserId: input.correctedByUserId,
    occurrenceId: input.occurrenceId,
    previousItems: input.previousItems,
  })
}

async function writeOccurrenceCancellation(
  queryable: TripQueryable,
  input: {
    readonly cancelledByUserId: string
    readonly companyId: string
    readonly occurrenceId: string
    readonly reason: string
  },
): Promise<void> {
  await queryable
    .update(tripDocumentOccurrences)
    .set({
      cancellationReason: input.reason,
      cancelledAt: new Date(),
      cancelledByUserId: input.cancelledByUserId,
    })
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
}

export async function readOccurrenceView(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceId: string },
): Promise<CorrectedOccurrenceView> {
  const [row] = await queryable
    .select({
      actorName: occurrenceActorProfile.name,
      channel: tripDocumentOccurrences.channel,
      createdAt: tripDocumentOccurrences.createdAt,
      note: tripDocumentOccurrences.note,
      occurrenceTypeId: tripDocumentOccurrences.occurrenceTypeId,
      onBehalfOfDriverName: occurrenceOnBehalfDriver.name,
      productCode: tripDocumentOccurrences.productCode,
      stage: tripDocumentOccurrences.stage,
      typeName: companyOccurrenceTypes.name,
    })
    .from(tripDocumentOccurrences)
    .innerJoin(
      companyOccurrenceTypes,
      and(
        eq(companyOccurrenceTypes.companyId, tripDocumentOccurrences.companyId),
        eq(companyOccurrenceTypes.id, tripDocumentOccurrences.occurrenceTypeId),
      ),
    )
    .leftJoin(
      occurrenceActorMembership,
      and(
        eq(occurrenceActorMembership.companyId, tripDocumentOccurrences.companyId),
        eq(occurrenceActorMembership.userId, tripDocumentOccurrences.actorUserId),
        eq(occurrenceActorMembership.status, ACTIVE_MEMBERSHIP_STATUS),
      ),
    )
    .leftJoin(
      occurrenceActorProfile,
      eq(occurrenceActorProfile.userId, occurrenceActorMembership.userId),
    )
    .leftJoin(
      occurrenceOnBehalfDriver,
      and(
        eq(occurrenceOnBehalfDriver.companyId, tripDocumentOccurrences.companyId),
        eq(occurrenceOnBehalfDriver.id, tripDocumentOccurrences.onBehalfOfDriverId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.id, input.occurrenceId),
      ),
    )
    .limit(1)
  if (row === undefined) throw new Error('OCCURRENCE_NOT_FOUND_AFTER_WRITE')

  const items = await listCurrentOccurrenceItems(queryable, input)
  const productCodes = items.map((item) => item.code)

  const attachmentRows = await queryable
    .select({
      id: tripDocumentOccurrenceAttachments.id,
      position: tripDocumentOccurrenceAttachments.position,
    })
    .from(tripDocumentOccurrenceAttachments)
    .where(
      and(
        eq(tripDocumentOccurrenceAttachments.companyId, input.companyId),
        eq(tripDocumentOccurrenceAttachments.occurrenceId, input.occurrenceId),
      ),
    )
    .orderBy(asc(tripDocumentOccurrenceAttachments.position))

  const occurrenceIds = [input.occurrenceId]
  const [correctionsByOccurrence, cancellations] = await Promise.all([
    listOccurrenceCorrectionsByIds(queryable, { companyId: input.companyId, occurrenceIds }),
    listOccurrenceCancellationsByIds(queryable, { companyId: input.companyId, occurrenceIds }),
  ])

  return {
    actorName: row.actorName,
    attachments: attachmentRows,
    cancellation: cancellations.get(input.occurrenceId) ?? null,
    channel: row.channel,
    corrections: correctionsByOccurrence.get(input.occurrenceId) ?? [],
    createdAt: row.createdAt.toISOString(),
    id: input.occurrenceId,
    note: row.note,
    occurrenceTypeId: row.occurrenceTypeId,
    onBehalfOfDriverName: row.onBehalfOfDriverName,
    productCode: row.productCode,
    productCodes,
    products: items,
    stage: row.stage,
    typeName: row.typeName,
  }
}

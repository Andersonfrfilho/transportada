/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura do comprovante, escopada pela empresa **em cada junção** — não só na tabela de cima.
 * O comprovante pendura em `trip_stop_events`, que pendura em `trip_stops`, que pendura na viagem;
 * uma junção sem `company_id` em qualquer degrau é o caminho pelo qual o canhoto de uma empresa
 * aparece na tela de outra.
 */
import { and, asc, eq } from 'drizzle-orm'

import { nfeProducts } from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import { tripDeliveryProofs, tripDocuments, tripStopEvents } from '../../database/trip.schema.js'
import type { DeliveryProofRecord } from '../application/read-delivery-proof.use-case.js'
import type { TripDocumentProduct } from '../application/read-trip-document-products.use-case.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function listDeliveryProofs(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  },
): Promise<readonly DeliveryProofRecord[]> {
  const rows = await queryable
    .select({
      bucket: storedObjects.bucket,
      createdAt: tripDeliveryProofs.createdAt,
      id: tripDeliveryProofs.id,
      kind: tripDeliveryProofs.kind,
      mimeType: storedObjects.mimeType,
      objectKey: storedObjects.objectKey,
      receiverName: tripDeliveryProofs.receiverName,
    })
    .from(tripDeliveryProofs)
    .innerJoin(
      tripStopEvents,
      and(
        eq(tripStopEvents.companyId, tripDeliveryProofs.companyId),
        eq(tripStopEvents.id, tripDeliveryProofs.stopEventId),
      ),
    )
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDeliveryProofs.companyId),
        eq(tripDocuments.id, tripStopEvents.tripDocumentId),
      ),
    )
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, tripDeliveryProofs.companyId),
        eq(storedObjects.id, tripDeliveryProofs.objectId),
      ),
    )
    .where(
      and(
        eq(tripDeliveryProofs.companyId, input.companyId),
        eq(tripStopEvents.tripDocumentId, input.documentId),
        // ⚠️ A viagem entra no `where`, não só na assinatura: sem ela, uma nota de outra viagem da
        // mesma empresa devolveria o comprovante dela por um id que o chamador já tinha em mãos.
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .orderBy(asc(tripDeliveryProofs.createdAt))

  return rows.map((row) => ({
    bucket: row.bucket,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    kind: row.kind,
    mimeType: row.mimeType,
    objectKey: row.objectKey,
    receiverName: row.receiverName,
  }))
}

/**
 * Os itens da nota vinculada à viagem. A junção com `trip_documents` **não é decoração**: sem ela,
 * qualquer nota da empresa devolveria seus produtos por um identificador de vínculo de outra
 * viagem — e o escopo de viagem é justamente o que a rota promete.
 */
export async function listDocumentProducts(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  },
): Promise<readonly TripDocumentProduct[]> {
  const rows = await queryable
    .select({
      code: nfeProducts.code,
      commercialUnit: nfeProducts.commercialUnit,
      description: nfeProducts.description,
      ordinal: nfeProducts.ordinal,
      quantity: nfeProducts.quantity,
      totalValue: nfeProducts.totalValue,
      unitValue: nfeProducts.unitValue,
    })
    .from(tripDocuments)
    .innerJoin(
      nfeProducts,
      and(
        eq(nfeProducts.companyId, tripDocuments.companyId),
        eq(nfeProducts.documentId, tripDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .orderBy(asc(nfeProducts.ordinal))

  return rows.map((row) => ({ ...row, ordinal: Number(row.ordinal) }))
}

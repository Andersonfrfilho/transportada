/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { type SQL, and, desc, eq, inArray, isNull, like, ne, or, sql, sum } from 'drizzle-orm'

import { companyCargoSettings } from '../../database/company-cargo-settings.schema.js'
import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import { nfseServiceInvoiceDocuments } from '../../database/nfse.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { resolveCargoWeight } from '../../nfe-documents/domain/cargo-weight.policy.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type {
  CteBatchNameQuery,
  CteBatchPreviewDocument,
  CteBatchPreviewLink,
  CteBatchPreviewNfseLink,
  CteBatchPreviewQuery,
  TripDocumentLink,
} from '../application/cte-batch-preview.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type SelectionQueryable = Database | Transaction

type PartyLocation = {
  readonly city: string | null
  readonly state: string | null
  readonly taxId: string | null
}

type DocumentParties = {
  readonly recipient: PartyLocation
  readonly sender: PartyLocation
}

/** Postgres usa `\` como escape padrão do LIKE, então o prefixo só precisa neutralizar os coringas. */
const LIKE_WILDCARDS = /[%_\\]/g

function escapeLike(value: string): string {
  return value.replace(LIKE_WILDCARDS, '\\$&')
}

const EMPTY_PARTY: PartyLocation = { city: null, state: null, taxId: null }
const EMPTY_PARTIES: DocumentParties = { recipient: EMPTY_PARTY, sender: EMPTY_PARTY }
const SENDER_ROLE = 'emitter'
const RECIPIENT_ROLE = 'recipient'
const CANCELLED_STATUS = 'cancelled'
const COMPLETE_VARIANT = 'complete'

export async function findBatchNamesByPrefix(
  queryable: SelectionQueryable,
  { companyId, prefix }: CteBatchNameQuery,
): Promise<readonly string[]> {
  const rows = await queryable
    .select({ name: cteBatches.name })
    .from(cteBatches)
    .where(
      and(eq(cteBatches.companyId, companyId), like(cteBatches.name, `${escapeLike(prefix)}%`)),
    )

  return rows.map((row) => row.name)
}

export async function findActiveBatchLinks(
  queryable: SelectionQueryable,
  { companyId, documentIds }: CteBatchPreviewQuery,
): Promise<readonly CteBatchPreviewLink[]> {
  if (documentIds.length === 0) return []

  return queryable
    .selectDistinctOn([cteBatchItemDocuments.nfeDocumentId], {
      batchId: cteBatchItemDocuments.batchId,
      documentId: cteBatchItemDocuments.nfeDocumentId,
    })
    .from(cteBatchItemDocuments)
    .innerJoin(
      cteBatches,
      and(
        eq(cteBatches.companyId, cteBatchItemDocuments.companyId),
        eq(cteBatches.id, cteBatchItemDocuments.batchId),
      ),
    )
    .where(
      and(
        eq(cteBatchItemDocuments.companyId, companyId),
        inArray(cteBatchItemDocuments.nfeDocumentId, [...documentIds]),
        ne(cteBatches.status, CANCELLED_STATUS),
      ),
    )
    .orderBy(cteBatchItemDocuments.nfeDocumentId)
}

/**
 * Spec 065 D4b: **fatura-se o que saiu.** Quem monta o lote precisa saber em que viagem a nota
 * rodou sem abrir a tela de viagem para conferir uma por uma — e isso vale para a nota de CT-e e
 * para a urbana, sem distinção.
 *
 * É **sinal, não bloqueio**: nota vinculada a viagem *deve* entrar no lote, porque é justamente a
 * carga que rodou. Nenhum bloqueio lê este vínculo, e há contrato provando isso.
 *
 * A nota é alcançada pelos dois caminhos que `trip_documents` permite — o vínculo direto e o
 * cálculo de frete. Quando ela rodou em mais de uma viagem (devolvida e reenviada), vence a mais
 * recente: é a que responde "onde ela está agora".
 */
export async function findTripLinks(
  queryable: SelectionQueryable,
  { companyId, documentIds }: CteBatchPreviewQuery,
): Promise<readonly TripDocumentLink[]> {
  if (documentIds.length === 0) return []

  const documentId = sql<string>`coalesce(${tripDocuments.nfeDocumentId}, ${freightCalculations.nfeDocumentId})`

  return queryable
    .selectDistinctOn([documentId], {
      documentId: documentId.as('trip_link_document_id'),
      tripId: tripDocuments.tripId,
      tripStatus: trips.status,
    })
    .from(tripDocuments)
    .leftJoin(
      freightCalculations,
      and(
        eq(freightCalculations.companyId, tripDocuments.companyId),
        eq(freightCalculations.id, tripDocuments.freightCalculationId),
      ),
    )
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .where(
      and(
        eq(tripDocuments.companyId, companyId),
        or(
          inArray(tripDocuments.nfeDocumentId, [...documentIds]),
          inArray(freightCalculations.nfeDocumentId, [...documentIds]),
        ),
      ),
    )
    .orderBy(documentId, desc(tripDocuments.createdAt))
}

/**
 * O vínculo com a nota de serviço é liberado marcando `cancelled_at` na mesma transação que cancela
 * a nota — é esse recorte que o índice parcial único guarda, e o mesmo que a listagem de notas lê.
 */
export function buildActiveNfseLinkFilters({
  companyId,
  documentIds,
}: CteBatchPreviewQuery): readonly SQL[] {
  return [
    eq(nfseServiceInvoiceDocuments.companyId, companyId),
    inArray(nfseServiceInvoiceDocuments.nfeDocumentId, [...documentIds]),
    isNull(nfseServiceInvoiceDocuments.cancelledAt),
  ] as const as readonly SQL[]
}

export async function findActiveNfseLinks(
  queryable: SelectionQueryable,
  query: CteBatchPreviewQuery,
): Promise<readonly CteBatchPreviewNfseLink[]> {
  if (query.documentIds.length === 0) return []

  return queryable
    .selectDistinctOn([nfseServiceInvoiceDocuments.nfeDocumentId], {
      documentId: nfseServiceInvoiceDocuments.nfeDocumentId,
      invoiceId: nfseServiceInvoiceDocuments.invoiceId,
    })
    .from(nfseServiceInvoiceDocuments)
    .where(and(...buildActiveNfseLinkFilters(query)))
    .orderBy(nfseServiceInvoiceDocuments.nfeDocumentId)
}

export async function findSelectionDocuments(
  queryable: SelectionQueryable,
  { companyId, documentIds }: CteBatchPreviewQuery,
): Promise<readonly CteBatchPreviewDocument[]> {
  if (documentIds.length === 0) return []
  const [records, parties, volumeTotals, defaultWeightPerVolume] = await Promise.all([
    queryable
      .select({
        accessKey: nfeDocuments.accessKey,
        companyId: nfeDocuments.companyId,
        id: nfeDocuments.id,
        issuedAt: nfeDocuments.issuedAt,
        number: nfeDocuments.number,
        series: nfeDocuments.series,
        status: nfeDocuments.status,
        totalValue: nfeDocuments.totalValue,
      })
      .from(nfeDocuments)
      .where(
        and(eq(nfeDocuments.companyId, companyId), inArray(nfeDocuments.id, [...documentIds])),
      ),
    loadParties(queryable, companyId, documentIds),
    loadVolumeTotals(queryable, companyId, documentIds),
    loadDefaultVolumeWeight(queryable, companyId),
  ])

  return records.map((record) => {
    const { recipient, sender } = parties.get(record.id) ?? EMPTY_PARTIES
    const totals = volumeTotals.get(record.id)
    const cargoWeight = resolveCargoWeight({
      defaultWeightPerVolume,
      volumeGrossWeight: totals?.grossWeight ?? null,
      volumeQuantity: totals?.quantity ?? null,
    })

    return {
      accessKey: record.accessKey,
      companyId: record.companyId,
      grossWeight: cargoWeight?.grossWeight ?? null,
      id: record.id,
      issuedAt: record.issuedAt.toISOString(),
      number: record.number,
      recipientCity: recipient.city,
      recipientState: recipient.state,
      recipientTaxId: recipient.taxId,
      senderCity: sender.city,
      senderState: sender.state,
      senderTaxId: sender.taxId,
      series: record.series,
      status: record.status,
      totalAmount: record.totalValue,
      variant: COMPLETE_VARIANT,
    }
  })
}

type VolumeTotals = {
  readonly grossWeight: string | null
  readonly quantity: string | null
}

async function loadVolumeTotals(
  queryable: SelectionQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, VolumeTotals>> {
  const rows = await queryable
    .select({
      documentId: nfeVolumes.documentId,
      grossWeight: sum(nfeVolumes.grossWeight),
      quantity: sum(nfeVolumes.quantity),
    })
    .from(nfeVolumes)
    .where(
      and(eq(nfeVolumes.companyId, companyId), inArray(nfeVolumes.documentId, [...documentIds])),
    )
    .groupBy(nfeVolumes.documentId)

  return new Map(
    rows.map((row) => [row.documentId, { grossWeight: row.grossWeight, quantity: row.quantity }]),
  )
}

/** Uma consulta por seleção, não por nota: o padrão é da empresa, e a empresa é uma só aqui. */
async function loadDefaultVolumeWeight(
  queryable: SelectionQueryable,
  companyId: string,
): Promise<string | null> {
  const [row] = await queryable
    .select({ defaultVolumeWeight: companyCargoSettings.defaultVolumeWeight })
    .from(companyCargoSettings)
    .where(eq(companyCargoSettings.companyId, companyId))
    .limit(1)

  return row?.defaultVolumeWeight ?? null
}

async function loadParties(
  queryable: SelectionQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, DocumentParties>> {
  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      documentId: nfeParticipants.documentId,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
      taxId: nfeParticipants.taxId,
    })
    .from(nfeParticipants)
    .leftJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(nfeParticipants.companyId, companyId),
        inArray(nfeParticipants.documentId, [...documentIds]),
      ),
    )

  const parties = new Map<string, DocumentParties>()
  for (const row of rows) {
    if (row.role !== SENDER_ROLE && row.role !== RECIPIENT_ROLE) continue
    const current = parties.get(row.documentId) ?? EMPTY_PARTIES
    const party: PartyLocation = { city: row.city, state: row.state, taxId: row.taxId }
    parties.set(
      row.documentId,
      row.role === SENDER_ROLE ? { ...current, sender: party } : { ...current, recipient: party },
    )
  }

  return parties
}

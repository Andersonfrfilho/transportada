/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura do comprovante, escopada pela empresa **em cada junção** — não só na tabela de cima.
 * O comprovante pendura em `trip_stop_events`, que pendura em `trip_stops`, que pendura na viagem;
 * uma junção sem `company_id` em qualquer degrau é o caminho pelo qual o canhoto de uma empresa
 * aparece na tela de outra.
 */
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeProducts,
} from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  companyOccurrenceTypes,
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  tripStops,
  trips,
} from '../../database/trip.schema.js'
import type { DeliveryProofRecord } from '../application/read-delivery-proof.use-case.js'
import type { TripDocumentProduct } from '../application/read-trip-document-products.use-case.js'
import type {
  OccurrenceTypeRecord,
  TripOccurrence,
} from '../application/register-trip-occurrence.use-case.js'
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'
import type { TripOccurrenceType } from '../../shared/trip-occurrence.constant.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { resolveDeliveryContact } from '../domain/delivery-contact.policy.js'
import type { DeliveryContact } from '../domain/delivery-contact.policy.js'
import { ACTIVE_TRIP_STATUSES } from './drizzle-delivery-proof.repository.js'
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

export async function listTripOccurrences(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  },
): Promise<readonly TripOccurrence[]> {
  const rows = await queryable
    .select({
      createdAt: tripDocumentOccurrences.createdAt,
      id: tripDocumentOccurrences.id,
      note: tripDocumentOccurrences.note,
      productCode: tripDocumentOccurrences.productCode,
      occurrenceTypeId: tripDocumentOccurrences.occurrenceTypeId,
      stage: tripDocumentOccurrences.stage,
      /** Spec 079: o nome que a empresa deu ao tipo — é ele que a tela imprime. */
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
    .innerJoin(
      tripDocuments,
      and(
        eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
        eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
      ),
    )
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, input.companyId),
        eq(tripDocumentOccurrences.tripDocumentId, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .orderBy(asc(tripDocumentOccurrences.createdAt))

  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))
}

/**
 * A escrita confere a nota **pela própria consulta**: o `insert ... select` só produz linha quando
 * a nota é desta viagem nesta empresa. Ler antes e escrever depois abriria janela entre as duas —
 * e a nota pode ser desvinculada no meio.
 */
export async function saveTripOccurrence(
  queryable: TripQueryable,
  input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly productCode: string
    readonly occurrenceTypeId: string
    readonly stage: TripOccurrence['stage']
    readonly tripId: string
    readonly typeName: string
  },
): Promise<null | TripOccurrence> {
  const [document] = await queryable
    .select({ id: tripDocuments.id })
    .from(tripDocuments)
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .limit(1)
  if (document === undefined) return null

  const [saved] = await queryable
    .insert(tripDocumentOccurrences)
    .values({
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      note: input.note,
      occurrenceTypeId: input.occurrenceTypeId,
      productCode: input.productCode,
      stage: input.stage,
      tripDocumentId: input.documentId,
    })
    .returning()
  if (saved === undefined) return null

  return {
    createdAt: saved.createdAt.toISOString(),
    id: saved.id,
    note: saved.note,
    occurrenceTypeId: saved.occurrenceTypeId,
    productCode: saved.productCode,
    stage: saved.stage,
    typeName: input.typeName,
  }
}

/**
 * Spec 079 P2: o contato de quem recebe, e o contratante.
 *
 * **Duas consultas, nunca uma por nota**: os participantes com o telefone do endereço, e os
 * contratantes da empresa. O telefone vem de `nfe_addresses`, que é onde o `<enderDest><fone>` do
 * XML foi gravado desde a spec 013 — nada é coletado aqui.
 */
export async function listDeliveryContacts(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly nfeDocumentIds: readonly string[]
  },
): Promise<ReadonlyMap<string, DeliveryContact>> {
  if (input.nfeDocumentIds.length === 0) return new Map()

  const [parties, contractorRecords] = await Promise.all([
    queryable
      .select({
        documentId: nfeParticipants.documentId,
        legalName: nfeParticipants.legalName,
        phone: nfeAddresses.phone,
        role: nfeParticipants.role,
        taxId: nfeParticipants.taxId,
        tradeName: nfeParticipants.tradeName,
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
          eq(nfeParticipants.companyId, input.companyId),
          inArray(nfeParticipants.documentId, [...input.nfeDocumentIds]),
        ),
      ),
    queryable
      .select({ displayName: contractors.displayName, taxId: contractors.taxId })
      .from(contractors)
      .where(eq(contractors.companyId, input.companyId)),
  ])

  const byDocument = new Map<
    string,
    { legalName: string; phone: string; role: string; taxId: string; tradeName: string }[]
  >()
  for (const row of parties) {
    const bucket = byDocument.get(row.documentId) ?? []
    bucket.push({
      legalName: row.legalName ?? '',
      phone: row.phone ?? '',
      role: row.role,
      taxId: row.taxId ?? '',
      tradeName: row.tradeName ?? '',
    })
    byDocument.set(row.documentId, bucket)
  }

  const contacts = new Map<string, DeliveryContact>()
  for (const [documentId, partyList] of byDocument) {
    const contact = resolveDeliveryContact({ contractors: contractorRecords, parties: partyList })
    if (contact !== null) contacts.set(documentId, contact)
  }

  return contacts
}

/**
 * Os rótulos que o aviso da ocorrência imprime. **Uma consulta**, e só quando alguém registra uma
 * ocorrência — ação manual, nunca em laço.
 *
 * ⚠️ Rótulo ausente vira string vazia, e o template renderiza o buraco: é melhor um aviso com
 * lacuna do que nenhum aviso, porque a lacuna é visível e a ausência não.
 */
export async function readOccurrenceLabels(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  },
): Promise<{ readonly documentLabel: string; readonly stopLabel: string }> {
  const [row] = await queryable
    .select({
      nfeNumber: nfeDocuments.number,
      nfeSeries: nfeDocuments.series,
      stopLabel: tripStops.label,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .leftJoin(
      tripStops,
      and(eq(tripStops.companyId, tripDocuments.companyId), eq(tripStops.id, tripDocuments.stopId)),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .limit(1)

  const number = row?.nfeNumber ?? ''
  const series = row?.nfeSeries ?? ''

  return {
    documentLabel: number === '' ? '' : series === '' ? number : `${number}/${series}`,
    stopLabel: row?.stopLabel ?? '',
  }
}

/**
 * Spec 079: a nota que **este motorista** está levando agora.
 *
 * ⚠️ O recorte é o mesmo de `findDeliveryEventId`: junção com `trip_drivers` e viagem em estado
 * ativo. Nota de outra viagem — ou de viagem que já fechou — responde `null`, e o caso de uso a
 * trata como inalcançável. É a consulta que estreita o `trip.report` da empresa inteira para a
 * carga que ele tem nas mãos; a permissão sozinha não estreita nada.
 */
export async function findDriverReachableDocument(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
  },
): Promise<null | { readonly tripId: string }> {
  const [row] = await queryable
    .select({ tripId: tripDocuments.tripId })
    .from(tripDocuments)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .innerJoin(
      tripDrivers,
      and(eq(tripDrivers.companyId, trips.companyId), eq(tripDrivers.tripId, trips.id)),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDrivers.driverId, input.driverId),
        inArray(trips.status, [...ACTIVE_TRIP_STATUSES]),
      ),
    )
    .limit(1)

  return row === undefined ? null : { tripId: row.tripId }
}

/**
 * O tipo cadastrado, conferido contra a empresa. ⚠️ `active` **não** entra no `where`: o caso de
 * uso precisa distinguir "não existe" de "foi aposentado" para decidir, e filtrar aqui devolveria
 * `null` nos dois casos.
 */
export async function findOccurrenceType(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly occurrenceTypeId: string },
): Promise<null | OccurrenceTypeRecord> {
  const [row] = await queryable
    .select({
      active: companyOccurrenceTypes.active,
      id: companyOccurrenceTypes.id,
      name: companyOccurrenceTypes.name,
      notifies: companyOccurrenceTypes.notifies,
      stage: companyOccurrenceTypes.stage,
    })
    .from(companyOccurrenceTypes)
    .where(
      and(
        eq(companyOccurrenceTypes.companyId, input.companyId),
        eq(companyOccurrenceTypes.id, input.occurrenceTypeId),
      ),
    )
    .limit(1)

  return row ?? null
}

/** Os tipos que a empresa cadastrou. O aposentado vem junto: a tela o mostra apagado, não some. */
export async function listOccurrenceTypes(
  queryable: TripQueryable,
  input: { readonly companyId: string },
): Promise<readonly OccurrenceTypeRecord[]> {
  return queryable
    .select({
      active: companyOccurrenceTypes.active,
      id: companyOccurrenceTypes.id,
      name: companyOccurrenceTypes.name,
      notifies: companyOccurrenceTypes.notifies,
      stage: companyOccurrenceTypes.stage,
    })
    .from(companyOccurrenceTypes)
    .where(eq(companyOccurrenceTypes.companyId, input.companyId))
    .orderBy(asc(companyOccurrenceTypes.stage), asc(companyOccurrenceTypes.name))
}

export async function saveOccurrenceType(
  queryable: TripQueryable,
  input: {
    readonly active: boolean
    readonly companyId: string
    readonly name: string
    readonly notifies: boolean
    readonly occurrenceTypeId: null | string
    readonly stage: TripOccurrenceStage
  },
): Promise<OccurrenceTypeRecord> {
  const values = {
    active: input.active,
    companyId: input.companyId,
    name: input.name.trim(),
    notifies: input.notifies,
    stage: input.stage,
  }

  const [saved] =
    input.occurrenceTypeId === null
      ? await queryable.insert(companyOccurrenceTypes).values(values).returning()
      : await queryable
          .update(companyOccurrenceTypes)
          .set({ ...values, updatedAt: sql`now()` })
          .where(
            and(
              eq(companyOccurrenceTypes.companyId, input.companyId),
              eq(companyOccurrenceTypes.id, input.occurrenceTypeId),
            ),
          )
          .returning()

  if (saved === undefined) throw new TripDocumentNotFoundError()

  return {
    active: saved.active,
    id: saved.id,
    name: saved.name,
    notifies: saved.notifies,
    stage: saved.stage,
  }
}

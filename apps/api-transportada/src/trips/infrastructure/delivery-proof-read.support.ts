/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura do comprovante, escopada pela empresa **em cada junção** — não só na tabela de cima.
 * O comprovante pendura em `trip_stop_events`, que pendura em `trip_stops`, que pendura na viagem;
 * uma junção sem `company_id` em qualquer degrau é o caminho pelo qual o canhoto de uma empresa
 * aparece na tela de outra.
 */
import { alias } from 'drizzle-orm/pg-core'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { fleetDrivers } from '../../database/fleet.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
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
import { ACTIVE_MEMBERSHIP_STATUS } from '../../nfe-documents/domain/active-membership-status.constant.js'
import type { DeliveryProofRecord } from '../application/read-delivery-proof.use-case.js'
import type { TripDocumentProduct } from '../application/read-trip-document-products.use-case.js'
import type {
  OccurrenceTypeRecord,
  TripOccurrence,
  TripOccurrenceAuthorship,
} from '../application/register-trip-occurrence.use-case.js'
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceTemplateValues } from '../domain/occurrence-template.policy.js'
import { TripDocumentNotFoundError } from '../domain/trip.error.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { resolveDeliveryContact } from '../domain/delivery-contact.policy.js'
import type { DeliveryContact } from '../domain/delivery-contact.policy.js'
import { PROOF_REACHABLE_TRIP_STATUSES } from './drizzle-delivery-proof.repository.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'
import type { FieldAuthorship, FieldTripTarget } from '../application/field-trip-target.types.js'
import type { TripQueryable } from './trip-queryable.type.js'

/**
 * Spec 156 T9 (D3): resolve o nome de quem gravou pela mesma janela do padrão já em produção
 * (nfe-documents/D16, H13) — `null` só quando ninguém foi gravado; `{ removed: true }` não se
 * aplica aqui porque a leitura publica direto `string | null`, sem marcar remoção (não há tela que
 * distinga "sem ator" de "ator sem vínculo ativo" nesta rota).
 */
const occurrenceActorMembership = alias(userCompanyMemberships, 'trip_occurrence_actor_membership')
const occurrenceActorProfile = alias(identityUserProfiles, 'trip_occurrence_actor_profile')
const occurrenceOnBehalfDriver = alias(fleetDrivers, 'trip_occurrence_on_behalf_driver')

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
      receiverDocumentMasked: tripDeliveryProofs.receiverDocumentMasked,
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
    receiverDocumentMasked: row.receiverDocumentMasked,
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

/** Spec 156 T7b: a localização crua do anexo — quem assina a URL é o chamador. */
export type TripOccurrenceAttachmentLocation = {
  readonly bucket: string
  readonly mimeType: string
  readonly objectKey: string
}

export async function listTripOccurrences(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  },
): Promise<
  readonly (TripOccurrence &
    TripOccurrenceAuthorship & { readonly attachment: TripOccurrenceAttachmentLocation | null })[]
> {
  const rows = await queryable
    .select({
      actorName: occurrenceActorProfile.name,
      attachmentBucket: storedObjects.bucket,
      attachmentMimeType: storedObjects.mimeType,
      attachmentObjectKey: storedObjects.objectKey,
      channel: tripDocumentOccurrences.channel,
      createdAt: tripDocumentOccurrences.createdAt,
      id: tripDocumentOccurrences.id,
      note: tripDocumentOccurrences.note,
      onBehalfOfDriverName: occurrenceOnBehalfDriver.name,
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
    .leftJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, tripDocumentOccurrences.companyId),
        eq(storedObjects.id, tripDocumentOccurrences.attachmentObjectId),
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
        eq(tripDocumentOccurrences.tripDocumentId, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .orderBy(asc(tripDocumentOccurrences.createdAt))

  return rows.map((row) => ({
    actorName: row.actorName ?? null,
    attachment:
      row.attachmentBucket === null || row.attachmentObjectKey === null
        ? null
        : {
            bucket: row.attachmentBucket,
            mimeType: row.attachmentMimeType ?? '',
            objectKey: row.attachmentObjectKey,
          },
    channel: row.channel,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    note: row.note,
    onBehalfOfDriverName: row.onBehalfOfDriverName ?? null,
    occurrenceTypeId: row.occurrenceTypeId,
    productCode: row.productCode,
    stage: row.stage,
    typeName: row.typeName,
  }))
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
    /**
     * ADR-0067 §2: ausente para o fluxo do galpão (`registerTripOccurrence`, separação), que não
     * tem `FieldTripTarget` — o `channel` grava o padrão da coluna (`driver_app`).
     */
    readonly authorship?: FieldAuthorship
    /** Spec 156 T7b: o objeto único da foto do lote, referenciado por cada nota. */
    readonly attachmentObjectId?: string | null
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
      attachmentObjectId: input.attachmentObjectId ?? null,
      companyId: input.companyId,
      note: input.note,
      occurrenceTypeId: input.occurrenceTypeId,
      productCode: input.productCode,
      stage: input.stage,
      tripDocumentId: input.documentId,
      ...(input.authorship === undefined
        ? {}
        : {
            channel: input.authorship.channel,
            onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
          }),
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

  // Em série: o `queryable` pode ser transação, e consulta concorrente nela pode nunca voltar.
  const parties = await queryable
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
    )
  const contractorRecords = await queryable
    .select({ displayName: contractors.displayName, taxId: contractors.taxId })
    .from(contractors)
    .where(eq(contractors.companyId, input.companyId))

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
 * Spec 156 T15 M10: os rótulos das N notas de um lote do escritório, numa consulta só — o lote
 * chamava `readOccurrenceLabels` uma vez por nota. Mesma regra de rótulo ausente (string vazia).
 */
export async function readOccurrenceLabelsForDocuments(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
    readonly tripId: string
  },
): Promise<ReadonlyMap<string, { readonly documentLabel: string; readonly stopLabel: string }>> {
  if (input.documentIds.length === 0) return new Map()

  const rows = await queryable
    .select({
      documentId: tripDocuments.id,
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
        inArray(tripDocuments.id, [...input.documentIds]),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )

  return new Map(
    rows.map((row) => [
      row.documentId,
      {
        documentLabel: formatDocumentLabel({ number: row.nfeNumber, series: row.nfeSeries }),
        stopLabel: row.stopLabel ?? '',
      },
    ]),
  )
}

function formatDocumentLabel(input: {
  readonly number: string | null
  readonly series: string | null
}): string {
  const number = input.number ?? ''
  const series = input.series ?? ''
  if (number === '') return ''
  return series === '' ? number : `${number}/${series}`
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
 * Spec 079: a nota que **este motorista** está levando agora — ou, pelo escritório (spec 156), a
 * nota da viagem que ele resolveu.
 *
 * ⚠️ O recorte é o mesmo de `findReachableDocumentIds`: o alvo (`fieldTripTargetCondition`), viagem
 * em estado ativo e **só as vivas** — nota liberada (`released_at`) não está mais na viagem, mesmo
 * que a viagem continue ativa (spec 156 T8b.1). Nota de outra viagem, de viagem que já fechou, ou já
 * liberada desta mesma viagem, responde `null`, e o caso de uso a trata como inalcançável. É a
 * consulta que estreita o `trip.report` da empresa inteira para a carga que ele tem nas mãos; a
 * permissão sozinha não estreita nada.
 *
 * ⚠️ `findDeliveryEventId` (`drizzle-delivery-proof.repository.ts`) **não** filtra `released_at` —
 * ela busca o evento de uma entrega que já aconteceu, e o comprovante continua válido mesmo que a
 * nota seja liberada depois. Os dois têm o mesmo alvo e o mesmo recorte de viagem ativa, mas não o
 * mesmo recorte de `released_at`; o comentário anterior os igualava por engano.
 */
export async function findDriverReachableDocument(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  },
): Promise<null | { readonly tripId: string }> {
  const [row] = await queryable
    .select({ tripId: tripDocuments.tripId })
    .from(tripDocuments)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        isNull(tripDocuments.releasedAt),
        fieldTripTargetCondition(input.target),
        inArray(trips.status, [...PROOF_REACHABLE_TRIP_STATUSES]),
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
      emailBody: companyOccurrenceTypes.emailBody,
      emailSubject: companyOccurrenceTypes.emailSubject,
      emailTemplateKey: companyOccurrenceTypes.emailTemplateKey,
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
      emailBody: companyOccurrenceTypes.emailBody,
      emailSubject: companyOccurrenceTypes.emailSubject,
      emailTemplateKey: companyOccurrenceTypes.emailTemplateKey,
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
    readonly emailBody: string
    readonly emailSubject: string
    readonly emailTemplateKey: null | string
    readonly name: string
    readonly notifies: boolean
    readonly occurrenceTypeId: null | string
    readonly stage: TripOccurrenceStage
  },
): Promise<OccurrenceTypeRecord> {
  const values = {
    active: input.active,
    companyId: input.companyId,
    emailBody: input.emailBody,
    emailSubject: input.emailSubject,
    emailTemplateKey: input.emailTemplateKey,
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
    emailBody: saved.emailBody,
    emailSubject: saved.emailSubject,
    emailTemplateKey: saved.emailTemplateKey,
    id: saved.id,
    name: saved.name,
    notifies: saved.notifies,
    stage: saved.stage,
  }
}

/**
 * Spec 079: tudo o que o modelo de e-mail sabe preencher, numa consulta.
 *
 * ⚠️ **Uma consulta, e só quando alguém registra ocorrência** — ação manual, nunca em laço. Os
 * campos vêm de onde já estavam: a nota, o participante destinatário, a parada, o motorista da
 * viagem e o contratante cadastrado.
 *
 * ⚠️ **A NFD não está aqui**, e é decisão: o número da nota de devolução nasce no balcão do cliente
 * e não existe na nossa base. Quem registra a ocorrência o digita, e ele chega ao modelo por
 * `{{observacao}}`.
 */
export async function readOccurrenceTemplateValues(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly documentId: string
    readonly note: string
    readonly occurredOn: string
    readonly productCode: string
    readonly tripId: string
  },
): Promise<OccurrenceTemplateValues> {
  const [row] = await queryable
    .select({
      driverName: tripDrivers.driverName,
      nfeDocumentId: tripDocuments.nfeDocumentId,
      nfeNumber: nfeDocuments.number,
      nfeSeries: nfeDocuments.series,
      stopLabel: tripStops.label,
      totalValue: nfeDocuments.totalValue,
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
    .leftJoin(
      tripDrivers,
      and(
        eq(tripDrivers.companyId, tripDocuments.companyId),
        eq(tripDrivers.tripId, tripDocuments.tripId),
      ),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        eq(tripDocuments.id, input.documentId),
        eq(tripDocuments.tripId, input.tripId),
      ),
    )
    .limit(1)

  const nfeDocumentId = row?.nfeDocumentId ?? null
  const [contatos, produtos] = await Promise.all([
    nfeDocumentId === null
      ? new Map()
      : listDeliveryContacts(queryable, {
          companyId: input.companyId,
          nfeDocumentIds: [nfeDocumentId],
        }),
    input.productCode === ''
      ? []
      : listDocumentProducts(queryable, {
          companyId: input.companyId,
          documentId: input.documentId,
          tripId: input.tripId,
        }),
  ])

  const contato = nfeDocumentId === null ? undefined : contatos.get(nfeDocumentId)
  const produto = produtos.find((candidate) => candidate.code.trim() === input.productCode.trim())
  const numero = row?.nfeNumber ?? ''
  const serie = row?.nfeSeries ?? ''

  return {
    contractorName: contato?.contractorName ?? '',
    documentLabel: numero === '' ? '' : serie === '' ? numero : `${numero}/${serie}`,
    driverName: row?.driverName ?? '',
    itemCode: produto?.code ?? '',
    itemLabel: produto?.description ?? '',
    itemQuantity: produto === undefined ? '' : String(produto.quantity),
    note: input.note,
    occurredOn: input.occurredOn,
    recipientName: contato?.name ?? '',
    stopLabel: row?.stopLabel ?? '',
    totalValue: row?.totalValue ?? '',
  }
}

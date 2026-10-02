/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 RF4/RF9: a pendência de canhoto lida, nunca gravada. Nota pendente = baixada
 * (`separation_status = 'delivered'`), sem foto no evento de entrega e com canhoto exigido pela
 * configuração resolvida do destinatário — a mesma conta de `resolveProofPendingFlag`, que a
 * calcula na escrita. Na leitura do detalhe a regra roda em TypeScript (uma função só); no filtro
 * da lista ela precisa existir em SQL, e o teste de paridade da integração prende as duas.
 */
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import {
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  trips,
} from '../../database/trip.schema.js'
import {
  DELIVERED_DOCUMENT_STATUS,
  DELIVERED_EVENT_KIND,
  PHOTO_PROOF_KIND,
  RECIPIENT_PARTICIPANT_ROLE,
  REQUIRED_PROOF_FIELD_MODE,
} from '../domain/delivery-event.constant.js'
import {
  isProofRequiredBySettings,
  resolveProofSettingsForRecipient,
  type DeliveryProofFieldSettings,
} from '../domain/delivery-proof-settings.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

/** Nenhum evento de entrega do documento tem foto anexada. */
function deliveredDocumentWithoutPhoto(): SQL {
  return sql`not exists (select 1 from ${tripStopEvents} inner join ${tripDeliveryProofs} on ${and(
    eq(tripDeliveryProofs.companyId, tripStopEvents.companyId),
    eq(tripDeliveryProofs.stopEventId, tripStopEvents.id),
    eq(tripDeliveryProofs.kind, PHOTO_PROOF_KIND),
  )} where ${and(
    eq(tripStopEvents.companyId, tripDocuments.companyId),
    eq(tripStopEvents.tripDocumentId, tripDocuments.id),
    eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
  )})`
}

/**
 * Devolve o conjunto de `trip_documents.id` pendentes dentre os pedidos. Lista vazia, ou nenhuma
 * baixada sem foto, não paga as consultas de configuração — no máximo três leituras fixas.
 */
export async function loadProofPendingDocumentIds(
  queryable: TripQueryable,
  input: {
    readonly companyId: string
    readonly tripDocumentIds: readonly string[]
  },
): Promise<ReadonlySet<string>> {
  if (input.tripDocumentIds.length === 0) return new Set()

  const candidates = await queryable
    .select({ id: tripDocuments.id, recipientTaxId: nfeParticipants.taxId })
    .from(tripDocuments)
    .leftJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
      ),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.id, [...input.tripDocumentIds]),
        eq(tripDocuments.separationStatus, DELIVERED_DOCUMENT_STATUS),
        deliveredDocumentWithoutPhoto(),
      ),
    )
  if (candidates.length === 0) return new Set()

  const [generalRows, overrideRows] = await Promise.all([
    queryable
      .select({
        cargo: companyDeliveryProofSettings.cargo,
        cargoMinimumCount: companyDeliveryProofSettings.cargoMinimumCount,
        photo: companyDeliveryProofSettings.photo,
        receivedBy: companyDeliveryProofSettings.receivedBy,
        receiverDocument: companyDeliveryProofSettings.receiverDocument,
        receiverName: companyDeliveryProofSettings.receiverName,
        signature: companyDeliveryProofSettings.signature,
      })
      .from(companyDeliveryProofSettings)
      .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
      .limit(1),
    queryable
      .select({
        cargo: deliveryProofSettingOverrides.cargo,
        cargoMinimumCount: deliveryProofSettingOverrides.cargoMinimumCount,
        photo: deliveryProofSettingOverrides.photo,
        receivedBy: deliveryProofSettingOverrides.receivedBy,
        receiverDocument: deliveryProofSettingOverrides.receiverDocument,
        receiverName: deliveryProofSettingOverrides.receiverName,
        signature: deliveryProofSettingOverrides.signature,
        taxId: deliveryProofSettingOverrides.taxId,
      })
      .from(deliveryProofSettingOverrides)
      .where(eq(deliveryProofSettingOverrides.companyId, input.companyId)),
  ])
  const overridesByTaxId = new Map<string, DeliveryProofFieldSettings>(
    overrideRows.map(({ taxId, ...settings }) => [taxId, settings]),
  )
  const lookup = { general: generalRows[0] ?? null, overridesByTaxId }

  return new Set(
    candidates
      .filter((candidate) =>
        isProofRequiredBySettings(
          resolveProofSettingsForRecipient({
            lookup,
            recipientTaxId: candidate.recipientTaxId ?? '',
          }),
        ),
      )
      .map((candidate) => candidate.id),
  )
}

function requiredByColumns(columns: { readonly photo: SQL; readonly signature: SQL }): SQL {
  return sql`(${columns.photo} = ${REQUIRED_PROOF_FIELD_MODE} or ${columns.signature} = ${REQUIRED_PROOF_FIELD_MODE})`
}

/**
 * O filtro `proofPendingEq` da lista: a viagem tem ao menos uma nota pendente. A exceção do
 * destinatário vence a geral por inteiro; sem nenhuma das duas vale a fábrica (nada exigido).
 */
export function tripHasProofPendingDocumentCondition(): SQL {
  const overrideRequired = sql`(select ${requiredByColumns({
    photo: sql`${deliveryProofSettingOverrides.photo}`,
    signature: sql`${deliveryProofSettingOverrides.signature}`,
  })} from ${deliveryProofSettingOverrides} where ${and(
    eq(deliveryProofSettingOverrides.companyId, tripDocuments.companyId),
    eq(deliveryProofSettingOverrides.taxId, nfeParticipants.taxId),
  )})`
  const generalRequired = sql`(select ${requiredByColumns({
    photo: sql`${companyDeliveryProofSettings.photo}`,
    signature: sql`${companyDeliveryProofSettings.signature}`,
  })} from ${companyDeliveryProofSettings} where ${eq(
    companyDeliveryProofSettings.companyId,
    tripDocuments.companyId,
  )})`
  const pendingDocument = sql`select 1 from ${tripDocuments} left join ${nfeParticipants} on ${and(
    eq(nfeParticipants.companyId, tripDocuments.companyId),
    eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
    eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
  )} where ${and(
    eq(tripDocuments.companyId, trips.companyId),
    eq(tripDocuments.tripId, trips.id),
    eq(tripDocuments.separationStatus, DELIVERED_DOCUMENT_STATUS),
    deliveredDocumentWithoutPhoto(),
    sql`coalesce(${overrideRequired}, ${generalRequired}, false)`,
  )}`

  return sql`exists (${pendingDocument})`
}

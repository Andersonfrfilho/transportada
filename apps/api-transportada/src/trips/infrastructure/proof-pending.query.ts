/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 223 RF4/RF9: a pendência de canhoto lida, nunca gravada. Nota pendente = baixada
 * (`separation_status = 'delivered'`), sem foto no evento de entrega e com canhoto exigido pela
 * configuração resolvida da nota (geral, contratante e destinatário — spec 218 RF-C3) — a mesma conta de `resolveProofPendingFlag`, que a
 * calcula na escrita. Na leitura do detalhe a regra roda em TypeScript (uma função só); no filtro
 * da lista ela precisa existir em SQL, e o teste de paridade da integração prende as duas.
 */
import { and, eq, inArray, ne, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingContractorOverrides,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import {
  TRIP_DELIVERY_PROOF_CANHOTO_REJECTED_REVIEW,
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  trips,
} from '../../database/trip.schema.js'
import {
  DELIVERED_DOCUMENT_STATUS,
  DELIVERED_EVENT_KIND,
  EMITTER_PARTICIPANT_ROLE,
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

/** Spec 218 RF-C3: o contratante da nota é o emitente cadastrado — o mesmo join da tela do motorista. */
const EMITTER_ALIAS = 'proof_pending_emitter'
const emitterParticipants = alias(nfeParticipants, EMITTER_ALIAS)

function emitterJoinCondition(): SQL | undefined {
  return and(
    eq(emitterParticipants.companyId, tripDocuments.companyId),
    eq(emitterParticipants.documentId, tripDocuments.nfeDocumentId),
    eq(emitterParticipants.role, EMITTER_PARTICIPANT_ROLE),
  )
}

function contractorJoinCondition(): SQL | undefined {
  return and(
    eq(contractors.companyId, emitterParticipants.companyId),
    eq(contractors.taxId, emitterParticipants.taxId),
  )
}

/**
 * Nenhum evento de entrega do documento tem foto **que sirva** anexada. Canhoto recusado pela
 * conferência (`canhoto_review = 'rejected'`) não conta: é a mesma leitura de
 * `isDeliveryProofSettled` (spec 220 RF29) — "tem foto" deixou de significar "está comprovado", e
 * contar o ilegível apagaria a dívida do escritório enquanto a fila do motorista ainda a cobra.
 */
function deliveredDocumentWithoutPhoto(): SQL {
  return sql`not exists (select 1 from ${tripStopEvents} inner join ${tripDeliveryProofs} on ${and(
    eq(tripDeliveryProofs.companyId, tripStopEvents.companyId),
    eq(tripDeliveryProofs.stopEventId, tripStopEvents.id),
    eq(tripDeliveryProofs.kind, PHOTO_PROOF_KIND),
    ne(tripDeliveryProofs.canhotoReview, TRIP_DELIVERY_PROOF_CANHOTO_REJECTED_REVIEW),
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
    .select({
      contractorId: contractors.id,
      id: tripDocuments.id,
      recipientTaxId: nfeParticipants.taxId,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, tripDocuments.companyId),
        eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
        eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
      ),
    )
    .leftJoin(emitterParticipants, emitterJoinCondition())
    .leftJoin(contractors, contractorJoinCondition())
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(tripDocuments.id, [...input.tripDocumentIds]),
        eq(tripDocuments.separationStatus, DELIVERED_DOCUMENT_STATUS),
        deliveredDocumentWithoutPhoto(),
      ),
    )
  if (candidates.length === 0) return new Set()

  const [generalRows, overrideRows, contractorOverrideRows] = await Promise.all([
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
    queryable
      .select({
        cargo: deliveryProofSettingContractorOverrides.cargo,
        cargoMinimumCount: deliveryProofSettingContractorOverrides.cargoMinimumCount,
        contractorId: deliveryProofSettingContractorOverrides.contractorId,
        photo: deliveryProofSettingContractorOverrides.photo,
        receivedBy: deliveryProofSettingContractorOverrides.receivedBy,
        receiverDocument: deliveryProofSettingContractorOverrides.receiverDocument,
        receiverName: deliveryProofSettingContractorOverrides.receiverName,
        signature: deliveryProofSettingContractorOverrides.signature,
      })
      .from(deliveryProofSettingContractorOverrides)
      .where(eq(deliveryProofSettingContractorOverrides.companyId, input.companyId)),
  ])
  const overridesByTaxId = new Map<string, DeliveryProofFieldSettings>(
    overrideRows.map(({ taxId, ...settings }) => [taxId, settings]),
  )
  const overridesByContractorId = new Map<string, DeliveryProofFieldSettings>(
    contractorOverrideRows.map(({ contractorId, ...settings }) => [contractorId, settings]),
  )
  const lookup = { general: generalRows[0] ?? null, overridesByContractorId, overridesByTaxId }

  return new Set(
    candidates
      .filter((candidate) =>
        isProofRequiredBySettings(
          resolveProofSettingsForRecipient({
            contractorId: candidate.contractorId,
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
 * destinatário vence a da contratante, que vence a geral, cada uma por inteiro (spec 218 RF-C3);
 * sem nenhuma vale a fábrica (nada exigido).
 */
export function tripHasProofPendingDocumentCondition(): SQL {
  const overrideRequired = sql`(select ${requiredByColumns({
    photo: sql`${deliveryProofSettingOverrides.photo}`,
    signature: sql`${deliveryProofSettingOverrides.signature}`,
  })} from ${deliveryProofSettingOverrides} where ${and(
    eq(deliveryProofSettingOverrides.companyId, tripDocuments.companyId),
    eq(deliveryProofSettingOverrides.taxId, nfeParticipants.taxId),
  )})`
  const contractorOverrideRequired = sql`(select ${requiredByColumns({
    photo: sql`${deliveryProofSettingContractorOverrides.photo}`,
    signature: sql`${deliveryProofSettingContractorOverrides.signature}`,
  })} from ${deliveryProofSettingContractorOverrides} where ${and(
    eq(deliveryProofSettingContractorOverrides.companyId, tripDocuments.companyId),
    eq(deliveryProofSettingContractorOverrides.contractorId, contractors.id),
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
  )} left join ${nfeParticipants} ${sql.identifier(EMITTER_ALIAS)} on ${emitterJoinCondition()} left join ${contractors} on ${contractorJoinCondition()} where ${and(
    eq(tripDocuments.companyId, trips.companyId),
    eq(tripDocuments.tripId, trips.id),
    eq(tripDocuments.separationStatus, DELIVERED_DOCUMENT_STATUS),
    deliveredDocumentWithoutPhoto(),
    sql`coalesce(${overrideRequired}, ${contractorOverrideRequired}, ${generalRequired}, false)`,
  )}`

  return sql`exists (${pendingDocument})`
}

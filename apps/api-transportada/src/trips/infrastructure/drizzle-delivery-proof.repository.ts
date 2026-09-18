/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { and, desc, eq, inArray } from 'drizzle-orm'

import type { Coordinate } from '../../addresses/domain/coordinate-distance.js'
import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  tripDeliveryProofs,
  tripDocuments,
  tripStopEvents,
  tripStops,
  trips,
  type TripDeliveryProofKind,
} from '../../database/trip.schema.js'
import type { DeliveryProofPort } from '../application/attach-delivery-proof.use-case.js'
import type { FieldAuthorship, FieldTripTarget } from '../application/field-trip-target.types.js'
import type { ProofPunctuality } from '../domain/delivery-proof-punctuality.policy.js'
import { DeliveryProofEventVanishedError } from '../domain/delivery-proof-event.error.js'
import {
  DELIVERED_EVENT_KIND,
  RECIPIENT_PARTICIPANT_ROLE,
} from '../domain/delivery-event.constant.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  resolveProofSettingsForRecipient,
  type DeliveryProofFieldSettings,
  type DeliveryProofPunctualitySettings,
} from '../domain/delivery-proof-settings.policy.js'
import { TRIP_DISPATCHED_STATUSES } from '../domain/trip-state.policy.js'
import { fieldTripTargetCondition } from './field-trip-target.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * As viagens que o motorista ainda alcança. `completed` entra: a viagem fecha e o canhoto (ou a
 * ocorrência) ainda chega — quem estava na rua nem sempre tem sinal na hora.
 *
 * Exportada porque a ocorrência do motorista usa **o mesmo recorte** (spec 079): duplicar a lista
 * deixaria uma das duas aceitar viagem que a outra recusa, sem nada falhar.
 */
/** O comprovante anexa à viagem que saiu, inclusive à que já acabou. */
/**
 * Spec 156 T15: a viagem que já saiu do barracão — inclusive concluída, porque o comprovante e a
 * ocorrência chegam depois da última entrega. (Era `ACTIVE_TRIP_STATUSES`, nome que outros dois
 * repositórios usavam com sentidos diferentes.)
 */
export const PROOF_REACHABLE_TRIP_STATUSES = TRIP_DISPATCHED_STATUSES

export class DrizzleDeliveryProofRepository implements DeliveryProofPort {
  public constructor(private readonly database: Database) {}

  /**
   * O comprovante prende no **evento de entrega da viagem do alvo** (o motorista logado, ou a viagem
   * que o escritório resolveu — spec 156), não na nota: é o que separa "o canhoto desta entrega" de
   * "um arquivo qualquer ligado a uma nota". A viagem já concluída entra na lista de propósito — o
   * motorista fotografa o canhoto depois de fechar a última parada.
   */
  public async findDeliveryEventId(input: {
    readonly companyId: string
    readonly documentId: string
    readonly target: FieldTripTarget
  }): Promise<string | null> {
    const [record] = await this.database
      .select({ id: tripStopEvents.id })
      .from(tripStopEvents)
      .innerJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, tripStopEvents.companyId),
          eq(tripDocuments.id, tripStopEvents.tripDocumentId),
        ),
      )
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .where(
        and(
          eq(tripStopEvents.companyId, input.companyId),
          eq(tripStopEvents.tripDocumentId, input.documentId),
          eq(tripStopEvents.kind, DELIVERED_EVENT_KIND),
          fieldTripTargetCondition(input.target),
          inArray(trips.status, [...PROOF_REACHABLE_TRIP_STATUSES]),
        ),
      )
      .orderBy(desc(tripStopEvents.createdAt))
      .limit(1)

    return record?.id ?? null
  }

  /**
   * ADR-0057 §1: a configuração resolvida — geral da empresa mais a exceção pelo CNPJ do
   * destinatário da nota. Toda consulta com o tenant no `where`; ausência de linha cai na fábrica.
   */
  public async resolveProofFieldSettings(input: {
    readonly companyId: string
    readonly documentId: string
  }): Promise<DeliveryProofFieldSettings> {
    const [recipient] = await this.database
      .select({ taxId: nfeParticipants.taxId })
      .from(tripDocuments)
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          eq(nfeParticipants.role, RECIPIENT_PARTICIPANT_ROLE),
        ),
      )
      .where(
        and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.id, input.documentId)),
      )
      .limit(1)

    const [general] = await this.database
      .select({
        photo: companyDeliveryProofSettings.photo,
        receiverDocument: companyDeliveryProofSettings.receiverDocument,
        receiverName: companyDeliveryProofSettings.receiverName,
        signature: companyDeliveryProofSettings.signature,
      })
      .from(companyDeliveryProofSettings)
      .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
      .limit(1)

    const recipientTaxId = recipient?.taxId ?? ''
    const [override] =
      recipientTaxId.length === 0
        ? []
        : await this.database
            .select({
              photo: deliveryProofSettingOverrides.photo,
              receiverDocument: deliveryProofSettingOverrides.receiverDocument,
              receiverName: deliveryProofSettingOverrides.receiverName,
              signature: deliveryProofSettingOverrides.signature,
            })
            .from(deliveryProofSettingOverrides)
            .where(
              and(
                eq(deliveryProofSettingOverrides.companyId, input.companyId),
                eq(deliveryProofSettingOverrides.taxId, recipientTaxId),
              ),
            )
            .limit(1)

    /** Spec 082 (revisão): a mesma regra do snapshot do motorista — um único lugar decide. */
    return resolveProofSettingsForRecipient({
      lookup: {
        general: general ?? null,
        overridesByTaxId:
          override === undefined
            ? new Map<string, DeliveryProofFieldSettings>()
            : new Map([[recipientTaxId, override]]),
      },
      recipientTaxId,
    })
  }

  /**
   * ADR-0070 §3-5, spec 159 RF7: os parâmetros de pontualidade da configuração geral. Ausência de
   * linha (ou empresa que nunca salvou o painel) cai na fábrica — mesmo molde de
   * `resolveProofFieldSettings` acima.
   */
  public async resolveProofPunctualitySettings(input: {
    readonly companyId: string
  }): Promise<DeliveryProofPunctualitySettings> {
    const [record] = await this.database
      .select({
        latePenaltyPoints: companyDeliveryProofSettings.latePenaltyPoints,
        missingAfterHours: companyDeliveryProofSettings.missingAfterHours,
        missingPenaltyPoints: companyDeliveryProofSettings.missingPenaltyPoints,
        proofRadiusMeters: companyDeliveryProofSettings.proofRadiusMeters,
        proofWindowMinutes: companyDeliveryProofSettings.proofWindowMinutes,
      })
      .from(companyDeliveryProofSettings)
      .where(eq(companyDeliveryProofSettings.companyId, input.companyId))
      .limit(1)

    return record ?? DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS
  }

  /**
   * ADR-0070 §5-6, spec 159 RF5/RF6: quando e onde a entrega aconteceu — o evento já resolvido por
   * `findDeliveryEventId`, nunca a nota (uma nota pode ter mais de uma entrega ao longo do tempo,
   * ainda que rara).
   */
  public async findDeliveryContext(input: {
    readonly companyId: string
    readonly eventId: string
  }): Promise<{
    readonly deliveredAt: Date
    readonly deliveryEventPosition: Coordinate | undefined
    readonly stopPosition: Coordinate | undefined
  }> {
    const [record] = await this.database
      .select({
        capturedAt: tripStopEvents.capturedAt,
        eventLatitude: tripStopEvents.latitude,
        eventLongitude: tripStopEvents.longitude,
        recordedAt: tripStopEvents.recordedAt,
        stopLatitude: tripStops.latitude,
        stopLongitude: tripStops.longitude,
      })
      .from(tripStopEvents)
      .innerJoin(
        tripStops,
        and(
          eq(tripStops.companyId, tripStopEvents.companyId),
          eq(tripStops.id, tripStopEvents.stopId),
        ),
      )
      .where(
        and(eq(tripStopEvents.companyId, input.companyId), eq(tripStopEvents.id, input.eventId)),
      )
      .limit(1)

    if (record === undefined) throw new DeliveryProofEventVanishedError()

    return {
      deliveredAt: record.capturedAt ?? record.recordedAt,
      deliveryEventPosition: toCoordinate(record.eventLatitude, record.eventLongitude),
      stopPosition: toCoordinate(record.stopLatitude, record.stopLongitude),
    }
  }

  /**
   * Spec 082 (revisão, item 5): reenvio com a mesma `attachmentKey` para o mesmo documento+tipo é
   * retry de rede, não correção — a linha existente responde e nada é regravado.
   */
  public async findProofIdByAttachmentKey(input: {
    readonly attachmentKey: string
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<{ readonly id: string; readonly punctuality: ProofPunctuality } | null> {
    const [record] = await this.database
      .select({ id: tripDeliveryProofs.id, punctuality: tripDeliveryProofs.punctuality })
      .from(tripDeliveryProofs)
      .where(
        and(
          eq(tripDeliveryProofs.companyId, input.companyId),
          eq(tripDeliveryProofs.stopEventId, input.eventId),
          eq(tripDeliveryProofs.kind, input.kind),
          eq(tripDeliveryProofs.attachmentKey, input.attachmentKey),
        ),
      )
      .limit(1)

    return record ?? null
  }

  /** Spec 159 T11: a pontualidade que a foto substituta vai herdar na fusão (`mergeProofPunctuality`). */
  public async findProofPunctuality(input: {
    readonly companyId: string
    readonly eventId: string
    readonly kind: TripDeliveryProofKind
  }): Promise<ProofPunctuality | null> {
    const [record] = await this.database
      .select({ punctuality: tripDeliveryProofs.punctuality })
      .from(tripDeliveryProofs)
      .where(
        and(
          eq(tripDeliveryProofs.companyId, input.companyId),
          eq(tripDeliveryProofs.stopEventId, input.eventId),
          eq(tripDeliveryProofs.kind, input.kind),
        ),
      )
      .limit(1)

    return record?.punctuality ?? null
  }

  /** O objeto e o vínculo entram na mesma transação: byte no bucket sem dono é lixo que ninguém acha. */
  public async saveProof(input: SaveProofInput): Promise<{ readonly id: string }> {
    return this.database.transaction(async (transaction) => {
      await transaction.insert(storedObjects).values({
        bucket: 'fiscal',
        companyId: input.companyId,
        id: input.objectId,
        mimeType: input.mimeType,
        objectKey: input.objectKey,
        provider: 's3',
        purpose: 'delivery_proof',
        sha256: input.sha256,
        sizeBytes: BigInt(input.sizeBytes),
        status: 'final',
      })

      const [proof] = await transaction
        .insert(tripDeliveryProofs)
        .values({
          accuracyMeters: input.accuracyMeters,
          actorUserId: input.actorUserId,
          attachmentKey: input.attachmentKey,
          capturedAt: input.capturedAt,
          channel: input.authorship.channel,
          companyId: input.companyId,
          id: input.id,
          kind: input.kind,
          latitude: input.latitude,
          longitude: input.longitude,
          onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
          objectId: input.objectId,
          punctuality: input.punctuality,
          receiverDocumentEnvelope: input.receiverDocumentEnvelope,
          receiverDocumentMasked: input.receiverDocumentMasked,
          receiverName: input.receiverName,
          stopEventId: input.eventId,
        })
        /**
         * Segundo envio do mesmo tipo é correção: a foto tremida vira a boa, sem duplicar linha.
         * O `id` novo entra junto — o AAD do envelope está amarrado a ele, e manter o id antigo
         * deixaria um envelope que nunca abre.
         *
         * Spec 082 (revisão, item 4): recaptura **sem** documento não anula o envelope já selado —
         * o set omite as colunas do documento nesse caso (efeito de COALESCE), com teste próprio
         * sobre `buildProofUpsertSet`.
         */
        .onConflictDoUpdate({
          set: buildProofUpsertSet(input),
          target: [
            tripDeliveryProofs.companyId,
            tripDeliveryProofs.stopEventId,
            tripDeliveryProofs.kind,
          ],
        })
        .returning({ id: tripDeliveryProofs.id })

      if (proof === undefined) throw new Error('TRIP_DELIVERY_PROOF_NOT_SAVED')

      return proof
    })
  }
}

type SaveProofInput = {
  /** ADR-0070 §4: precisão declarada pelo aparelho, já em texto decimal (coluna `numeric`). */
  readonly accuracyMeters: string | null
  readonly actorUserId: string
  /** Spec 082 (revisão, item 5): chave de idempotência do anexo. Vazio quando o app não a manda. */
  readonly attachmentKey: string
  readonly authorship: FieldAuthorship
  /** ADR-0070 §3: o que o aparelho diz ter tirado a foto. `null` quando ele não manda. */
  readonly capturedAt: Date | null
  readonly companyId: string
  readonly eventId: string
  readonly id: string
  readonly kind: TripDeliveryProofKind
  readonly latitude: string | null
  readonly longitude: string | null
  readonly mimeType: string
  readonly objectId: string
  readonly objectKey: string
  /** ADR-0070 §2: o veredito já classificado — `not_required` para assinatura e para foto opcional. */
  readonly punctuality: ProofPunctuality
  readonly receiverDocumentEnvelope: SecretEnvelopeV1 | null
  readonly receiverDocumentMasked: string
  readonly receiverName: string
  readonly sha256: string
  readonly sizeBytes: number
}

function toCoordinate(latitude: string | null, longitude: string | null): Coordinate | undefined {
  if (latitude === null || longitude === null) return undefined

  return { latitude, longitude }
}

/**
 * Spec 082 (revisão, item 4): recaptura que chega sem `receiverDocument` preserva o envelope e a
 * máscara já gravados — as duas colunas só entram no set quando o novo envelope existe, para o
 * `onConflictDoUpdate` não anular um documento já selado. Exportada para o contrato de teste.
 */
export function buildProofUpsertSet(input: SaveProofInput) {
  const base = {
    accuracyMeters: input.accuracyMeters,
    actorUserId: input.actorUserId,
    attachmentKey: input.attachmentKey,
    capturedAt: input.capturedAt,
    channel: input.authorship.channel,
    latitude: input.latitude,
    longitude: input.longitude,
    objectId: input.objectId,
    onBehalfOfDriverId: input.authorship.onBehalfOfDriverId,
    punctuality: input.punctuality,
    receiverName: input.receiverName,
  }
  /** O AAD do envelope preservado está amarrado ao `id` antigo — o id fica junto com ele. */
  if (input.receiverDocumentEnvelope === null) return base

  return {
    ...base,
    id: input.id,
    receiverDocumentEnvelope: input.receiverDocumentEnvelope,
    receiverDocumentMasked: input.receiverDocumentMasked,
  }
}

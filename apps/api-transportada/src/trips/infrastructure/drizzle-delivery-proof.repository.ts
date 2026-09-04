/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'
import { and, desc, eq, inArray } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingOverrides,
} from '../../database/company-delivery-proof-settings.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  tripDeliveryProofs,
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  trips,
} from '../../database/trip.schema.js'
import type { DeliveryProofPort } from '../application/attach-delivery-proof.use-case.js'
import {
  resolveProofSettingsForRecipient,
  type DeliveryProofFieldSettings,
} from '../domain/delivery-proof-settings.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * As viagens que o motorista ainda alcança. `completed` entra: a viagem fecha e o canhoto (ou a
 * ocorrência) ainda chega — quem estava na rua nem sempre tem sinal na hora.
 *
 * Exportada porque a ocorrência do motorista usa **o mesmo recorte** (spec 079): duplicar a lista
 * deixaria uma das duas aceitar viagem que a outra recusa, sem nada falhar.
 */
export const ACTIVE_TRIP_STATUSES = ['dispatched', 'in_transit', 'completed'] as const

export class DrizzleDeliveryProofRepository implements DeliveryProofPort {
  public constructor(private readonly database: Database) {}

  /**
   * O comprovante prende no **evento de entrega deste motorista**, não na nota: é o que separa "o
   * canhoto desta entrega" de "um arquivo qualquer ligado a uma nota". A viagem já concluída entra
   * na lista de propósito — o motorista fotografa o canhoto depois de fechar a última parada.
   */
  public async findDeliveryEventId(input: {
    readonly companyId: string
    readonly documentId: string
    readonly driverId: string
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
      .innerJoin(
        tripDrivers,
        and(eq(tripDrivers.companyId, trips.companyId), eq(tripDrivers.tripId, trips.id)),
      )
      .where(
        and(
          eq(tripStopEvents.companyId, input.companyId),
          eq(tripStopEvents.tripDocumentId, input.documentId),
          eq(tripStopEvents.kind, 'delivered'),
          eq(tripDrivers.driverId, input.driverId),
          inArray(trips.status, [...ACTIVE_TRIP_STATUSES]),
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
          eq(nfeParticipants.role, 'recipient'),
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
   * Spec 082 (revisão, item 5): reenvio com a mesma `attachmentKey` para o mesmo documento+tipo é
   * retry de rede, não correção — a linha existente responde e nada é regravado.
   */
  public async findProofIdByAttachmentKey(input: {
    readonly attachmentKey: string
    readonly companyId: string
    readonly eventId: string
    readonly kind: 'photo' | 'signature'
  }): Promise<string | null> {
    const [record] = await this.database
      .select({ id: tripDeliveryProofs.id })
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

    return record?.id ?? null
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
          actorUserId: input.actorUserId,
          attachmentKey: input.attachmentKey,
          companyId: input.companyId,
          id: input.id,
          kind: input.kind,
          objectId: input.objectId,
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
  readonly actorUserId: string
  /** Spec 082 (revisão, item 5): chave de idempotência do anexo. Vazio quando o app não a manda. */
  readonly attachmentKey: string
  readonly companyId: string
  readonly eventId: string
  readonly id: string
  readonly kind: 'photo' | 'signature'
  readonly mimeType: string
  readonly objectId: string
  readonly objectKey: string
  readonly receiverDocumentEnvelope: SecretEnvelopeV1 | null
  readonly receiverDocumentMasked: string
  readonly receiverName: string
  readonly sha256: string
  readonly sizeBytes: number
}

/**
 * Spec 082 (revisão, item 4): recaptura que chega sem `receiverDocument` preserva o envelope e a
 * máscara já gravados — as duas colunas só entram no set quando o novo envelope existe, para o
 * `onConflictDoUpdate` não anular um documento já selado. Exportada para o contrato de teste.
 */
export function buildProofUpsertSet(input: SaveProofInput) {
  const base = {
    actorUserId: input.actorUserId,
    attachmentKey: input.attachmentKey,
    objectId: input.objectId,
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

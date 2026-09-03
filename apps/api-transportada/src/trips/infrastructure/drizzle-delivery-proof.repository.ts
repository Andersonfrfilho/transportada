/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray } from 'drizzle-orm'

import { storedObjects } from '../../database/storage.schema.js'
import {
  tripDeliveryProofs,
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  trips,
} from '../../database/trip.schema.js'
import type { DeliveryProofPort } from '../application/attach-delivery-proof.use-case.js'

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

  /** O objeto e o vínculo entram na mesma transação: byte no bucket sem dono é lixo que ninguém acha. */
  public async saveProof(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly eventId: string
    readonly kind: 'photo' | 'signature'
    readonly mimeType: string
    readonly objectId: string
    readonly objectKey: string
    readonly receiverName: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<{ readonly id: string }> {
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
          companyId: input.companyId,
          kind: input.kind,
          objectId: input.objectId,
          receiverName: input.receiverName,
          stopEventId: input.eventId,
        })
        /** Segundo envio do mesmo tipo é correção: a foto tremida vira a boa, sem duplicar linha. */
        .onConflictDoUpdate({
          set: {
            actorUserId: input.actorUserId,
            objectId: input.objectId,
            receiverName: input.receiverName,
          },
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

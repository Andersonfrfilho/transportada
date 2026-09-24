/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 179 T201/T202: o link entre a URL assinada e a viagem (`trip_occurrence_uploads`), e a
 * confirmação que grava o `stored_objects` de verdade — as duas coisas na mesma transação, para não
 * existir estado "confirmado sem objeto" nem "objeto sem confirmação".
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { resolveOccurrenceAttachmentRetentionUntil } from '../domain/occurrence-attachment.policy.js'
import { storedObjects } from '../../database/storage.schema.js'
import { tripOccurrenceUploads } from '../../database/trip.schema.js'
import type { OccurrenceUploadAttachmentPort } from '../application/resolve-occurrence-upload-attachment.use-case.js'
import type {
  OccurrenceUploadConfirmationPort,
  PendingOccurrenceUpload,
} from '../application/confirm-occurrence-upload.use-case.js'
import type { OccurrenceUploadRequestPort } from '../application/create-occurrence-upload.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleOccurrenceUploadRepository
  implements
    OccurrenceUploadRequestPort,
    OccurrenceUploadConfirmationPort,
    OccurrenceUploadAttachmentPort
{
  public constructor(private readonly database: Database) {}

  public async insertPendingUpload(input: {
    readonly bucket: string
    readonly companyId: string
    readonly declaredSizeBytes: number
    readonly driverId: string
    readonly expiresAt: Date
    readonly id: string
    readonly mimeType: string
    readonly objectKey: string
    readonly tripId: string
  }): Promise<void> {
    await this.database.insert(tripOccurrenceUploads).values({
      bucket: input.bucket,
      companyId: input.companyId,
      declaredSizeBytes: BigInt(input.declaredSizeBytes),
      driverId: input.driverId,
      expiresAt: input.expiresAt,
      id: input.id,
      mimeType: input.mimeType,
      objectKey: input.objectKey,
      status: 'pending',
      tripId: input.tripId,
    })
  }

  public async findPendingUpload(input: {
    readonly companyId: string
    readonly id: string
    readonly tripId: string
  }): Promise<null | PendingOccurrenceUpload> {
    const [row] = await this.database
      .select({
        bucket: tripOccurrenceUploads.bucket,
        expiresAt: tripOccurrenceUploads.expiresAt,
        mimeType: tripOccurrenceUploads.mimeType,
        objectKey: tripOccurrenceUploads.objectKey,
      })
      .from(tripOccurrenceUploads)
      .where(
        and(
          eq(tripOccurrenceUploads.companyId, input.companyId),
          eq(tripOccurrenceUploads.id, input.id),
          eq(tripOccurrenceUploads.tripId, input.tripId),
          eq(tripOccurrenceUploads.status, 'pending'),
        ),
      )
      .limit(1)

    return row ?? null
  }

  /**
   * Achado [2] da revisão de 23/09: o `UPDATE` roda **primeiro** e condicionado a `status =
   * 'pending'` — é ele quem decide qual das duas chamadas concorrentes é a dona da confirmação.
   * Quando ele não afeta nenhuma linha (outra transação já venceu a corrida entre a leitura em
   * `findPendingUpload` e este `UPDATE`), a transação some sem tentar o `INSERT`: as duas
   * concorrentes inserindo `stored_objects` com o mesmo `id` (PK) era a violação de unicidade que
   * virava 500. Só a vencedora chega ao `INSERT`.
   */
  public async confirmUpload(input: {
    readonly bucket: string
    readonly companyId: string
    readonly id: string
    readonly mimeType: string
    readonly now: Date
    readonly objectKey: string
    readonly sha256: string
    readonly sizeBytes: number
  }): Promise<{ readonly confirmed: boolean }> {
    return this.database.transaction(async (transaction) => {
      const updated = await transaction
        .update(tripOccurrenceUploads)
        .set({ confirmedAt: input.now, status: 'confirmed' })
        .where(
          and(
            eq(tripOccurrenceUploads.companyId, input.companyId),
            eq(tripOccurrenceUploads.id, input.id),
            eq(tripOccurrenceUploads.status, 'pending'),
          ),
        )
        .returning({ id: tripOccurrenceUploads.id })

      if (updated.length === 0) return { confirmed: false }

      await transaction.insert(storedObjects).values({
        bucket: input.bucket,
        companyId: input.companyId,
        id: input.id,
        mimeType: input.mimeType,
        objectKey: input.objectKey,
        provider: 's3',
        purpose: 'trip_occurrence_attachment',
        retentionUntil: resolveOccurrenceAttachmentRetentionUntil(input.now),
        sha256: input.sha256,
        sizeBytes: BigInt(input.sizeBytes),
        status: 'final',
      })

      return { confirmed: true }
    })
  }

  public async findConfirmedUpload(input: {
    readonly companyId: string
    readonly id: string
    readonly tripId: string
  }): Promise<null | { readonly id: string }> {
    const [row] = await this.database
      .select({ id: tripOccurrenceUploads.id })
      .from(tripOccurrenceUploads)
      .where(
        and(
          eq(tripOccurrenceUploads.companyId, input.companyId),
          eq(tripOccurrenceUploads.id, input.id),
          eq(tripOccurrenceUploads.tripId, input.tripId),
          eq(tripOccurrenceUploads.status, 'confirmed'),
        ),
      )
      .limit(1)

    return row ?? null
  }
}

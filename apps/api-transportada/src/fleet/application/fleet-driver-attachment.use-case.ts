/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomUUID } from 'node:crypto'

import type { FleetDriverAttachmentType } from '../../database/fleet-driver-attachment.schema.js'
import { AGGREGATE_STORAGE_PROVIDER } from '../domain/aggregate-storage.constant.js'
import { FleetDriverAttachmentNotFoundError } from '../domain/fleet-driver-attachment.error.js'
import {
  assertFleetDriverAttachmentUpload,
  buildFleetDriverAttachmentObjectKey,
} from '../domain/fleet-driver-attachment.policy.js'
import { FleetDriverNotFoundError } from '../domain/fleet.error.js'
import type {
  FleetDriverAttachment,
  FleetDriverAttachmentRepositoryPort,
  FleetDriverAttachmentStoragePort,
} from './fleet-driver-attachment.port.js'

type Dependencies = {
  readonly bucket: string
  readonly repository: FleetDriverAttachmentRepositoryPort
  readonly storage: FleetDriverAttachmentStoragePort
}

/** Vida curta: o link é uma credencial para o documento de uma pessoa, e não vira endereço. */
const REVEAL_EXPIRY_SECONDS = 300

export type FleetDriverAttachmentUseCase = Readonly<{
  attach: (input: {
    readonly bytes: Uint8Array
    readonly companyId: string
    readonly declaredMimeType: string
    readonly driverId: string
    readonly fileName: string
    readonly type: FleetDriverAttachmentType
    readonly uploadedBy: string
  }) => Promise<FleetDriverAttachment>
  remove: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly driverId: string
  }) => Promise<void>
  reveal: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly driverId: string
  }) => Promise<{ readonly url: string }>
}>

export function createFleetDriverAttachmentUseCase(
  dependencies: Dependencies,
): FleetDriverAttachmentUseCase {
  return {
    async attach({ bytes, companyId, declaredMimeType, driverId, fileName, type, uploadedBy }) {
      const mimeType = assertFleetDriverAttachmentUpload({ bytes, declaredMimeType, fileName })
      if (!(await dependencies.repository.driverExists({ companyId, driverId }))) {
        throw new FleetDriverNotFoundError()
      }

      const storedObjectId = randomUUID()
      const key = buildFleetDriverAttachmentObjectKey({
        companyId,
        driverId,
        objectId: storedObjectId,
        type,
      })
      const sha256 = createHash('sha256').update(bytes).digest('hex')

      // O arquivo primeiro: linha sem objeto é documento que a tela mostra e ninguém consegue abrir.
      await dependencies.storage.storeObject({
        body: bytes,
        bucket: dependencies.bucket,
        contentLength: bytes.byteLength,
        contentType: mimeType,
        key,
        sha256,
      })

      try {
        return await dependencies.repository.create({
          bucket: dependencies.bucket,
          companyId,
          driverId,
          mimeType,
          objectKey: key,
          provider: AGGREGATE_STORAGE_PROVIDER,
          sha256,
          sizeBytes: bytes.byteLength,
          storedObjectId,
          type,
          uploadedBy,
        })
      } catch (error: unknown) {
        // Quem perde a corrida apaga o que acabou de subir: objeto sem linha é PII que ninguém acha.
        await Promise.allSettled([
          dependencies.storage.deleteObject({ bucket: dependencies.bucket, key }),
        ])
        throw error
      }
    },

    async remove({ attachmentId, companyId, driverId }) {
      const location = await dependencies.repository.findLocation({
        attachmentId,
        companyId,
        driverId,
      })
      if (location === null) throw new FleetDriverAttachmentNotFoundError()

      // O bucket antes da linha: se o banco falhar depois, a linha aponta para nada e repetir o
      // pedido fecha o ciclo. No sentido contrário sobraria objeto sem dono, e ninguém o procuraria.
      await dependencies.storage.deleteObject({
        bucket: location.bucket,
        key: location.objectKey,
      })
      await dependencies.repository.remove({ attachmentId, companyId, driverId })
    },

    async reveal({ attachmentId, companyId, driverId }) {
      const location = await dependencies.repository.findLocation({
        attachmentId,
        companyId,
        driverId,
      })
      if (location === null) throw new FleetDriverAttachmentNotFoundError()

      const url = await dependencies.storage.createSignedDownload({
        bucket: location.bucket,
        expiresInSeconds: REVEAL_EXPIRY_SECONDS,
        key: location.objectKey,
      })
      return { url: url.toString() }
    },
  }
}

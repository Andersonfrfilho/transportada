/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash, randomUUID } from 'node:crypto'

import type {
  FleetDriverAttachmentDecision,
  FleetDriverAttachmentType,
} from '../../database/fleet-driver-attachment.schema.js'
import { AGGREGATE_STORAGE_PROVIDER } from '../domain/aggregate-storage.constant.js'
import {
  FleetDriverAttachmentNotFoundError,
  FleetDriverAttachmentSuggestionDecidedError,
} from '../domain/fleet-driver-attachment.error.js'
import {
  assertFleetDriverAttachmentUpload,
  buildFleetDriverAttachmentObjectKey,
  isSingleDocumentType,
} from '../domain/fleet-driver-attachment.policy.js'
import { FleetDriverNotFoundError } from '../domain/fleet.error.js'
import type {
  FleetDriverAttachment,
  FleetDriverAttachmentAuditPort,
  FleetDriverAttachmentListItem,
  FleetDriverAttachmentRepositoryPort,
  FleetDriverAttachmentStoragePort,
  FleetDriverAttachmentSuggestionFields,
} from './fleet-driver-attachment.port.js'

type Dependencies = {
  readonly audit: FleetDriverAttachmentAuditPort
  readonly bucket: string
  readonly logger: { readonly warn: (message: string, meta: Record<string, unknown>) => void }
  readonly repository: FleetDriverAttachmentRepositoryPort
  readonly storage: FleetDriverAttachmentStoragePort
}

/** Vida curta: o link é uma credencial para o documento de uma pessoa, e não vira endereço. */
const REVEAL_EXPIRY_SECONDS = 300
const OBJECT_CLEANUP_FAILED_LOG = 'fleet driver attachment object cleanup failed'

type AuditContext = Readonly<{ actorUserId: string; clientIp: string; correlationId: string }>

export type FleetDriverAttachmentUseCase = Readonly<{
  attach: (input: {
    readonly bytes: Uint8Array
    readonly clientIp: string
    readonly companyId: string
    readonly correlationId: string
    readonly declaredMimeType: string
    readonly driverId: string
    readonly fileName: string
    readonly type: FleetDriverAttachmentType
    readonly uploadedBy: string
  }) => Promise<FleetDriverAttachment>
  decideSuggestion: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly decidedBy: string
    readonly decision: FleetDriverAttachmentDecision
    readonly driverId: string
  }) => Promise<{ readonly decision: FleetDriverAttachmentDecision }>
  /** Para quem remove a ficha: linhas na transação, objetos do bucket só depois do commit. */
  discardDriverAttachments: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<void>
  list: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<readonly FleetDriverAttachmentListItem[]>
  readSuggestion: (input: {
    readonly attachmentId: string
    readonly companyId: string
    readonly driverId: string
  }) => Promise<{ readonly fields: FleetDriverAttachmentSuggestionFields | null }>
  remove: (
    input: AuditContext & {
      readonly attachmentId: string
      readonly companyId: string
      readonly driverId: string
    },
  ) => Promise<void>
  reveal: (
    input: AuditContext & {
      readonly attachmentId: string
      readonly companyId: string
      readonly driverId: string
    },
  ) => Promise<{ readonly url: string }>
}>

export function createFleetDriverAttachmentUseCase(
  dependencies: Dependencies,
): FleetDriverAttachmentUseCase {
  return {
    async attach({
      bytes,
      clientIp,
      companyId,
      correlationId,
      declaredMimeType,
      driverId,
      fileName,
      type,
      uploadedBy,
    }) {
      const mimeType = assertFleetDriverAttachmentUpload({ bytes, declaredMimeType, fileName })
      if (!(await dependencies.repository.driverExists({ companyId, driverId }))) {
        throw new FleetDriverNotFoundError()
      }

      const previous = isSingleDocumentType(type)
        ? await dependencies.repository.findByType({ companyId, driverId, type })
        : null
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

      let attachment: FleetDriverAttachment
      try {
        attachment = await dependencies.repository.create({
          bucket: dependencies.bucket,
          companyId,
          correlationId,
          driverId,
          mimeType,
          objectKey: key,
          provider: AGGREGATE_STORAGE_PROVIDER,
          ...(previous === null ? {} : { replaceAttachmentId: previous.id }),
          sha256,
          sizeBytes: bytes.byteLength,
          storedObjectId,
          type,
          uploadedBy,
        })
      } catch (error: unknown) {
        // A troca é uma transação: se ela falha, o anterior segue de pé e só o objeto novo é descartado.
        await discardObject(dependencies, { bucket: dependencies.bucket, key })
        throw error
      }

      // Depois do commit: objeto anterior sem linha é órfão tolerável; linha sem objeto não é.
      if (previous !== null) {
        await discardObject(dependencies, {
          bucket: previous.location.bucket,
          key: previous.location.objectKey,
        })
      }
      await dependencies.audit.record({
        action: previous === null ? 'attached' : 'replaced',
        actorUserId: uploadedBy,
        attachmentId: attachment.id,
        clientIp,
        companyId,
        correlationId,
        driverId,
        type,
      })
      return attachment
    },

    async remove({ actorUserId, attachmentId, clientIp, companyId, correlationId, driverId }) {
      const location = await dependencies.repository.findLocation({
        attachmentId,
        companyId,
        driverId,
      })
      if (location === null) throw new FleetDriverAttachmentNotFoundError()

      // A linha primeiro: objeto sem linha é órfão tolerável, linha sem objeto é documento que a tela
      // mostra e ninguém abre.
      if (!(await dependencies.repository.remove({ attachmentId, companyId, driverId }))) {
        throw new FleetDriverAttachmentNotFoundError()
      }
      await discardObject(dependencies, { bucket: location.bucket, key: location.objectKey })
      await dependencies.audit.record({
        action: 'removed',
        actorUserId,
        attachmentId,
        clientIp,
        companyId,
        correlationId,
        driverId,
        type: location.type,
      })
    },

    async discardDriverAttachments({ companyId, driverId }) {
      const locations = await dependencies.repository.removeAllForDriver({ companyId, driverId })
      for (const location of locations) {
        await discardObject(dependencies, { bucket: location.bucket, key: location.objectKey })
      }
    },

    async decideSuggestion(input) {
      const outcome = await dependencies.repository.decideSuggestion(input)
      if (outcome === 'not_found') throw new FleetDriverAttachmentNotFoundError()
      if (outcome === 'already_decided') throw new FleetDriverAttachmentSuggestionDecidedError()
      return { decision: input.decision }
    },

    async list({ companyId, driverId }) {
      if (!(await dependencies.repository.driverExists({ companyId, driverId }))) {
        throw new FleetDriverNotFoundError()
      }
      return dependencies.repository.list({ companyId, driverId })
    },

    async readSuggestion(input) {
      const read = await dependencies.repository.readSuggestion(input)
      if (!read.isFound) throw new FleetDriverAttachmentNotFoundError()
      return { fields: read.fields }
    },

    async reveal({ actorUserId, attachmentId, clientIp, companyId, correlationId, driverId }) {
      const location = await dependencies.repository.findLocation({
        attachmentId,
        companyId,
        driverId,
      })
      if (location === null) throw new FleetDriverAttachmentNotFoundError()

      const objectLocation = { bucket: location.bucket, key: location.objectKey }
      if ((await dependencies.storage.headObject(objectLocation)) === undefined) {
        throw new FleetDriverAttachmentNotFoundError()
      }

      // Antes de assinar: se a trilha falha, o link não sai.
      await dependencies.audit.record({
        action: 'revealed',
        actorUserId,
        attachmentId,
        clientIp,
        companyId,
        correlationId,
        driverId,
        type: location.type,
      })
      const url = await dependencies.storage.createSignedDownload({
        ...objectLocation,
        expiresInSeconds: REVEAL_EXPIRY_SECONDS,
      })
      return { url: url.toString() }
    },
  }
}

/** Melhor esforço: o banco já decidiu, e um objeto que sobra é só espaço — o log leva ids, nunca o conteúdo. */
async function discardObject(
  dependencies: Dependencies,
  location: { readonly bucket: string; readonly key: string },
): Promise<void> {
  try {
    await dependencies.storage.deleteObject(location)
  } catch {
    dependencies.logger.warn(OBJECT_CLEANUP_FAILED_LOG, {
      bucket: location.bucket,
      objectKey: location.key,
    })
  }
}

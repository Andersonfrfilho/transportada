/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (ADR-0007, ADR-0094 §7): enviar a prévia guarda o arquivo e enfileira a leitura. O
 * mesmo arquivo do mesmo contratante devolve a prévia que já existe (200); a mesma chave com outro
 * pedido é reuso (409). A API nunca abre a planilha.
 */
import { randomUUID } from 'node:crypto'

import { ContractorNotFoundError } from '../../delivery-clients/domain/delivery-client.error.js'
import {
  CargoPreviewKeyReusedError,
  CargoPreviewNotEnabledError,
  CargoPreviewNotFoundError,
} from '../domain/cargo-preview.error.js'
import {
  assertPreviewWorkbookBytes,
  buildCargoPreviewObjectKey,
  buildPreviewRequestFingerprint,
  sha256Hex,
} from '../domain/cargo-preview-upload.policy.js'
import type {
  CargoPreviewObjectStoragePort,
  CargoPreviewReadRepositoryPort,
  CargoPreviewUploadRepositoryPort,
} from './cargo-preview.port.js'
import type {
  CargoPreviewUploadGate,
  CreateCargoPreviewRecord,
  UploadCargoPreviewParams,
} from './cargo-preview-request.types.js'
import type { CargoPreviewSummary } from './cargo-preview.types.js'

/** O tipo vem dos bytes, e o nome do arquivo é do cliente: o objeto não finge saber mais que isso. */
const STORED_CONTENT_TYPE = 'application/octet-stream'

type Dependencies = {
  readonly bucket: string
  readonly now: () => Date
  readonly readRepository: CargoPreviewReadRepositoryPort
  readonly storage: CargoPreviewObjectStoragePort
  readonly uploadRepository: CargoPreviewUploadRepositoryPort
}

export type UploadCargoPreviewResult = {
  readonly isReplay: boolean
  readonly preview: CargoPreviewSummary
}

function assertGateIsOpen(gate: CargoPreviewUploadGate): string | undefined {
  switch (gate.kind) {
    case 'contractor_not_found':
      throw new ContractorNotFoundError()
    case 'key_reused':
      throw new CargoPreviewKeyReusedError()
    case 'not_enabled':
      throw new CargoPreviewNotEnabledError()
    case 'replayed':
      return gate.previewId
    case 'open':
      return undefined
  }
}

/** O objeto sobe antes da transação; se ela não criar a prévia, o objeto novo sai do bucket. */
async function storeAndRecord(
  dependencies: Dependencies,
  record: CreateCargoPreviewRecord & { readonly bytes: Uint8Array },
): Promise<{ readonly isReplay: boolean; readonly previewId: string }> {
  const location = { bucket: record.bucket, key: record.objectKey }
  await dependencies.storage.storeObject({
    ...location,
    body: record.bytes,
    contentLength: record.bytes.byteLength,
    contentType: STORED_CONTENT_TYPE,
    sha256: record.fileSha256,
  })
  const discard = () => dependencies.storage.deleteObject(location).catch(() => undefined)
  const result = await dependencies.uploadRepository.create(record).catch(async (error) => {
    await discard()
    throw error
  })
  if (result.kind !== 'created') await discard()
  if (result.kind === 'key_reused') throw new CargoPreviewKeyReusedError()
  return { isReplay: result.kind === 'replayed', previewId: result.previewId }
}

export function createUploadCargoPreviewUseCase(dependencies: Dependencies): {
  readonly execute: (params: UploadCargoPreviewParams) => Promise<UploadCargoPreviewResult>
} {
  return {
    async execute({ context, correlationId, idempotencyKey, input }) {
      assertPreviewWorkbookBytes(input.bytes)
      const fileSha256 = sha256Hex(input.bytes)
      const requestFingerprint = buildPreviewRequestFingerprint({
        contractorId: input.contractorId,
        fileSha256,
      })
      const scope = { companyId: context.companyId, contractorId: input.contractorId }
      const gate = await dependencies.uploadRepository.checkGate({
        ...scope,
        fileSha256,
        idempotencyKey,
        requestFingerprint,
      })
      const replayedId = assertGateIsOpen(gate)
      const fileObjectId = randomUUID()
      const outcome =
        replayedId !== undefined
          ? { isReplay: true, previewId: replayedId }
          : await storeAndRecord(dependencies, {
              ...scope,
              actorUserId: context.userId,
              bucket: dependencies.bucket,
              bytes: input.bytes,
              correlationId,
              fileName: input.fileName,
              fileObjectId,
              fileSha256,
              fileSizeBytes: input.bytes.byteLength,
              idempotencyKey,
              objectKey: buildCargoPreviewObjectKey({ companyId: context.companyId, fileObjectId }),
              receivedAt: dependencies.now(),
              requestFingerprint,
            })
      const preview = await dependencies.readRepository.findSummary({
        companyId: context.companyId,
        previewId: outcome.previewId,
      })
      if (preview === null) throw new CargoPreviewNotFoundError()
      return { isReplay: outcome.isReplay, preview }
    },
  }
}

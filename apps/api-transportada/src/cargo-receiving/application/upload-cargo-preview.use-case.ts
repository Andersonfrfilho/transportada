/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (ADR-0007, ADR-0094 §7): enviar a prévia guarda o arquivo e enfileira a leitura. O
 * mesmo arquivo do mesmo contratante devolve a prévia que já existe (200), salvo se ela falhou ou a
 * leitura se perdeu: aí a MESMA prévia reabre na fila (201, revisão da Fase 4a, M1). A mesma chave
 * com outro pedido é reuso (409). A API nunca abre a planilha.
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
  canReopenCargoPreview,
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
  ReplayedCargoPreview,
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

function assertGateIsOpen(gate: CargoPreviewUploadGate): ReplayedCargoPreview | undefined {
  switch (gate.kind) {
    case 'contractor_not_found':
      throw new ContractorNotFoundError()
    case 'key_reused':
      throw new CargoPreviewKeyReusedError()
    case 'not_enabled':
      throw new CargoPreviewNotEnabledError()
    case 'replayed':
      return gate
    case 'open':
      return undefined
  }
}

type Outcome = { readonly isReplay: boolean; readonly previewId: string }
type UploadContext = UploadCargoPreviewParams & {
  readonly fileSha256: string
  readonly requestFingerprint: string
}

/** O objeto sobe antes da transação; se ela não criar a prévia, o objeto novo sai do bucket. */
async function storeAndRecord(
  dependencies: Dependencies,
  record: CreateCargoPreviewRecord & { readonly bytes: Uint8Array },
): Promise<Outcome> {
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

function createPreview(dependencies: Dependencies, upload: UploadContext): Promise<Outcome> {
  const { context, input } = upload
  const fileObjectId = randomUUID()
  return storeAndRecord(dependencies, {
    actorUserId: context.userId,
    bucket: dependencies.bucket,
    bytes: input.bytes,
    companyId: context.companyId,
    contractorId: input.contractorId,
    correlationId: upload.correlationId,
    fileName: input.fileName,
    fileObjectId,
    fileSha256: upload.fileSha256,
    fileSizeBytes: input.bytes.byteLength,
    idempotencyKey: upload.idempotencyKey,
    objectKey: buildCargoPreviewObjectKey({ companyId: context.companyId, fileObjectId }),
    receivedAt: dependencies.now(),
    requestFingerprint: upload.requestFingerprint,
  })
}

/**
 * Os bytes voltam à chave da própria prévia (são os mesmos, pelo sha256): o objeto pode ser o que
 * sumiu. Nunca é apagado depois — é o arquivo da prévia, não um objeto novo.
 */
async function reopenPreview(
  dependencies: Dependencies,
  input: { readonly existing: ReplayedCargoPreview; readonly upload: UploadContext },
): Promise<Outcome> {
  const { context, input: file } = input.upload
  const objectKey = buildCargoPreviewObjectKey({
    companyId: context.companyId,
    fileObjectId: input.existing.fileObjectId,
  })
  await dependencies.storage.storeObject({
    body: file.bytes,
    bucket: dependencies.bucket,
    contentLength: file.bytes.byteLength,
    contentType: STORED_CONTENT_TYPE,
    key: objectKey,
    sha256: input.upload.fileSha256,
  })
  const reopened = await dependencies.uploadRepository.reopen({
    actorUserId: context.userId,
    bucket: dependencies.bucket,
    companyId: context.companyId,
    contractorId: file.contractorId,
    correlationId: input.upload.correlationId,
    fileSizeBytes: file.bytes.byteLength,
    now: dependencies.now(),
    objectKey,
    previewId: input.existing.previewId,
  })
  return { isReplay: !reopened, previewId: input.existing.previewId }
}

async function resolveOutcome(dependencies: Dependencies, upload: UploadContext): Promise<Outcome> {
  const gate = await dependencies.uploadRepository.checkGate({
    companyId: upload.context.companyId,
    contractorId: upload.input.contractorId,
    fileSha256: upload.fileSha256,
    idempotencyKey: upload.idempotencyKey,
    requestFingerprint: upload.requestFingerprint,
  })
  const existing = assertGateIsOpen(gate)
  if (existing === undefined) return createPreview(dependencies, upload)
  const now = dependencies.now()
  return canReopenCargoPreview({ ...existing, now })
    ? reopenPreview(dependencies, { existing, upload })
    : { isReplay: true, previewId: existing.previewId }
}

export function createUploadCargoPreviewUseCase(dependencies: Dependencies): {
  readonly execute: (params: UploadCargoPreviewParams) => Promise<UploadCargoPreviewResult>
} {
  return {
    async execute(params) {
      assertPreviewWorkbookBytes(params.input.bytes)
      const fileSha256 = sha256Hex(params.input.bytes)
      const requestFingerprint = buildPreviewRequestFingerprint({
        contractorId: params.input.contractorId,
        fileSha256,
      })
      const outcome = await resolveOutcome(dependencies, {
        ...params,
        fileSha256,
        requestFingerprint,
      })
      const preview = await dependencies.readRepository.findSummary({
        companyId: params.context.companyId,
        previewId: outcome.previewId,
      })
      if (preview === null) throw new CargoPreviewNotFoundError()
      return { isReplay: outcome.isReplay, preview }
    },
  }
}

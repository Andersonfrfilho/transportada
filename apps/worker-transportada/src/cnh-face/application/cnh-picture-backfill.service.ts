/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { AttachmentObjectReaderPort } from '../../aggregate-attachment/application/extract-attachment-fields.port.js'
import {
  applyCnhProfilePicture,
  CNH_PICTURE_OUTCOMES,
  type CnhPictureDependencies,
} from './apply-cnh-profile-picture.use-case.js'

export type CnhPictureBackfillCandidate = Readonly<{
  attachmentId: string
  bucket: string
  companyId: string
  objectKey: string
}>

export type CnhPictureBackfillSourcePort = Readonly<{
  /** CNH da ficha de motorista com usuário e sem foto de perfil; paginação por chave, nunca por posição. */
  listPending: (input: {
    readonly afterAttachmentId?: string
    readonly limit: number
  }) => Promise<readonly CnhPictureBackfillCandidate[]>
}>

export type CnhPictureBackfillMode = 'confirm' | 'dry-run'

/** Só contagens: o relatório do backfill nunca leva id de pessoa, de anexo nem conteúdo. */
export type CnhPictureBackfillResult = Readonly<{
  applied: number
  candidates: number
  failed: number
  keptExisting: number
  mode: CnhPictureBackfillMode
  objectMissing: number
  skipped: number
}>

const DEFAULT_BATCH_SIZE = 50

export type CnhPictureBackfillParams = Readonly<{
  batchSize?: number
  /** Só no `confirm`: o modo `dry-run` não lê objeto, não roda o detector e não chama a API. */
  picture?: CnhPictureDependencies
  mode: CnhPictureBackfillMode
  reader?: AttachmentObjectReaderPort
  source: CnhPictureBackfillSourcePort
}>

/**
 * Idempotente: quem já tem foto sai da lista pendente, e a API ainda recusa sobrescrever `self`/`admin`.
 * Um documento por vez e sem `Promise.all` de propósito: cada extração sobe uma thread com pdf.js e WASM, e
 * o teto de CPU do contêiner é o mesmo que a ADR-0053 protege.
 */
export async function runCnhPictureBackfill(
  params: CnhPictureBackfillParams,
): Promise<CnhPictureBackfillResult> {
  const batchSize = params.batchSize ?? DEFAULT_BATCH_SIZE
  const counts = {
    applied: 0,
    candidates: 0,
    failed: 0,
    keptExisting: 0,
    objectMissing: 0,
    skipped: 0,
  }
  let cursor: string | undefined

  for (;;) {
    const batch = await params.source.listPending({
      ...(cursor === undefined ? {} : { afterAttachmentId: cursor }),
      limit: batchSize,
    })
    if (batch.length === 0) break

    counts.candidates += batch.length
    cursor = batch.at(-1)?.attachmentId
    if (params.mode === 'confirm') await processBatch(batch, params, counts)
    if (batch.length < batchSize) break
  }

  return { ...counts, mode: params.mode }
}

async function processBatch(
  batch: readonly CnhPictureBackfillCandidate[],
  params: CnhPictureBackfillParams,
  counts: {
    applied: number
    failed: number
    keptExisting: number
    objectMissing: number
    skipped: number
  },
): Promise<void> {
  const { picture, reader } = params
  if (picture === undefined || reader === undefined) {
    throw new Error('confirm mode requires the picture dependencies and the object reader')
  }

  for (const candidate of batch) {
    const bytes = await reader.read({ bucket: candidate.bucket, key: candidate.objectKey })
    if (bytes === undefined) {
      counts.objectMissing += 1
      continue
    }
    const outcome = await applyCnhProfilePicture(
      { attachmentId: candidate.attachmentId, bytes, companyId: candidate.companyId },
      picture,
    )
    if (outcome === CNH_PICTURE_OUTCOMES.APPLIED) counts.applied += 1
    else if (outcome === CNH_PICTURE_OUTCOMES.KEPT_EXISTING) counts.keptExisting += 1
    else if (outcome === CNH_PICTURE_OUTCOMES.SKIPPED) counts.skipped += 1
    else counts.failed += 1
  }
}

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: os dois objetos (a planilha e o MIME bruto) sobem ao bucket ANTES da transação — o
 * bucket não participa dela — e o que a transação não deixar de pé sai do bucket. A prévia nasce pelo
 * mesmo contrato do upload (chave opaca, sha256, impressão do pedido); o resultado só leva ids e códigos.
 * A planilha tem chave aleatória só desta tentativa; o MIME tem a chave da mensagem e é de quem a registrou.
 */
import { RAW_EMAIL_MIME_TYPE } from '../../contractor-mail/domain/contractor-mail.constant.js'
import { buildRawEmailObjectKey } from '../../contractor-mail/domain/raw-email-object-key.policy.js'
import { buildCargoPreviewObjectKey } from '../../cargo-preview/domain/cargo-preview-object.policy.js'
import {
  PREVIEW_EMAIL_IDEMPOTENCY_PREFIX,
  PREVIEW_EMAIL_REJECTION,
} from '../domain/cargo-preview-email.constant.js'
import { buildPreviewRequestFingerprint, sha256Hex } from '../domain/preview-upload-file.policy.js'
import type {
  AcceptedRecord,
  CargoPreviewEmailIntakeInput,
  CargoPreviewEmailIntakeResult,
  CreatePreviewOutcome,
  IntakeCargoPreviewEmailDependencies,
  PreviewProfileRecord,
  VerifiedPreviewEmail,
} from './cargo-preview-email.types.js'

/** O tipo vem dos bytes, e o nome do arquivo é de quem mandou: o objeto não finge saber mais que isso. */
const STORED_FILE_CONTENT_TYPE = 'application/octet-stream'

type Location = { readonly bucket: string; readonly key: string }
type Context = {
  readonly dependencies: IntakeCargoPreviewEmailDependencies
  readonly input: CargoPreviewEmailIntakeInput
  readonly profile: PreviewProfileRecord
  readonly verified: VerifiedPreviewEmail
}

export async function storeAndCreatePreview(
  context: Context,
): Promise<CargoPreviewEmailIntakeResult> {
  const { dependencies } = context
  const record = buildRecord(context)
  const file = { bucket: record.file.bucket, key: record.file.objectKey }
  const raw = { bucket: record.raw.bucket, key: record.raw.key }
  const stored: Location[] = []
  const discard = (locations: readonly Location[]) =>
    Promise.allSettled(locations.map((location) => dependencies.storage.deleteObject(location)))

  try {
    await dependencies.storage.storeObject({
      ...file,
      body: context.verified.file.bytes,
      contentLength: record.file.sizeBytes,
      contentType: STORED_FILE_CONTENT_TYPE,
      sha256: record.file.sha256,
    })
    stored.push(file)
    await dependencies.storage.storeObject({
      ...raw,
      body: new Uint8Array(context.verified.raw),
      contentLength: record.raw.sizeBytes,
      contentType: RAW_EMAIL_MIME_TYPE,
      sha256: record.raw.sha256,
    })
    stored.push(raw)
    const outcome = await dependencies.repository.createPreview(record)
    await discard(leftover({ file, outcome, raw }))
    return toResult(context, outcome)
  } catch (error: unknown) {
    await discard(stored)
    throw error
  }
}

/**
 * Prévia criada fica com os dois objetos. Quem repete a mensagem perde só a planilha desta tentativa: o MIME
 * pertence a quem a registrou — e só sai quando ninguém o registrou (recusa por teto de abertas, ou um
 * registro anterior que também foi recusa).
 */
function leftover(input: {
  readonly file: Location
  readonly outcome: CreatePreviewOutcome
  readonly raw: Location
}): readonly Location[] {
  switch (input.outcome.kind) {
    case 'created':
      return []
    case 'replayed':
      return [input.file]
    case 'already_recorded':
      return input.outcome.isRawKept ? [input.file] : [input.file, input.raw]
    case 'too_many_open':
      return [input.file, input.raw]
  }
}

function toResult(context: Context, outcome: CreatePreviewOutcome): CargoPreviewEmailIntakeResult {
  const { contractorId } = context.profile
  const { dkimResult } = context.verified
  switch (outcome.kind) {
    case 'created':
      return { contractorId, dkimResult, kind: 'accepted', previewId: outcome.previewId }
    case 'replayed':
      return {
        contractorId,
        dkimResult,
        kind: 'replayed_existing',
        previewId: outcome.previewId,
        previewStatus: outcome.previewStatus,
      }
    case 'already_recorded':
      return { kind: 'already_recorded' }
    case 'too_many_open':
      return { contractorId, kind: 'rejected', reason: PREVIEW_EMAIL_REJECTION.tooManyOpenPreviews }
  }
}

function buildRecord(context: Context): AcceptedRecord {
  const { dependencies, input, profile, verified } = context
  const fileObjectId = dependencies.newId()
  const fileSha256 = sha256Hex(verified.file.bytes)
  return {
    companyId: input.companyId,
    contractorId: profile.contractorId,
    correlationId: input.correlationId,
    dkimResult: verified.dkimResult,
    file: {
      bucket: dependencies.storageBucket,
      fileName: verified.file.fileName,
      fileObjectId,
      idempotencyKey: `${PREVIEW_EMAIL_IDEMPOTENCY_PREFIX}${sha256Hex(input.providerEmailId)}`,
      objectKey: buildCargoPreviewObjectKey({ companyId: input.companyId, fileObjectId }),
      requestFingerprint: buildPreviewRequestFingerprint({
        contractorId: profile.contractorId,
        fileSha256,
      }),
      sha256: fileSha256,
      sizeBytes: verified.file.bytes.byteLength,
    },
    providerEmailId: input.providerEmailId,
    raw: {
      bucket: dependencies.storageBucket,
      key: buildRawEmailObjectKey({
        companyId: input.companyId,
        providerEmailId: input.providerEmailId,
      }),
      mimeType: RAW_EMAIL_MIME_TYPE,
      provider: dependencies.storageProvider,
      sha256: sha256Hex(verified.raw),
      sizeBytes: verified.raw.byteLength,
    },
    receivedAt: input.occurredAt,
  }
}

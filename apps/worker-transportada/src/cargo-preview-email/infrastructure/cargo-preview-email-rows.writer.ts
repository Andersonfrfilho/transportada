/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: as linhas que uma prévia por e-mail grava — prévia na fila, evento `uploaded` (canal
 * `worker`, sem ator humano) e pedido ao worker de prévia, como o upload da API, mais o registro do e-mail
 * e o MIME bruto. Só insere: quem decide (trava, idempotência, teto) é `cargo-preview-email-create.writer`.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cargoPreviewEmailIntakes } from '../../database/cargo-preview-email-intake.schema.js'
import {
  cargoPreviewEvents,
  cargoPreviewOutbox,
} from '../../database/cargo-preview-trail.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { storedObjects } from '../../database/stored-object.schema.js'
import {
  CARGO_PREVIEW_CHANNEL,
  CARGO_PREVIEW_EMAIL_OUTCOME,
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION,
  CARGO_PREVIEW_OUTBOX_EVENT,
  CARGO_PREVIEW_SOURCE,
  CARGO_PREVIEW_STATUS,
} from '../../shared/cargo-preview.constant.js'
import type { AcceptedRecord } from '../application/cargo-preview-email.types.js'
import { PREVIEW_EMAIL_REJECTION } from '../domain/cargo-preview-email.constant.js'
import {
  CargoPreviewEmailInsertReturnedNothingError,
  CargoPreviewEmailRawObjectNotRecordedError,
} from '../domain/cargo-preview-email.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const RAW_PURPOSE = 'contractor_mail_raw'

export async function insertPreview(
  transaction: Transaction,
  record: AcceptedRecord,
): Promise<string> {
  const [preview] = await transaction
    .insert(cargoPreviews)
    .values({
      companyId: record.companyId,
      contractorId: record.contractorId,
      fileName: record.file.fileName,
      fileObjectId: record.file.fileObjectId,
      fileSha256: record.file.sha256,
      fileSizeBytes: record.file.sizeBytes,
      idempotencyKey: record.file.idempotencyKey,
      receivedAt: record.receivedAt,
      requestFingerprint: record.file.requestFingerprint,
      source: CARGO_PREVIEW_SOURCE.email,
      status: CARGO_PREVIEW_STATUS.queued,
      uploadedByUserId: null,
    })
    .returning({ id: cargoPreviews.id })
  if (preview === undefined) throw new CargoPreviewEmailInsertReturnedNothingError()
  await transaction.insert(cargoPreviewEvents).values({
    channel: CARGO_PREVIEW_CHANNEL.worker,
    companyId: record.companyId,
    details: { fileSizeBytes: record.file.sizeBytes, source: CARGO_PREVIEW_SOURCE.email },
    kind: CARGO_PREVIEW_EVENT_KIND.uploaded,
    occurredAt: record.receivedAt,
    previewId: preview.id,
  })
  await transaction.insert(cargoPreviewOutbox).values({
    companyId: record.companyId,
    contractorId: record.contractorId,
    correlationId: record.correlationId,
    eventType: CARGO_PREVIEW_OUTBOX_EVENT.process,
    payload: {
      bucket: record.file.bucket,
      objectKey: record.file.objectKey,
      previewId: preview.id,
    },
    previewId: preview.id,
  })
  return preview.id
}

export async function insertIntake(
  transaction: Transaction,
  record: AcceptedRecord,
  result: { readonly isReplay: boolean; readonly previewId: string },
): Promise<void> {
  await transaction.insert(cargoPreviewEmailIntakes).values({
    companyId: record.companyId,
    contractorId: record.contractorId,
    forwarderDkimResult: record.dkimResult,
    isReplay: result.isReplay,
    originalSenderVerification: CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION.unverified,
    outcome: CARGO_PREVIEW_EMAIL_OUTCOME.accepted,
    previewId: result.previewId,
    providerEmailId: record.providerEmailId,
    rawObjectId: await insertRawObject(transaction, record),
    receivedAt: record.receivedAt,
  })
}

/** O teto de abertas recusa sem gravar o MIME: a mensagem registra o motivo e nada mais. */
export async function insertTooManyOpen(
  transaction: Transaction,
  record: AcceptedRecord,
): Promise<void> {
  await transaction.insert(cargoPreviewEmailIntakes).values({
    companyId: record.companyId,
    contractorId: record.contractorId,
    forwarderDkimResult: record.dkimResult,
    originalSenderVerification: CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION.unverified,
    outcome: CARGO_PREVIEW_EMAIL_OUTCOME.rejected,
    providerEmailId: record.providerEmailId,
    reasonCode: PREVIEW_EMAIL_REJECTION.tooManyOpenPreviews,
    receivedAt: record.receivedAt,
  })
}

async function insertRawObject(transaction: Transaction, record: AcceptedRecord): Promise<string> {
  const [row] = await transaction
    .insert(storedObjects)
    .values({
      bucket: record.raw.bucket,
      companyId: record.companyId,
      mimeType: record.raw.mimeType,
      objectKey: record.raw.key,
      provider: record.raw.provider,
      purpose: RAW_PURPOSE,
      sha256: record.raw.sha256,
      sizeBytes: BigInt(record.raw.sizeBytes),
      status: 'final',
    })
    .returning({ id: storedObjects.id })
  if (row === undefined) throw new CargoPreviewEmailRawObjectNotRecordedError()
  return row.id
}

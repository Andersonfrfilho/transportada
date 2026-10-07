/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: a prévia por e-mail nasce como a do upload (ADR-0007, ADR-0094 §8) — prévia na fila,
 * evento `uploaded` (canal `worker`, sem ator humano) e pedido ao worker de prévia na MESMA transação —,
 * mais o registro do e-mail e o MIME bruto. Toma a trava de envio do contratante, a mesma da API: nenhum
 * envio, por upload ou por e-mail, passa do teto de abertas nem duplica o arquivo junto com o outro.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, count, eq, inArray, sql } from 'drizzle-orm'

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
import type {
  AcceptedRecord,
  CreatePreviewOutcome,
} from '../application/cargo-preview-email.types.js'
import {
  buildCargoPreviewUploadLockKey,
  CARGO_PREVIEW_OPEN_LIMIT,
} from '../domain/preview-upload-file.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const RAW_PURPOSE = 'contractor_mail_raw'
const OPEN_STATUSES = [CARGO_PREVIEW_STATUS.queued, CARGO_PREVIEW_STATUS.processing]

export function createPreviewFromEmail(
  database: Database,
  record: AcceptedRecord,
): Promise<CreatePreviewOutcome> {
  return database.transaction(async (transaction) => {
    const lockKey = buildCargoPreviewUploadLockKey(record)
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
    if (await hasIntake(transaction, record)) return { kind: 'already_recorded' }

    const existing = await findPreviewByFile(transaction, record)
    if (existing !== undefined) {
      await insertIntake(transaction, record, { isReplay: true, previewId: existing })
      return { kind: 'replayed', previewId: existing }
    }
    if ((await countOpenPreviews(transaction, record)) >= CARGO_PREVIEW_OPEN_LIMIT) {
      await insertTooManyOpen(transaction, record)
      return { kind: 'too_many_open' }
    }
    const previewId = await insertPreview(transaction, record)
    await insertIntake(transaction, record, { isReplay: false, previewId })
    return { kind: 'created', previewId }
  })
}

async function hasIntake(transaction: Transaction, record: AcceptedRecord): Promise<boolean> {
  const [row] = await transaction
    .select({ id: cargoPreviewEmailIntakes.id })
    .from(cargoPreviewEmailIntakes)
    .where(
      and(
        eq(cargoPreviewEmailIntakes.companyId, record.companyId),
        eq(cargoPreviewEmailIntakes.providerEmailId, record.providerEmailId),
      ),
    )
    .limit(1)
  return row !== undefined
}

async function findPreviewByFile(
  transaction: Transaction,
  record: AcceptedRecord,
): Promise<string | undefined> {
  const [row] = await transaction
    .select({ id: cargoPreviews.id })
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, record.companyId),
        eq(cargoPreviews.contractorId, record.contractorId),
        eq(cargoPreviews.fileSha256, record.file.sha256),
      ),
    )
    .limit(1)
  return row?.id
}

async function countOpenPreviews(
  transaction: Transaction,
  record: AcceptedRecord,
): Promise<number> {
  const [row] = await transaction
    .select({ open: count() })
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, record.companyId),
        eq(cargoPreviews.contractorId, record.contractorId),
        inArray(cargoPreviews.status, OPEN_STATUSES),
      ),
    )
  return row?.open ?? 0
}

async function insertPreview(transaction: Transaction, record: AcceptedRecord): Promise<string> {
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
  if (preview === undefined) throw new Error('CARGO_PREVIEW_EMAIL_INSERT_RETURNED_NOTHING')
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

async function insertIntake(
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
async function insertTooManyOpen(transaction: Transaction, record: AcceptedRecord): Promise<void> {
  await transaction.insert(cargoPreviewEmailIntakes).values({
    companyId: record.companyId,
    contractorId: record.contractorId,
    forwarderDkimResult: record.dkimResult,
    originalSenderVerification: CARGO_PREVIEW_ORIGINAL_SENDER_VERIFICATION.unverified,
    outcome: CARGO_PREVIEW_EMAIL_OUTCOME.rejected,
    providerEmailId: record.providerEmailId,
    reasonCode: 'TOO_MANY_OPEN_PREVIEWS',
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
  if (row === undefined) throw new Error('CARGO_PREVIEW_EMAIL_RAW_OBJECT_NOT_FOUND')
  return row.id
}

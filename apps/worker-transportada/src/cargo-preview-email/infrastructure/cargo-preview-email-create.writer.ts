/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: a prévia por e-mail nasce como a do upload (ADR-0007, ADR-0094 §8) na MESMA transação do
 * registro do e-mail e do MIME bruto. Toma a trava de envio do contratante, a mesma da API: nenhum envio,
 * por upload ou por e-mail, passa do teto de abertas nem duplica o arquivo junto com o outro.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, count, eq, inArray, sql } from 'drizzle-orm'

import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { cargoPreviewEmailIntakes } from '../../database/cargo-preview-email-intake.schema.js'
import { storedObjects } from '../../database/stored-object.schema.js'
import {
  CARGO_PREVIEW_STATUS,
  type CargoPreviewStatus,
} from '../../shared/cargo-preview.constant.js'
import type {
  AcceptedRecord,
  CreatePreviewOutcome,
} from '../application/cargo-preview-email.types.js'
import {
  buildCargoPreviewUploadLockKey,
  CARGO_PREVIEW_OPEN_LIMIT,
} from '../domain/preview-upload-file.policy.js'
import {
  insertIntake,
  insertPreview,
  insertTooManyOpen,
  type Transaction,
} from './cargo-preview-email-rows.writer.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const OPEN_STATUSES = [CARGO_PREVIEW_STATUS.queued, CARGO_PREVIEW_STATUS.processing]

export function createPreviewFromEmail(
  database: Database,
  record: AcceptedRecord,
): Promise<CreatePreviewOutcome> {
  return database.transaction(async (transaction) => {
    const lockKey = buildCargoPreviewUploadLockKey(record)
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`)
    if (await hasIntake(transaction, record)) {
      return { isRawKept: await isRawObjectRecorded(transaction, record), kind: 'already_recorded' }
    }

    const existing = await findPreviewByFile(transaction, record)
    if (existing !== undefined) {
      await insertIntake(transaction, record, { isReplay: true, previewId: existing.id })
      return { kind: 'replayed', previewId: existing.id, previewStatus: existing.status }
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

/** O MIME da mensagem tem dono quando uma linha o registra; sem ela, o que esta tentativa subiu é só dela. */
async function isRawObjectRecorded(
  transaction: Transaction,
  record: AcceptedRecord,
): Promise<boolean> {
  const [row] = await transaction
    .select({ id: storedObjects.id })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, record.companyId),
        eq(storedObjects.bucket, record.raw.bucket),
        eq(storedObjects.objectKey, record.raw.key),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** O mesmo arquivo do contratante devolve a prévia que já existe, no estado em que ela está. */
async function findPreviewByFile(
  transaction: Transaction,
  record: AcceptedRecord,
): Promise<{ readonly id: string; readonly status: CargoPreviewStatus } | undefined> {
  const [row] = await transaction
    .select({ id: cargoPreviews.id, status: cargoPreviews.status })
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, record.companyId),
        eq(cargoPreviews.contractorId, record.contractorId),
        eq(cargoPreviews.fileSha256, record.file.sha256),
      ),
    )
    .limit(1)
  return row
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

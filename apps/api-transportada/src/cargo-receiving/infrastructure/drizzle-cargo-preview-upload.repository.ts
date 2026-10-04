/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.2 (ADR-0007): a prévia, o evento `uploaded` e o pedido de leitura ao worker na mesma
 * transação. Corrida com outro envio do mesmo arquivo ou da mesma chave cai no unique e vira
 * repetição — nunca uma segunda prévia.
 */
import { and, eq, isNotNull } from 'drizzle-orm'

import { cargoPreviewOutbox } from '../../database/cargo-preview-outbox.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { contractorReceivingProfiles } from '../../database/contractor-receiving-profile.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { findPostgresError } from '../../database/postgres-error.support.js'
import {
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_OUTBOX_EVENT,
  CARGO_PREVIEW_SOURCE,
} from '../../shared/cargo-preview.constant.js'
import type { CargoPreviewUploadRepositoryPort } from '../application/cargo-preview.port.js'
import type {
  CargoPreviewUploadGate,
  CreateCargoPreviewRecord,
  CreateCargoPreviewResult,
  ReopenCargoPreviewRecord,
  ReplayedCargoPreview,
} from '../application/cargo-preview-request.types.js'
import { reopenPreview } from './cargo-preview-reopen.writer.js'
import type { Database, Transaction } from './cargo-arrival-persistence.support.js'
import { insertOperatorEvents } from './cargo-preview-persistence.support.js'

const FILE_CONSTRAINT = 'cargo_previews_company_contractor_file_unique'
const KEY_CONSTRAINT = 'cargo_previews_company_idempotency_key_unique'

type GateParams = Parameters<CargoPreviewUploadRepositoryPort['checkGate']>[0]
type ExistingPreview = { readonly kind: 'key_reused' } | ReplayedCargoPreview

const EXISTING_COLUMNS = {
  fileObjectId: cargoPreviews.fileObjectId,
  id: cargoPreviews.id,
  status: cargoPreviews.status,
  updatedAt: cargoPreviews.updatedAt,
}

function toReplayed(row: {
  readonly fileObjectId: string
  readonly id: string
  readonly status: ReplayedCargoPreview['status']
  readonly updatedAt: Date
}): ReplayedCargoPreview {
  return { ...row, kind: 'replayed', previewId: row.id }
}

export class DrizzleCargoPreviewUploadRepository implements CargoPreviewUploadRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async checkGate(params: GateParams): Promise<CargoPreviewUploadGate> {
    const [contractor] = await this.database
      .select({ id: contractors.id })
      .from(contractors)
      .where(
        and(eq(contractors.companyId, params.companyId), eq(contractors.id, params.contractorId)),
      )
    if (contractor === undefined) return { kind: 'contractor_not_found' }
    const existing = await findExisting(this.database, params)
    if (existing !== undefined) return existing
    return (await hasPreviewProfile(this.database, params))
      ? { kind: 'open' }
      : { kind: 'not_enabled' }
  }

  public async create(record: CreateCargoPreviewRecord): Promise<CreateCargoPreviewResult> {
    try {
      return await this.database.transaction((transaction) => insertPreview(transaction, record))
    } catch (error) {
      const constraint = findPostgresError({ error })?.constraint
      if (constraint !== FILE_CONSTRAINT && constraint !== KEY_CONSTRAINT) throw error
      const existing = await findExisting(this.database, record)
      if (existing?.kind === 'replayed') return { kind: 'replayed', previewId: existing.previewId }
      return { kind: 'key_reused' }
    }
  }

  public reopen(record: ReopenCargoPreviewRecord): Promise<boolean> {
    return this.database.transaction((transaction) => reopenPreview(transaction, record))
  }
}

/** A chave primeiro (outro pedido com ela é reuso); depois o arquivo (o mesmo arquivo é repetição). */
async function findExisting(
  database: Database,
  params: Omit<GateParams, 'requestFingerprint'> & { readonly requestFingerprint: string },
): Promise<ExistingPreview | undefined> {
  const [byKey] = await database
    .select({ ...EXISTING_COLUMNS, fingerprint: cargoPreviews.requestFingerprint })
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, params.companyId),
        eq(cargoPreviews.idempotencyKey, params.idempotencyKey),
      ),
    )
  if (byKey !== undefined) {
    return byKey.fingerprint === params.requestFingerprint
      ? toReplayed(byKey)
      : { kind: 'key_reused' }
  }
  const [byFile] = await database
    .select(EXISTING_COLUMNS)
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, params.companyId),
        eq(cargoPreviews.contractorId, params.contractorId),
        eq(cargoPreviews.fileSha256, params.fileSha256),
      ),
    )
  return byFile === undefined ? undefined : toReplayed(byFile)
}

/** Perfil ligado, com prévia ligada e mapa de colunas: sem isso o worker não teria como ler. */
async function hasPreviewProfile(database: Database, params: GateParams): Promise<boolean> {
  const [profile] = await database
    .select({ id: contractorReceivingProfiles.id })
    .from(contractorReceivingProfiles)
    .where(
      and(
        eq(contractorReceivingProfiles.companyId, params.companyId),
        eq(contractorReceivingProfiles.contractorId, params.contractorId),
        eq(contractorReceivingProfiles.isEnabled, true),
        eq(contractorReceivingProfiles.previewEnabled, true),
        isNotNull(contractorReceivingProfiles.previewColumnMap),
      ),
    )
  return profile !== undefined
}

async function insertPreview(
  transaction: Transaction,
  record: CreateCargoPreviewRecord,
): Promise<CreateCargoPreviewResult> {
  const [preview] = await transaction
    .insert(cargoPreviews)
    .values({
      companyId: record.companyId,
      contractorId: record.contractorId,
      fileName: record.fileName,
      fileObjectId: record.fileObjectId,
      fileSha256: record.fileSha256,
      fileSizeBytes: record.fileSizeBytes,
      idempotencyKey: record.idempotencyKey,
      receivedAt: record.receivedAt,
      requestFingerprint: record.requestFingerprint,
      source: CARGO_PREVIEW_SOURCE.upload,
      uploadedByUserId: record.actorUserId,
    })
    .returning({ id: cargoPreviews.id })
  if (preview === undefined) throw new Error('CARGO_PREVIEW_INSERT_RETURNED_NOTHING')
  await insertOperatorEvents(transaction, [
    {
      actorUserId: record.actorUserId,
      companyId: record.companyId,
      details: { fileSizeBytes: record.fileSizeBytes },
      kind: CARGO_PREVIEW_EVENT_KIND.uploaded,
      occurredAt: record.receivedAt,
      previewId: preview.id,
    },
  ])
  await transaction.insert(cargoPreviewOutbox).values({
    companyId: record.companyId,
    contractorId: record.contractorId,
    correlationId: record.correlationId,
    eventType: CARGO_PREVIEW_OUTBOX_EVENT.process,
    payload: { bucket: record.bucket, objectKey: record.objectKey, previewId: preview.id },
    previewId: preview.id,
  })
  return { kind: 'created', previewId: preview.id }
}

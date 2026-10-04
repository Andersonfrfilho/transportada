/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o que o worker grava da prévia. A prévia é travada `FOR UPDATE` antes de mudar de
 * situação: duas entregas da mesma mensagem leem a planilha em paralelo, mas só a primeira grava —
 * a segunda encontra a prévia pronta e não faz nada. Nada de linha da planilha nos eventos.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { cargoPreviewItems, cargoPreviews } from '../../database/cargo-preview.schema.js'
import {
  cargoPreviewEvents,
  contractorReceivingProfiles,
} from '../../database/cargo-preview-trail.schema.js'
import {
  CARGO_PREVIEW_CHANNEL,
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_ITEM_STATE,
  CARGO_PREVIEW_STATUS,
  type CargoPreviewEventKind,
} from '../../shared/cargo-preview.constant.js'
import type {
  CargoPreviewWorkerRepositoryPort,
  PreviewScope,
} from '../application/cargo-preview-worker.port.js'
import { CargoPreviewValueOutOfRangeError } from '../application/cargo-preview-value-out-of-range.error.js'
import { readColumnMap } from '../domain/cargo-preview-items.policy.js'
import { matchContractorPreviews } from './cargo-preview-matching.writer.js'
import type { Transaction } from './cargo-preview-match.store.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Port = CargoPreviewWorkerRepositoryPort

const OPEN_STATUSES = [CARGO_PREVIEW_STATUS.queued, CARGO_PREVIEW_STATUS.processing]
const ITEM_BATCH_SIZE = 500
const NUMERIC_VALUE_OUT_OF_RANGE = '22003'
const MAX_CAUSE_DEPTH = 5

/** O SQLSTATE pode vir no `code` (postgres.js) ou no `errno` (Bun SQL), e embrulhado no `cause`. */
function isNumericOverflow(error: unknown, depth = 0): boolean {
  if (depth > MAX_CAUSE_DEPTH || typeof error !== 'object' || error === null) return false
  const candidate = error as {
    readonly cause?: unknown
    readonly code?: unknown
    readonly errno?: unknown
  }
  if (candidate.code === NUMERIC_VALUE_OUT_OF_RANGE) return true
  if (candidate.errno === NUMERIC_VALUE_OUT_OF_RANGE) return true
  return isNumericOverflow(candidate.cause, depth + 1)
}

function previewFilter(scope: PreviewScope) {
  return and(eq(cargoPreviews.companyId, scope.companyId), eq(cargoPreviews.id, scope.previewId))
}

/** Trava a prévia e devolve se ela ainda espera leitura — a outra entrega pode ter chegado antes. */
async function lockOpenPreview(tx: Transaction, scope: PreviewScope): Promise<boolean> {
  const [row] = await tx
    .select({ status: cargoPreviews.status })
    .from(cargoPreviews)
    .where(previewFilter(scope))
    .for('update')
  return row !== undefined && (OPEN_STATUSES as readonly string[]).includes(row.status)
}

function wideEvent(
  scope: PreviewScope & {
    readonly details: Readonly<Record<string, unknown>>
    readonly kind: CargoPreviewEventKind
    readonly now: Date
  },
) {
  return {
    channel: CARGO_PREVIEW_CHANNEL.worker,
    companyId: scope.companyId,
    details: scope.details,
    kind: scope.kind,
    occurredAt: scope.now,
    previewId: scope.previewId,
  }
}

async function insertItems(
  tx: Transaction,
  input: Parameters<Port['storeParsed']>[0],
): Promise<void> {
  const rows = input.plan.items.map((item) => ({
    ...item,
    companyId: input.companyId,
    previewId: input.previewId,
  }))
  const batches = Array.from({ length: Math.ceil(rows.length / ITEM_BATCH_SIZE) }, (_, index) =>
    rows.slice(index * ITEM_BATCH_SIZE, (index + 1) * ITEM_BATCH_SIZE),
  )
  await Promise.all(batches.map((batch) => tx.insert(cargoPreviewItems).values(batch)))
}

export class DrizzleCargoPreviewWorkerRepository implements Port {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async findPreview(scope: PreviewScope): ReturnType<Port['findPreview']> {
    const [row] = await this.#database
      .select({
        contractorId: cargoPreviews.contractorId,
        fileSha256: cargoPreviews.fileSha256,
        status: cargoPreviews.status,
      })
      .from(cargoPreviews)
      .where(previewFilter(scope))
    return row ?? null
  }

  async findReadingProfile(params: Parameters<Port['findReadingProfile']>[0]) {
    const [row] = await this.#database
      .select({
        columnMap: contractorReceivingProfiles.previewColumnMap,
        sheetName: contractorReceivingProfiles.previewSheetName,
      })
      .from(contractorReceivingProfiles)
      .where(
        and(
          eq(contractorReceivingProfiles.companyId, params.companyId),
          eq(contractorReceivingProfiles.contractorId, params.contractorId),
          eq(contractorReceivingProfiles.isEnabled, true),
          eq(contractorReceivingProfiles.previewEnabled, true),
        ),
      )
    const columnMap = readColumnMap(row?.columnMap)
    return row === undefined || columnMap === undefined
      ? null
      : { columnMap, sheetName: row.sheetName }
  }

  async markProcessing(scope: Parameters<Port['markProcessing']>[0]): Promise<void> {
    await this.#database
      .update(cargoPreviews)
      .set({ status: CARGO_PREVIEW_STATUS.processing, updatedAt: scope.now })
      .where(and(previewFilter(scope), eq(cargoPreviews.status, CARGO_PREVIEW_STATUS.queued)))
  }

  async markFailed(scope: Parameters<Port['markFailed']>[0]): Promise<void> {
    await this.#database.transaction(async (tx) => {
      if (!(await lockOpenPreview(tx, scope))) return
      await tx
        .update(cargoPreviews)
        .set({
          errorCode: scope.errorCode,
          status: CARGO_PREVIEW_STATUS.failed,
          updatedAt: scope.now,
        })
        .where(previewFilter(scope))
      const details = { errorCode: scope.errorCode }
      await tx
        .insert(cargoPreviewEvents)
        .values(wideEvent({ ...scope, details, kind: CARGO_PREVIEW_EVENT_KIND.failed }))
    })
  }

  async storeParsed(input: Parameters<Port['storeParsed']>[0]): ReturnType<Port['storeParsed']> {
    return this.#storeParsed(input).catch((error: unknown) => {
      throw isNumericOverflow(error) ? new CargoPreviewValueOutOfRangeError() : error
    })
  }

  #storeParsed(input: Parameters<Port['storeParsed']>[0]): ReturnType<Port['storeParsed']> {
    return this.#database.transaction(async (tx) => {
      if (!(await lockOpenPreview(tx, input))) return null
      await insertItems(tx, input)
      await tx
        .update(cargoPreviews)
        .set({
          plannedDate: input.plan.plannedDate,
          rowCount: input.plan.rowCount,
          sheetName: input.sheetName,
          status: CARGO_PREVIEW_STATUS.ready,
          updatedAt: input.now,
        })
        .where(previewFilter(input))
      const invalidCount = input.plan.items.filter(
        (item) => item.matchState === CARGO_PREVIEW_ITEM_STATE.invalid,
      ).length
      const details = { invalidCount, rowCount: input.plan.rowCount }
      await tx
        .insert(cargoPreviewEvents)
        .values(wideEvent({ ...input, details, kind: CARGO_PREVIEW_EVENT_KIND.parsed }))
      return matchContractorPreviews(tx, { ...input, previewIds: [input.previewId] })
    })
  }

  async reevaluate(params: Parameters<Port['reevaluate']>[0]): ReturnType<Port['reevaluate']> {
    return this.#database.transaction((tx) => matchContractorPreviews(tx, params))
  }
}

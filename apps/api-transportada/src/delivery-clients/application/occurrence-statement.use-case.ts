/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20 (RF29/RF30). Gerar acontece **uma vez, no fechamento do lote**; ler serve o arquivo
 * guardado. As duas operações moram aqui porque é a mesma regra vista dos dois lados: o que a
 * leitura devolve é exatamente o que o fechamento congelou.
 *
 * ⚠️ Esta spec entrega o PDF, **não** o envio automático à contratante — quem manda é a pessoa. O
 * envio automático depende da spec 143, ainda em aberto.
 *
 * ⚠️ Nada aqui escreve em `billing_*`, `cte_*`, `nfse_*` ou `fiscal_sequences`. O identificador do
 * documento é o id do lote; demonstrativo não consome numeração fiscal.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { mapWithConcurrencyLimit } from '../../shared/concurrent-map.service.js'
import type {
  OccurrenceStatementEvidence,
  OccurrenceStatementSourceRow,
} from '../domain/occurrence-statement-layout.policy.js'
import {
  OCCURRENCE_STATEMENT_PHOTO_CONCURRENCY,
  OCCURRENCE_STATEMENT_PHOTO_TIMEOUT_MS,
} from '../domain/occurrence-statement-limits.constant.js'
import { ExtraChargeBatchStatementNotFoundError } from '../domain/occurrence-statement.error.js'
import { ExtraChargeBatchNotFoundError } from './extra-charge-batches.use-case.js'
import {
  EXTRA_CHARGE_BATCH_STATEMENT_CONTENT_TYPE,
  EXTRA_CHARGE_BATCH_STATEMENT_RETENTION_DAYS,
  type OccurrenceStatementArchivePort,
  type OccurrenceStatementChargeRow,
  type OccurrenceStatementDocument,
  type OccurrenceStatementRepositoryPort,
} from './occurrence-statement.port.js'

const MILLISECONDS_PER_DAY = 86_400_000

export type OccurrenceStatementRendererPort = {
  readonly render: (input: {
    readonly batch: {
      readonly closedAt: Date
      readonly contractorName: string
      readonly id: string
      readonly periodEnd: string
      readonly periodStart: string
      readonly totalAmount: string
    }
    readonly carrier: { readonly legalName: string; readonly taxLine: string }
    readonly printedAt: Date
    readonly rows: readonly OccurrenceStatementSourceRow[]
  }) => Promise<{ readonly bytes: Buffer; readonly pageCount: number }>
}

export type OccurrenceStatementDependencies = {
  readonly archive: OccurrenceStatementArchivePort
  readonly clock: () => Date
  readonly createObjectId: () => string
  readonly renderer: OccurrenceStatementRendererPort
  readonly repository: OccurrenceStatementRepositoryPort
  readonly sha256: (bytes: Uint8Array) => string
}

export type OccurrenceStatementUseCase = {
  readonly generate: (input: {
    readonly batchId: string
    readonly companyId: string
  }) => Promise<void>
  readonly read: (input: {
    readonly batchId: string
    readonly context: CompanyContext
  }) => Promise<OccurrenceStatementDocument>
}

export function createOccurrenceStatementUseCase(
  dependencies: OccurrenceStatementDependencies,
): OccurrenceStatementUseCase {
  return {
    generate: (input) => generateStatement(dependencies, input),
    read: (input) =>
      readStatement(dependencies, { batchId: input.batchId, companyId: input.context.companyId }),
  }
}

async function generateStatement(
  dependencies: OccurrenceStatementDependencies,
  input: { readonly batchId: string; readonly companyId: string },
): Promise<void> {
  const batch = await dependencies.repository.findBatch(input)
  if (batch === null) throw new ExtraChargeBatchNotFoundError()
  /** Artefato imutável: lote que já tem demonstrativo não ganha outro. */
  if (batch.statementObjectId !== null) return

  const [carrier, chargeRows] = await Promise.all([
    dependencies.repository.findCarrier({ companyId: input.companyId }),
    dependencies.repository.listChargeRows(input),
  ])

  const rows = await resolveRows({ archive: dependencies.archive, chargeRows })
  const printedAt = dependencies.clock()
  const rendered = await dependencies.renderer.render({
    batch: {
      closedAt: batch.closedAt,
      contractorName: batch.contractorName,
      id: batch.id,
      periodEnd: batch.periodEnd,
      periodStart: batch.periodStart,
      totalAmount: batch.totalAmount,
    },
    carrier,
    printedAt,
    rows,
  })

  const objectId = dependencies.createObjectId()
  const sha256 = dependencies.sha256(rendered.bytes)
  const archived = await dependencies.archive.put({
    batchId: batch.id,
    bytes: rendered.bytes,
    companyId: input.companyId,
    contentType: EXTRA_CHARGE_BATCH_STATEMENT_CONTENT_TYPE,
    objectId,
    sha256,
  })

  await dependencies.repository.saveStatement({
    batchId: batch.id,
    bucket: archived.bucket,
    companyId: input.companyId,
    mimeType: EXTRA_CHARGE_BATCH_STATEMENT_CONTENT_TYPE,
    objectId,
    objectKey: archived.objectKey,
    provider: archived.provider,
    retentionUntil: new Date(
      printedAt.getTime() + EXTRA_CHARGE_BATCH_STATEMENT_RETENTION_DAYS * MILLISECONDS_PER_DAY,
    ),
    sha256,
    sizeBytes: BigInt(rendered.bytes.byteLength),
  })
}

async function readStatement(
  dependencies: OccurrenceStatementDependencies,
  input: { readonly batchId: string; readonly companyId: string },
): Promise<OccurrenceStatementDocument> {
  const batch = await dependencies.repository.findBatch(input)
  if (batch === null) throw new ExtraChargeBatchNotFoundError()

  const { statementObjectId } = batch
  if (statementObjectId === null) throw new ExtraChargeBatchStatementNotFoundError()

  const object = await dependencies.repository.findStatementObject({
    companyId: input.companyId,
    objectId: statementObjectId,
  })
  if (object === null) throw new ExtraChargeBatchStatementNotFoundError()

  const bytes = await dependencies.archive.loadObject({
    bucket: object.bucket,
    objectKey: object.objectKey,
  })
  if (bytes === null) throw new ExtraChargeBatchStatementNotFoundError()

  return {
    bytes,
    contentType: object.mimeType,
    fileName: `demonstrativo-ressarcimento-${batch.id}.pdf`,
  }
}

/**
 * ⚠️ Os downloads saem com concorrência limitada e prazo por foto: o prazo da própria geração é
 * critério de aceite, e cinquenta idas ao bucket em série não cabem nele.
 */
async function resolveRows(input: {
  readonly archive: OccurrenceStatementArchivePort
  readonly chargeRows: readonly OccurrenceStatementChargeRow[]
}): Promise<readonly OccurrenceStatementSourceRow[]> {
  const loaded = await mapWithConcurrencyLimit({
    concurrency: OCCURRENCE_STATEMENT_PHOTO_CONCURRENCY,
    items: input.chargeRows,
    map: async (row) => {
      const { photo } = row
      if (photo === null || photo.expired) return null
      return input.archive.loadObject({ bucket: photo.bucket, objectKey: photo.objectKey })
    },
    timeoutMs: OCCURRENCE_STATEMENT_PHOTO_TIMEOUT_MS,
  })

  return input.chargeRows.map((row, index) => ({
    accessKey: row.accessKey,
    amount: row.amount,
    chargeType: row.chargeType,
    chargedOn: row.chargedOn,
    clientName: row.clientName,
    evidence: resolveEvidence({ bytes: loaded[index] ?? null, row }),
    id: row.id,
    noteNumber: row.noteNumber,
    noteSeries: row.noteSeries,
    notes: row.notes,
    photoCount: row.photoCount,
    productCodes: row.productCodes,
  }))
}

function resolveEvidence(input: {
  readonly bytes: Uint8Array | null
  readonly row: OccurrenceStatementChargeRow
}): OccurrenceStatementEvidence {
  const { photo } = input.row
  if (photo === null) return { kind: 'none' }
  if (photo.expired) return { kind: 'expired' }
  if (input.bytes === null) return { kind: 'missing' }
  return { bytes: input.bytes, kind: 'image', mimeType: photo.mimeType }
}

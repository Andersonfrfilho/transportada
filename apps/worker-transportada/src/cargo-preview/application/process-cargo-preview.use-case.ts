/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: a leitura da prévia no worker. Baixa o objeto, confere o sha256, lê com o leitor da
 * parte A (cópia por valor da API, numa thread terminável), grava os itens e roda o primeiro vínculo.
 * Arquivo ruim é resultado — a prévia fica `failed` com o código e a mensagem fecha —; banco e bucket
 * fora do ar são falha de infraestrutura e voltam para a fila.
 */
import { createHash } from 'node:crypto'

import type { CargoPreviewProcessEnvelope } from '../../messaging/cargo-preview-envelope.schema.js'
import {
  CARGO_PREVIEW_STATUS,
  type CargoPreviewFailureCode,
} from '../../shared/cargo-preview.constant.js'
import {
  buildCargoPreviewObjectKey,
  CARGO_PREVIEW_OBJECT_MAX_BYTES,
} from '../domain/cargo-preview-object.policy.js'
import { CargoPreviewMatchTimeoutError } from './cargo-preview-match-timeout.error.js'
import { CargoPreviewValueOutOfRangeError } from './cargo-preview-value-out-of-range.error.js'
import type {
  CargoPreviewObjectReaderPort,
  CargoPreviewWorkbookReaderPort,
  CargoPreviewWorkerRepositoryPort,
  PreviewToProcess,
} from './cargo-preview-worker.port.js'

export type ProcessCargoPreviewDependencies = {
  /** O bucket privado da instalação, o mesmo em que a API grava. */
  readonly bucket: string
  readonly now: () => Date
  readonly reader: CargoPreviewObjectReaderPort
  readonly repository: CargoPreviewWorkerRepositoryPort
  readonly workbook: CargoPreviewWorkbookReaderPort
}

/** `redelivered`: o broker entrega de novo o que não foi confirmado — o processo caiu no meio. */
export type CargoPreviewDelivery = { readonly redelivered: boolean }

export type ProcessCargoPreviewOutcome = 'already_done' | 'failed' | 'missing' | 'ready'

const OPEN_STATUSES: ReadonlySet<string> = new Set([
  CARGO_PREVIEW_STATUS.queued,
  CARGO_PREVIEW_STATUS.processing,
])

/** A mensagem diz qual prévia; onde está o arquivo, e de que tamanho, quem diz é a linha dela. */
async function readVerifiedBytes(input: {
  readonly bucket: string
  readonly companyId: string
  readonly preview: PreviewToProcess
  readonly reader: CargoPreviewObjectReaderPort
}): Promise<Uint8Array | CargoPreviewFailureCode> {
  const key = buildCargoPreviewObjectKey({
    companyId: input.companyId,
    fileObjectId: input.preview.fileObjectId,
  })
  const bytes = await input.reader.read({
    bucket: input.bucket,
    key,
    maxBytes: CARGO_PREVIEW_OBJECT_MAX_BYTES,
  })
  if (bytes === undefined) return 'PREVIEW_FILE_MISSING'
  if (typeof bytes === 'string') return bytes
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  return sha256 === input.preview.fileSha256 ? bytes : 'PREVIEW_FILE_CORRUPTED'
}

/**
 * A reentrega de uma leitura que já começou é o processo que caiu no meio dela (memória, prazo do
 * broker): reler o mesmo arquivo derrubaria de novo. A prévia falha, e o reenvio do arquivo a reabre.
 */
export async function processCargoPreview(
  envelope: CargoPreviewProcessEnvelope,
  dependencies: ProcessCargoPreviewDependencies,
  delivery: CargoPreviewDelivery = { redelivered: false },
): Promise<ProcessCargoPreviewOutcome> {
  const scope = { companyId: envelope.companyId, previewId: envelope.payload.previewId }
  const preview = await dependencies.repository.findPreview(scope)
  if (preview === null) return 'missing'
  if (!OPEN_STATUSES.has(preview.status)) return 'already_done'
  const fail = async (errorCode: CargoPreviewFailureCode): Promise<'failed'> => {
    await dependencies.repository.markFailed({ ...scope, errorCode, now: dependencies.now() })
    return 'failed'
  }
  if (delivery.redelivered && preview.status === CARGO_PREVIEW_STATUS.processing) {
    return fail('PREVIEW_PROCESSING_INTERRUPTED')
  }
  await dependencies.repository.markProcessing({ ...scope, now: dependencies.now() })
  const profile = await dependencies.repository.findReadingProfile({
    companyId: scope.companyId,
    contractorId: preview.contractorId,
  })
  if (profile === null) return fail('PREVIEW_NOT_ENABLED')
  const bytes = await readVerifiedBytes({
    bucket: dependencies.bucket,
    companyId: scope.companyId,
    preview,
    reader: dependencies.reader,
  })
  if (typeof bytes === 'string') return fail(bytes)
  const reading = await dependencies.workbook.read({ bytes, profile })
  if ('code' in reading) return fail(reading.code)
  try {
    const stored = await dependencies.repository.storeParsed({
      ...scope,
      contractorId: preview.contractorId,
      now: dependencies.now(),
      plan: reading.plan,
      sheetName: profile.sheetName,
    })
    return stored === null ? 'already_done' : 'ready'
  } catch (error) {
    if (error instanceof CargoPreviewValueOutOfRangeError) return fail(error.code)
    if (error instanceof CargoPreviewMatchTimeoutError) return fail(error.code)
    throw error
  }
}

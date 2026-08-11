/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

import {
  NfeXmlImportError,
  type DfeItem,
  type ImportedNfeXml,
} from '@adatechnology/fiscal-provider'
import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import type { NfeFiscalEnvironment, NfeItemVariant } from '../../database/nfe.schema.js'
import type { NfeImportFinalStorage } from '../../nfe-imports/infrastructure/nfe-import-storage.gateway.js'
import type { NfeXmlImporter } from '../../nfe-imports/infrastructure/nfe-xml-importer.gateway.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { NfeDistributionRepositoryPort } from '../application/nfe-distribution-consumer.service.js'
import type {
  DistributionPersistItem,
  DistributionSummary,
} from './drizzle-nfe-distribution.repository.js'

const SUMMARY_SCHEMAS: ReadonlySet<string> = new Set(['resNFe', 'resEvento'])
const EVENT_SCHEMA = 'procEventoNFe'
// A SEFAZ manda o nome do arquivo do schema no docZip (`resEvento_v1.01.xsd`), versão e extensão
// inclusas; o pacote fiscal entrega cru
const SCHEMA_VERSION_SUFFIX = /_v\d+(?:\.\d+)*(?:\.xsd)?$/i
const ACCESS_KEY_PATTERN = /^[0-9]{44}$/
// O prefixo de namespace é opcional porque falhar aqui não derruba a página: a chave viraria nula
// em silêncio, e um resumo sem chave não serve para nada
const SUMMARY_ACCESS_KEY_ELEMENT =
  /<(?:[A-Za-z0-9._-]+:)?chNFe>\s*([0-9]{44})\s*<\/(?:[A-Za-z0-9._-]+:)?chNFe>/

type SkipReason = 'already_stored' | 'unsupported_document'

type PreparedSummary = {
  readonly accessKey: string | undefined
  readonly dfe: DfeItem
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
  readonly variant: 'summary'
}

type PreparedEvent = {
  readonly accessKey: string
  readonly normalizedXml: ImportedNfeXml
  readonly dfe: DfeItem
  readonly sequence: string
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
  readonly type: string
  readonly variant: 'event'
}

type PreparedDocument = {
  readonly accessKey: string
  readonly normalizedXml: ImportedNfeXml
  readonly dfe: DfeItem
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
  readonly variant: 'complete'
}

type PreparedItem = PreparedDocument | PreparedEvent | PreparedSummary

type DistributionPersistencePort = {
  finalizeImport(input: {
    readonly companyId: string
    readonly duplicatedCount: number
    readonly importId: string
    readonly importedCount: number
    readonly processedCount: number
    readonly receivedCount: number
    readonly status: 'completed'
  }): Promise<void>
  findStoredAccessKeys(input: {
    readonly accessKeys: readonly string[]
    readonly companyId: string
  }): Promise<readonly string[]>
  persistPage(input: {
    readonly companyId: string
    readonly environment: NfeFiscalEnvironment
    readonly importId: string
    readonly items: readonly DistributionPersistItem[]
    readonly maxNsu: string
    readonly ultNsu: string
  }): Promise<{ readonly acceptedCount: number; readonly duplicatedCount: number }>
}

type PersistenceAdapterDependencies = {
  readonly finalStorage: NfeImportFinalStorage
  readonly logger: WorkerLogger
  readonly repository: DistributionPersistencePort
  readonly xmlImporter: NfeXmlImporter
}

export function createNfeDistributionPersistenceAdapter(
  dependencies: PersistenceAdapterDependencies,
): NfeDistributionRepositoryPort {
  return {
    async finalizeImport(input): Promise<void> {
      await dependencies.repository.finalizeImport(input)
    },
    async persistPage(input): Promise<{
      readonly acceptedCount: number
      readonly duplicatedCount: number
      readonly skippedCount: number
    }> {
      const prepared = (
        await Promise.all(
          input.items.map((dfe) =>
            prepareItemOrSkip({
              companyId: input.companyId,
              dependencies,
              dfe,
              importId: input.importId,
            }),
          ),
        )
      ).filter((candidate): candidate is PreparedItem => candidate !== undefined)

      const storedAccessKeys = await findStoredAccessKeys({
        candidates: prepared,
        companyId: input.companyId,
        dependencies,
      })

      const built = await Promise.all(
        prepared.map((candidate) =>
          storeItemOrSkip({
            candidate,
            companyId: input.companyId,
            dependencies,
            importId: input.importId,
            storedAccessKeys,
          }),
        ),
      )
      const items = built.filter((item): item is DistributionPersistItem => item !== undefined)
      const result = await dependencies.repository.persistPage({
        companyId: input.companyId,
        environment: input.environment,
        importId: input.importId,
        items,
        maxNsu: input.maxNsu,
        ultNsu: input.ultNsu,
      })
      return {
        acceptedCount: result.acceptedCount,
        duplicatedCount: result.duplicatedCount,
        skippedCount: input.items.length - items.length,
      }
    },
  }
}

/**
 * Um documento que o pacote fiscal não sabe importar não pode derrubar a página inteira: sem cursor
 * gravado, o retry reconsulta o mesmo CNPJ e queima a janela de uma hora que a SEFAZ exige.
 */
async function prepareItemOrSkip(params: {
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
  readonly dfe: DfeItem
  readonly importId: string
}): Promise<PreparedItem | undefined> {
  try {
    return await prepareItem(params)
  } catch (error: unknown) {
    const skip = resolveSkip(error)
    if (skip === undefined) {
      throw error
    }

    logSkip({ ...params, errorCode: skip.errorCode, reason: skip.reason })
    return undefined
  }
}

/**
 * O XML só é lido e classificado aqui — nada disso toca o bucket, e é por isso que a checagem do que
 * já existe cabe entre esta etapa e a gravação.
 */
async function prepareItem(params: {
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
  readonly dfe: DfeItem
  readonly importId: string
}): Promise<PreparedItem> {
  const { dependencies, dfe } = params
  const sourceBytes = gunzipSync(Buffer.from(dfe.xmlComprimido, 'base64'))
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')
  const variant = classifyVariant(dfe.schema)

  if (variant === 'summary') {
    const accessKey = resolveSummaryAccessKey({ dfe, sourceBytes })
    return { accessKey, dfe, sourceBytes, sourceSha256, variant }
  }

  const xml = new TextDecoder().decode(sourceBytes)
  const normalizedXml = await dependencies.xmlImporter.importXml({ xml })

  if (variant === 'event') {
    if (normalizedXml.kind !== 'nfe-event') {
      throw new Error('NFE_DISTRIBUTION_EVENT_XML_MISMATCH')
    }
    return {
      accessKey: normalizedXml.event.accessKey,
      dfe,
      normalizedXml,
      sequence: String(normalizedXml.event.sequence),
      sourceBytes,
      sourceSha256,
      type: normalizedXml.event.type,
      variant,
    }
  }

  if (normalizedXml.kind === 'nfe-event') {
    throw new Error('NFE_DISTRIBUTION_DOCUMENT_XML_MISMATCH')
  }
  return {
    accessKey: normalizedXml.document.accessKey,
    dfe,
    normalizedXml,
    sourceBytes,
    sourceSha256,
    variant,
  }
}

/**
 * Uma pergunta por página, não uma por item: as chaves candidatas vão juntas e voltam só as que a
 * empresa já tem em `nfe_documents`.
 */
async function findStoredAccessKeys(params: {
  readonly candidates: readonly PreparedItem[]
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
}): Promise<ReadonlySet<string>> {
  const accessKeys = new Set<string>()
  for (const candidate of params.candidates) {
    if (candidate.variant !== 'event' && candidate.accessKey !== undefined) {
      accessKeys.add(candidate.accessKey)
    }
  }
  if (accessKeys.size === 0) {
    return new Set()
  }

  const stored = await params.dependencies.repository.findStoredAccessKeys({
    accessKeys: [...accessKeys],
    companyId: params.companyId,
  })
  return new Set(stored)
}

/**
 * A nota que a empresa já tem não é falha: é a mesma nota chegando de novo pela distribuição, e
 * reimportá-la não acrescenta nada. Um resumo de nota já completa seria até um rebaixamento.
 */
async function storeItemOrSkip(params: {
  readonly candidate: PreparedItem
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
  readonly importId: string
  readonly storedAccessKeys: ReadonlySet<string>
}): Promise<DistributionPersistItem | undefined> {
  const { candidate, storedAccessKeys } = params

  if (
    candidate.variant !== 'event' &&
    candidate.accessKey !== undefined &&
    storedAccessKeys.has(candidate.accessKey)
  ) {
    logSkip({
      accessKey: candidate.accessKey,
      companyId: params.companyId,
      dependencies: params.dependencies,
      dfe: candidate.dfe,
      importId: params.importId,
      reason: 'already_stored',
    })
    return undefined
  }

  try {
    return await storeItem(params)
  } catch (error: unknown) {
    const skip = resolveSkip(error)
    if (skip === undefined) {
      throw error
    }

    logSkip({
      companyId: params.companyId,
      dependencies: params.dependencies,
      dfe: candidate.dfe,
      errorCode: skip.errorCode,
      importId: params.importId,
      reason: skip.reason,
    })
    return undefined
  }
}

async function storeItem(params: {
  readonly candidate: PreparedItem
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
  readonly importId: string
}): Promise<DistributionPersistItem> {
  const { candidate, companyId, dependencies, importId } = params
  const { dfe, sourceBytes, sourceSha256 } = candidate

  if (candidate.variant === 'summary') {
    const finalObject = await dependencies.finalStorage.storeImportedSummary({
      accessKey: candidate.accessKey ?? `nsu-${dfe.nsu}`,
      companyId,
      importId,
      nsu: dfe.nsu,
      sourceBytes,
      sourceSha256,
    })
    return {
      finalObject,
      nsu: dfe.nsu,
      summary: buildSummary({ accessKey: candidate.accessKey, dfe }),
      variant: candidate.variant,
    }
  }

  if (candidate.variant === 'event') {
    const finalObject = await dependencies.finalStorage.storeImportedEvent({
      accessKey: candidate.accessKey,
      companyId,
      importId,
      sequence: candidate.sequence,
      sourceBytes,
      sourceSha256,
      type: candidate.type,
    })
    return {
      finalObject,
      normalizedXml: candidate.normalizedXml,
      nsu: dfe.nsu,
      variant: candidate.variant,
    }
  }

  const finalObject = await dependencies.finalStorage.storeImportedDocument({
    accessKey: candidate.accessKey,
    companyId,
    importId,
    sourceBytes,
    sourceSha256,
  })
  return {
    finalObject,
    normalizedXml: candidate.normalizedXml,
    nsu: dfe.nsu,
    variant: candidate.variant,
  }
}

/**
 * O conflito no bucket continua sendo pulo, e não falha — mas hoje ele é a última linha de defesa,
 * não a checagem principal.
 */
function resolveSkip(
  error: unknown,
): { readonly errorCode: string; readonly reason: SkipReason } | undefined {
  if (error instanceof NfeXmlImportError) {
    return { errorCode: error.code, reason: 'unsupported_document' }
  }
  if (
    error instanceof ObjectStorageError &&
    error.code === OBJECT_STORAGE_ERROR_CODES.objectConflict
  ) {
    return { errorCode: error.code, reason: 'already_stored' }
  }
  return undefined
}

function logSkip(params: {
  readonly accessKey?: string
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
  readonly dfe: DfeItem
  readonly errorCode?: string
  readonly importId: string
  readonly reason: SkipReason
}): void {
  params.dependencies.logger.warn('nfe_distribution_item_skipped', {
    ...(params.accessKey !== undefined ? { accessKey: params.accessKey } : {}),
    companyId: params.companyId,
    ...(params.errorCode !== undefined ? { errorCode: params.errorCode } : {}),
    importId: params.importId,
    nsu: params.dfe.nsu,
    reason: params.reason,
    schema: params.dfe.schema,
  })
}

/**
 * A chave da coluna `access_key` só aceita NULL ou 44 dígitos. O pacote fiscal nem sempre preenche
 * `chaveNfe` no resumo, e a chave verdadeira está no `<chNFe>` do próprio XML — sintetizar um valor
 * a partir do NSU violava o CHECK e derrubava a página inteira.
 */
function resolveSummaryAccessKey(params: {
  readonly dfe: DfeItem
  readonly sourceBytes: Uint8Array
}): string | undefined {
  const { dfe, sourceBytes } = params

  if (dfe.chaveNfe !== undefined && ACCESS_KEY_PATTERN.test(dfe.chaveNfe)) {
    return dfe.chaveNfe
  }

  const xml = new TextDecoder().decode(sourceBytes)
  return SUMMARY_ACCESS_KEY_ELEMENT.exec(xml)?.[1]
}

function buildSummary(params: {
  readonly accessKey: string | undefined
  readonly dfe: DfeItem
}): DistributionSummary {
  const { accessKey, dfe } = params
  return {
    ...(accessKey !== undefined ? { accessKey } : {}),
    ...(dfe.emitenteCnpj !== undefined ? { emitterCnpj: dfe.emitenteCnpj } : {}),
    ...(dfe.dataEmissao !== undefined ? { issuedAt: dfe.dataEmissao } : {}),
    ...(dfe.situacao !== undefined ? { situacao: dfe.situacao } : {}),
    ...(dfe.valorTotal !== undefined ? { totalValue: String(dfe.valorTotal) } : {}),
  }
}

function classifyVariant(schema: string): NfeItemVariant {
  const normalizedSchema = schema.replace(SCHEMA_VERSION_SUFFIX, '')

  if (SUMMARY_SCHEMAS.has(normalizedSchema)) {
    return 'summary'
  }
  if (normalizedSchema === EVENT_SCHEMA) {
    return 'event'
  }
  return 'complete'
}

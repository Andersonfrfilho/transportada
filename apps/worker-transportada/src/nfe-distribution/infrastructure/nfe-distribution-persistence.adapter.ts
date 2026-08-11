/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

import { NfeXmlImportError, type DfeItem } from '@adatechnology/fiscal-provider'

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
      const built = await Promise.all(
        input.items.map((dfe) =>
          buildPersistItemOrSkip({
            companyId: input.companyId,
            dependencies,
            dfe,
            importId: input.importId,
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
        skippedCount: built.length - items.length,
      }
    },
  }
}

/**
 * Um documento que o pacote fiscal não sabe importar não pode derrubar a página inteira: sem cursor
 * gravado, o retry reconsulta o mesmo CNPJ e queima a janela de uma hora que a SEFAZ exige.
 */
async function buildPersistItemOrSkip(params: {
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
  readonly dfe: DfeItem
  readonly importId: string
}): Promise<DistributionPersistItem | undefined> {
  try {
    return await buildPersistItem(params)
  } catch (error: unknown) {
    if (!(error instanceof NfeXmlImportError)) {
      throw error
    }

    params.dependencies.logger.warn('nfe_distribution_item_skipped', {
      companyId: params.companyId,
      errorCode: error.code,
      importId: params.importId,
      nsu: params.dfe.nsu,
      schema: params.dfe.schema,
    })
    return undefined
  }
}

async function buildPersistItem(params: {
  readonly companyId: string
  readonly dependencies: PersistenceAdapterDependencies
  readonly dfe: DfeItem
  readonly importId: string
}): Promise<DistributionPersistItem> {
  const { companyId, dependencies, dfe, importId } = params
  const sourceBytes = gunzipSync(Buffer.from(dfe.xmlComprimido, 'base64'))
  const sourceSha256 = createHash('sha256').update(sourceBytes).digest('hex')
  const variant = classifyVariant(dfe.schema)

  if (variant === 'summary') {
    const accessKey = dfe.chaveNfe ?? `nsu-${dfe.nsu}`
    const finalObject = await dependencies.finalStorage.storeImportedDocument({
      accessKey,
      companyId,
      importId,
      sourceBytes,
      sourceSha256,
    })
    return { finalObject, nsu: dfe.nsu, summary: buildSummary({ accessKey, dfe }), variant }
  }

  const xml = new TextDecoder().decode(sourceBytes)
  const normalizedXml = await dependencies.xmlImporter.importXml({ xml })

  if (variant === 'event') {
    if (normalizedXml.kind !== 'nfe-event') {
      throw new Error('NFE_DISTRIBUTION_EVENT_XML_MISMATCH')
    }
    const finalObject = await dependencies.finalStorage.storeImportedEvent({
      accessKey: normalizedXml.event.accessKey,
      companyId,
      importId,
      sequence: String(normalizedXml.event.sequence),
      sourceBytes,
      sourceSha256,
      type: normalizedXml.event.type,
    })
    return { finalObject, normalizedXml, nsu: dfe.nsu, variant }
  }

  if (normalizedXml.kind === 'nfe-event') {
    throw new Error('NFE_DISTRIBUTION_DOCUMENT_XML_MISMATCH')
  }
  const finalObject = await dependencies.finalStorage.storeImportedDocument({
    accessKey: normalizedXml.document.accessKey,
    companyId,
    importId,
    sourceBytes,
    sourceSha256,
  })
  return { finalObject, normalizedXml, nsu: dfe.nsu, variant }
}

function buildSummary(params: {
  readonly accessKey: string
  readonly dfe: DfeItem
}): DistributionSummary {
  const { accessKey, dfe } = params
  return {
    accessKey,
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

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { Buffer } from 'node:buffer'
import { gzipSync } from 'node:zlib'

import { describe, expect, test } from 'bun:test'
import {
  NfeXmlImportError,
  type DfeItem,
  type ImportedNfeXml,
} from '@adatechnology/fiscal-provider'
import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import type {
  DistributionPersistItem,
  PersistPageResult,
} from '../../src/nfe-distribution/infrastructure/drizzle-nfe-distribution.repository.js'
import { createNfeDistributionPersistenceAdapter } from '../../src/nfe-distribution/infrastructure/nfe-distribution-persistence.adapter.js'
import type {
  NfeImportFinalStorage,
  NfeImportStoredObject,
} from '../../src/nfe-imports/infrastructure/nfe-import-storage.gateway.js'
import type { NfeXmlImporter } from '../../src/nfe-imports/infrastructure/nfe-xml-importer.gateway.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

const ACCESS_KEY = '35190730290856000160550010000000011000000010'
const COMPANY_ID = 'fbc033e7-63e0-4698-adc6-12778bedf4a7'
const IMPORT_ID = '97ba42a6-8b96-47c0-bdb5-b75dfed2f95c'

const OTHER_ACCESS_KEY = '35190730290856000160550010000000021000000029'

const RESUMO_XML = `<resNFe><chNFe>${ACCESS_KEY}</chNFe></resNFe>`
const RESUMO_EVENTO_XML = `<resEvento><chNFe>${ACCESS_KEY}</chNFe></resEvento>`
const DOCUMENTO_XML = `<nfeProc><NFe><infNFe Id="NFe${ACCESS_KEY}"/></NFe></nfeProc>`
const EVENTO_XML = `<procEventoNFe><evento><infEvento chNFe="${ACCESS_KEY}"/></evento></procEventoNFe>`

type LogEntry = {
  readonly level: 'error' | 'info' | 'warn'
  readonly message: string
  readonly metadata: Record<string, unknown>
}

type AdapterHarness = {
  readonly importedXml: string[]
  readonly logs: LogEntry[]
  readonly persisted: DistributionPersistItem[]
  readonly storageCalls: string[]
  readonly storedLookups: readonly string[][]
}

function compressXml(xml: string): string {
  return gzipSync(Buffer.from(xml, 'utf-8')).toString('base64')
}

function createDfeItem(input: {
  readonly chaveNfe?: string | undefined
  readonly nsu: string
  readonly schema: string
  readonly xml: string
}): DfeItem {
  const chaveNfe = 'chaveNfe' in input ? input.chaveNfe : ACCESS_KEY

  return {
    ...(chaveNfe !== undefined ? { chaveNfe } : {}),
    nsu: input.nsu,
    schema: input.schema,
    xmlComprimido: compressXml(input.xml),
  }
}

function createStoredObject(): NfeImportStoredObject {
  return {
    bucket: 'fiscal',
    key: `imported/${ACCESS_KEY}.xml`,
    objectId: 'e2f7b0f6-2e2c-4a0e-9a4a-6b3a1b1c8f10',
    sha256: 'a'.repeat(64),
    sizeBytes: 128,
  }
}

function createFinalStorage(harness: AdapterHarness): NfeImportFinalStorage {
  return {
    async storeImportedDocument(params): Promise<NfeImportStoredObject> {
      harness.storageCalls.push(`complete:${params.accessKey}`)
      return createStoredObject()
    },
    async storeImportedEvent(params): Promise<NfeImportStoredObject> {
      harness.storageCalls.push(`event:${params.accessKey}`)
      return createStoredObject()
    },
    async storeImportedSummary(params): Promise<NfeImportStoredObject> {
      harness.storageCalls.push(`summary:${params.accessKey}`)
      return createStoredObject()
    },
  }
}

function createConflictError(): ObjectStorageError {
  return new ObjectStorageError(
    OBJECT_STORAGE_ERROR_CODES.objectConflict,
    'Object already exists with different content',
  )
}

function createDocumentXml(accessKey: string): ImportedNfeXml {
  return {
    document: { accessKey, status: 'authorized' },
    kind: 'authorized-nfe',
    nsu: '',
    schema: 'xml-import',
  } as unknown as ImportedNfeXml
}

function createEventXml(accessKey: string): ImportedNfeXml {
  return {
    event: { accessKey, sequence: 1, type: '110111' },
    kind: 'nfe-event',
    nsu: '',
    schema: 'xml-import',
  } as unknown as ImportedNfeXml
}

function readAccessKey(xml: string): string {
  return /[0-9]{44}/.exec(xml)?.[0] ?? ACCESS_KEY
}

function createXmlImporter(harness: AdapterHarness): NfeXmlImporter {
  return {
    async importXml(input: { readonly xml: string }): Promise<ImportedNfeXml> {
      harness.importedXml.push(input.xml)

      if (input.xml.includes('<procEventoNFe')) {
        return createEventXml(readAccessKey(input.xml))
      }
      if (input.xml.includes('<nfeProc')) {
        return createDocumentXml(readAccessKey(input.xml))
      }

      throw new NfeXmlImportError({
        code: 'NFE_XML_UNSUPPORTED_DOCUMENT',
        message: 'Unsupported fiscal XML document',
      })
    },
  }
}

/**
 * Espelha `nfe_import_items_access_key_check` do banco: a coluna aceita NULL ou 44 dígitos, e nada
 * mais. O fake anterior aceitava qualquer string, então a chave sintética `nsu-<nsu>` passava aqui
 * e só estourava em produção, dentro da transação da página.
 */
function assertAccessKeyConstraint(item: DistributionPersistItem): void {
  const accessKey = item.summary?.accessKey

  if (accessKey !== undefined && !/^[0-9]{44}$/.test(accessKey)) {
    throw new Error(`ACCESS_KEY_CHECK_VIOLATION:${accessKey}`)
  }
}

function createLogger(harness: AdapterHarness): WorkerLogger {
  return {
    error(message, metadata): void {
      harness.logs.push({ level: 'error', message, metadata: metadata ?? {} })
    },
    info(message, metadata): void {
      harness.logs.push({ level: 'info', message, metadata: metadata ?? {} })
    },
    warn(message, metadata): void {
      harness.logs.push({ level: 'warn', message, metadata: metadata ?? {} })
    },
  }
}

function createAdapter(
  input: {
    readonly finalStorage?: NfeImportFinalStorage
    readonly storedAccessKeys?: readonly string[]
  } = {},
): {
  readonly adapter: ReturnType<typeof createNfeDistributionPersistenceAdapter>
  readonly harness: AdapterHarness
} {
  const storedLookups: string[][] = []
  const harness: AdapterHarness = {
    importedXml: [],
    logs: [],
    persisted: [],
    storageCalls: [],
    storedLookups,
  }
  const alreadyStored = new Set(input.storedAccessKeys ?? [])

  const adapter = createNfeDistributionPersistenceAdapter({
    finalStorage: input.finalStorage ?? createFinalStorage(harness),
    logger: createLogger(harness),
    repository: {
      async finalizeImport(): Promise<void> {
        /* o contrato mede a classificação da página, não o fechamento da importação */
      },
      async findStoredAccessKeys(lookupInput): Promise<readonly string[]> {
        storedLookups.push([...lookupInput.accessKeys])
        return lookupInput.accessKeys.filter((accessKey) => alreadyStored.has(accessKey))
      },
      async persistPage(persistInput): Promise<PersistPageResult> {
        for (const item of persistInput.items) {
          assertAccessKeyConstraint(item)
        }
        harness.persisted.push(...persistInput.items)
        return {
          acceptedCount: persistInput.items.length,
          documentCount: 0,
          duplicatedCount: 0,
          eventCount: 0,
          summaryCount: 0,
        }
      },
    },
    xmlImporter: createXmlImporter(harness),
  })

  return { adapter, harness }
}

describe('NF-e distribution document classification contract', () => {
  test('classifies the versioned schemas that SEFAZ actually sends', async () => {
    const { adapter, harness } = createAdapter()

    await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({ nsu: '000000000000001', schema: 'resNFe_v1.01', xml: RESUMO_XML }),
        createDfeItem({ nsu: '000000000000002', schema: 'procNFe_v4.00', xml: DOCUMENTO_XML }),
        createDfeItem({ nsu: '000000000000003', schema: 'procEventoNFe_v1.00', xml: EVENTO_XML }),
        createDfeItem({
          nsu: '000000000000004',
          schema: 'resEvento_v1.00',
          xml: RESUMO_EVENTO_XML,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000000004',
    })

    expect(harness.persisted.map((item) => `${item.nsu}:${item.variant}`)).toEqual([
      '000000000000001:summary',
      '000000000000002:complete',
      '000000000000003:event',
      '000000000000004:summary',
    ])
    expect(harness.importedXml).toEqual([DOCUMENTO_XML, EVENTO_XML])
  })

  /**
   * Produção manda o nome do arquivo do schema, com `.xsd` no fim — `resEvento_v1.01.xsd`. As
   * fixtures anteriores inventaram a string sem a extensão, e por isso o contrato passava verde
   * enquanto os 50 itens de toda página real caíam em `complete` e eram pulados.
   */
  test('classifies the schema with the .xsd extension SEFAZ sends in production', async () => {
    const { adapter, harness } = createAdapter()

    const result = await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({
          nsu: '000000000037701',
          schema: 'resEvento_v1.01.xsd',
          xml: RESUMO_EVENTO_XML,
        }),
        createDfeItem({ nsu: '000000000037702', schema: 'resNFe_v1.01.xsd', xml: RESUMO_XML }),
        createDfeItem({ nsu: '000000000037703', schema: 'procNFe_v4.00.xsd', xml: DOCUMENTO_XML }),
        createDfeItem({
          nsu: '000000000037704',
          schema: 'procEventoNFe_v1.00.xsd',
          xml: EVENTO_XML,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037704',
    })

    expect(harness.persisted.map((item) => `${item.nsu}:${item.variant}`)).toEqual([
      '000000000037701:summary',
      '000000000037702:summary',
      '000000000037703:complete',
      '000000000037704:event',
    ])
    expect(result.skippedCount).toBe(0)
  })

  /**
   * O pacote fiscal só preenche `chaveNfe` quando consegue; no resumo real ele vem vazio. Sintetizar
   * `nsu-<nsu>` para a coluna violava o CHECK de 44 dígitos e derrubava a página inteira — a chave
   * verdadeira está no `<chNFe>` do próprio resumo.
   */
  test('reads the summary access key from the resumo XML when the package leaves it empty', async () => {
    const { adapter, harness } = createAdapter()

    await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({
          chaveNfe: undefined,
          nsu: '000000000037702',
          schema: 'resNFe_v1.01.xsd',
          xml: RESUMO_XML,
        }),
        createDfeItem({
          chaveNfe: undefined,
          nsu: '000000000037701',
          schema: 'resEvento_v1.01.xsd',
          xml: RESUMO_EVENTO_XML,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037702',
    })

    expect(harness.persisted.map((item) => item.summary?.accessKey)).toEqual([
      ACCESS_KEY,
      ACCESS_KEY,
    ])
  })

  test('reads the summary access key even when the resumo prefixes the namespace', async () => {
    const { adapter, harness } = createAdapter()

    await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({
          chaveNfe: undefined,
          nsu: '000000000037705',
          schema: 'resNFe_v1.01.xsd',
          xml: `<nfe:resNFe><nfe:chNFe>${ACCESS_KEY}</nfe:chNFe></nfe:resNFe>`,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037705',
    })

    expect(harness.persisted[0]?.summary?.accessKey).toBe(ACCESS_KEY)
  })

  test('leaves the summary access key unset when the resumo carries no key at all', async () => {
    const { adapter, harness } = createAdapter()

    await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({
          chaveNfe: undefined,
          nsu: '000000000037703',
          schema: 'resNFe_v1.01.xsd',
          xml: '<resNFe><cSitNFe>1</cSitNFe></resNFe>',
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037703',
    })

    expect(harness.persisted).toHaveLength(1)
    expect(harness.persisted[0]?.summary?.accessKey).toBeUndefined()
    expect(JSON.stringify(harness.persisted[0]?.summary)).not.toContain('nsu-')
  })

  test('keeps classifying when the schema arrives without the version suffix', async () => {
    const { adapter, harness } = createAdapter()

    await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({ nsu: '000000000000001', schema: 'resNFe', xml: RESUMO_XML }),
        createDfeItem({ nsu: '000000000000002', schema: 'procEventoNFe', xml: EVENTO_XML }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000000002',
    })

    expect(harness.persisted.map((item) => item.variant)).toEqual(['summary', 'event'])
  })

  test('skips the item it cannot import instead of losing the whole page', async () => {
    const { adapter, harness } = createAdapter()

    const result = await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({ nsu: '000000000000001', schema: 'resNFe_v1.01', xml: RESUMO_XML }),
        createDfeItem({
          nsu: '000000000000002',
          schema: 'procQualquerCoisa_v9.99',
          xml: '<xNovo/>',
        }),
        createDfeItem({ nsu: '000000000000003', schema: 'procNFe_v4.00', xml: DOCUMENTO_XML }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000000003',
    })

    expect(result.skippedCount).toBe(1)
    expect(harness.persisted.map((item) => item.nsu)).toEqual([
      '000000000000001',
      '000000000000003',
    ])

    const skipped = harness.logs.filter(
      (entry) => entry.message === 'nfe_distribution_item_skipped',
    )
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.level).toBe('warn')
    expect(skipped[0]?.metadata).toMatchObject({
      errorCode: 'NFE_XML_UNSUPPORTED_DOCUMENT',
      nsu: '000000000000002',
      schema: 'procQualquerCoisa_v9.99',
    })
    expect(JSON.stringify(skipped[0]?.metadata)).not.toContain('xNovo')
  })

  /**
   * A nota que já está no bucket derrubava a página inteira: o cursor não era gravado, o retry
   * reconsultava o mesmo CNPJ e a SEFAZ recusava com 656, queimando mais uma hora de janela. Já
   * existir não é erro — é motivo para pular e registrar.
   */
  test('skips the document already stored instead of losing the whole page', async () => {
    const { adapter, harness } = createAdapter({
      finalStorage: {
        async storeImportedDocument(): Promise<NfeImportStoredObject> {
          throw createConflictError()
        },
        async storeImportedEvent(): Promise<NfeImportStoredObject> {
          return createStoredObject()
        },
        async storeImportedSummary(): Promise<NfeImportStoredObject> {
          return createStoredObject()
        },
      },
    })

    const result = await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({ nsu: '000000000037702', schema: 'procNFe_v4.00.xsd', xml: DOCUMENTO_XML }),
        createDfeItem({ nsu: '000000000037703', schema: 'resNFe_v1.01.xsd', xml: RESUMO_XML }),
        createDfeItem({
          nsu: '000000000037704',
          schema: 'procEventoNFe_v1.00.xsd',
          xml: EVENTO_XML,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037704',
    })

    expect(result.skippedCount).toBe(1)
    expect(harness.persisted.map((item) => item.nsu)).toEqual([
      '000000000037703',
      '000000000037704',
    ])

    const skipped = harness.logs.filter(
      (entry) => entry.message === 'nfe_distribution_item_skipped',
    )
    expect(skipped).toHaveLength(1)
    expect(skipped[0]?.level).toBe('warn')
    expect(skipped[0]?.metadata).toMatchObject({
      errorCode: OBJECT_STORAGE_ERROR_CODES.objectConflict,
      nsu: '000000000037702',
      reason: 'already_stored',
    })
  })

  test('skips the summary already stored the same way it skips a document', async () => {
    const { adapter, harness } = createAdapter({
      finalStorage: {
        async storeImportedDocument(): Promise<NfeImportStoredObject> {
          return createStoredObject()
        },
        async storeImportedEvent(): Promise<NfeImportStoredObject> {
          return createStoredObject()
        },
        async storeImportedSummary(): Promise<NfeImportStoredObject> {
          throw createConflictError()
        },
      },
    })

    const result = await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({ nsu: '000000000037705', schema: 'resNFe_v1.01.xsd', xml: RESUMO_XML }),
        createDfeItem({ nsu: '000000000037706', schema: 'procNFe_v4.00.xsd', xml: DOCUMENTO_XML }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037706',
    })

    expect(result.skippedCount).toBe(1)
    expect(harness.persisted.map((item) => item.nsu)).toEqual(['000000000037706'])
  })

  /**
   * O conflito no bucket é rede de segurança, não o teste. Quem já está guardado se descobre
   * perguntando ao banco antes — a nota que já existe nem chega no storage.
   */
  test('asks which access keys the company already has and imports only the new ones', async () => {
    const { adapter, harness } = createAdapter({ storedAccessKeys: [ACCESS_KEY] })

    const result = await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({ nsu: '000000000037710', schema: 'procNFe_v4.00.xsd', xml: DOCUMENTO_XML }),
        createDfeItem({ nsu: '000000000037711', schema: 'resNFe_v1.01.xsd', xml: RESUMO_XML }),
        createDfeItem({
          chaveNfe: OTHER_ACCESS_KEY,
          nsu: '000000000037712',
          schema: 'procNFe_v4.00.xsd',
          xml: `<nfeProc><NFe><infNFe Id="NFe${OTHER_ACCESS_KEY}"/></NFe></nfeProc>`,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037712',
    })

    expect(harness.persisted.map((item) => item.nsu)).toEqual(['000000000037712'])
    expect(result.skippedCount).toBe(2)
    expect(harness.storageCalls).toEqual([`complete:${OTHER_ACCESS_KEY}`])

    const skipped = harness.logs.filter(
      (entry) => entry.message === 'nfe_distribution_item_skipped',
    )
    expect(skipped.map((entry) => entry.metadata['nsu'])).toEqual([
      '000000000037710',
      '000000000037711',
    ])
    expect(skipped[0]?.metadata).toMatchObject({ accessKey: ACCESS_KEY, reason: 'already_stored' })
  })

  /**
   * Evento de nota que já temos é informação nova — cancelamento, carta de correção. Ele tem
   * endereço próprio no bucket e nunca é pulado por a nota existir.
   */
  test('never skips an event just because the note is already stored', async () => {
    const { adapter, harness } = createAdapter({ storedAccessKeys: [ACCESS_KEY] })

    const result = await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({
          nsu: '000000000037713',
          schema: 'procEventoNFe_v1.00.xsd',
          xml: EVENTO_XML,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037713',
    })

    expect(result.skippedCount).toBe(0)
    expect(harness.persisted.map((item) => item.nsu)).toEqual(['000000000037713'])
    expect(harness.storageCalls).toEqual([`event:${ACCESS_KEY}`])
  })

  /**
   * Uma consulta por página, não uma por item: 50 itens não podem virar 50 idas ao banco.
   */
  test('asks the base once per page, with each access key a single time', async () => {
    const { adapter, harness } = createAdapter()

    await adapter.persistPage({
      companyId: COMPANY_ID,
      environment: 'production',
      importId: IMPORT_ID,
      items: [
        createDfeItem({ nsu: '000000000037714', schema: 'resNFe_v1.01.xsd', xml: RESUMO_XML }),
        createDfeItem({ nsu: '000000000037715', schema: 'procNFe_v4.00.xsd', xml: DOCUMENTO_XML }),
        createDfeItem({
          chaveNfe: OTHER_ACCESS_KEY,
          nsu: '000000000037716',
          schema: 'resNFe_v1.01.xsd',
          xml: `<resNFe><chNFe>${OTHER_ACCESS_KEY}</chNFe></resNFe>`,
        }),
      ],
      maxNsu: '000000000045636',
      ultNsu: '000000000037716',
    })

    expect(harness.storedLookups).toHaveLength(1)
    expect([...(harness.storedLookups[0] ?? [])].sort()).toEqual(
      [ACCESS_KEY, OTHER_ACCESS_KEY].sort(),
    )
  })

  test('still fails the page when the error is not an unsupported document', async () => {
    const { adapter } = createAdapter({
      finalStorage: {
        async storeImportedDocument(): Promise<NfeImportStoredObject> {
          throw new Error('STORAGE_UNAVAILABLE')
        },
        async storeImportedEvent(): Promise<NfeImportStoredObject> {
          return createStoredObject()
        },
        async storeImportedSummary(): Promise<NfeImportStoredObject> {
          return createStoredObject()
        },
      },
    })

    await expect(
      adapter.persistPage({
        companyId: COMPANY_ID,
        environment: 'production',
        importId: IMPORT_ID,
        items: [
          createDfeItem({ nsu: '000000000000001', schema: 'procNFe_v4.00', xml: DOCUMENTO_XML }),
        ],
        maxNsu: '000000000045636',
        ultNsu: '000000000000001',
      }),
    ).rejects.toThrow('STORAGE_UNAVAILABLE')
  })
})

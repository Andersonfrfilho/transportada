/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import { createNfePackageBoxBackfill } from '../../src/nfe-imports/application/nfe-package-box-backfill.service.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const EMITENTE = '05868574001090'

/** O dublê traz só o que a política lê; o resto do envelope não participa desta decisão. */
function buildImported(
  products: readonly { code: string; commercialUnit: string }[],
): ImportedNfeXml {
  return {
    document: {
      issuer: { taxId: EMITENTE },
      products: products.map((product) => ({ ...product, description: 'ENERG RED BULL' })),
      volumes: [{ grossWeight: '108.6700', quantity: '10' }],
    },
    kind: 'nfe' as const,
  } as unknown as ImportedNfeXml
}

function buildDependencies(options: {
  readonly documents: readonly { bucket: string; documentId: string; objectKey: string }[]
  readonly importXml?: () => Promise<ImportedNfeXml>
}) {
  const inserted: unknown[] = []
  let served = false
  return {
    dependencies: {
      importer: {
        importXml:
          options.importXml ??
          (async () => buildImported([{ code: '18245', commercialUnit: 'CX24' }])),
      },
      repository: {
        insertPackageBoxes: async (input: { boxes: readonly unknown[] }) => {
          inserted.push(...input.boxes)
          return input.boxes.length
        },
        listArchivedDocuments: async () => {
          if (served) return []
          served = true
          return options.documents
        },
      },
      storage: { readXml: async () => '<nfe/>' },
    },
    inserted,
  }
}

const ONE_DOCUMENT = [{ bucket: 'fiscal', documentId: 'doc-1', objectKey: 'a.xml' }]

describe('o cadastro de caixa preenchido pelas notas já importadas (spec 085 G004)', () => {
  test('relê o XML arquivado e cria a caixa que a nota apresenta', async () => {
    const { dependencies, inserted } = buildDependencies({ documents: ONE_DOCUMENT })

    const result = await createNfePackageBoxBackfill(dependencies).execute({
      companyId: COMPANY_ID,
    })

    expect(result).toMatchObject({ boxesCreated: 1, documentsFailed: 0, documentsScanned: 1 })
    expect(inserted).toEqual([
      {
        commercialUnit: 'CX24',
        description: 'ENERG RED BULL',
        emitterTaxId: EMITENTE,
        grossWeightGrams: 10867,
        productCode: '18245',
      },
    ])
  })

  /** Evento de NF-e não tem produto: é resultado, não falha — e não pode contar como erro. */
  test('evento arquivado é pulado sem falhar', async () => {
    const { dependencies, inserted } = buildDependencies({
      documents: ONE_DOCUMENT,
      importXml: async () => ({ kind: 'nfe-event' }) as unknown as ImportedNfeXml,
    })

    const result = await createNfePackageBoxBackfill(dependencies).execute({
      companyId: COMPANY_ID,
    })

    expect(result).toMatchObject({ documentsFailed: 0, documentsSkipped: 1 })
    expect(inserted).toEqual([])
  })

  /**
   * ⚠️ Objeto apagado do bucket não pode parar o lote: o backfill roda sobre milhares de notas, e
   * uma falha que interrompe obriga a começar de novo sem saber onde parou.
   */
  test('XML ilegível conta como falha e o lote continua', async () => {
    const { dependencies } = buildDependencies({
      documents: ONE_DOCUMENT,
      importXml: async () => {
        throw new Error('object_not_found')
      },
    })

    const result = await createNfePackageBoxBackfill(dependencies).execute({
      companyId: COMPANY_ID,
    })

    expect(result).toMatchObject({ boxesCreated: 0, documentsFailed: 1, documentsScanned: 1 })
  })
})

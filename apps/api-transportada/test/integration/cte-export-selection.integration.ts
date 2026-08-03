/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import type {
  CteExportDocument,
  CteExportSelectionQuery,
} from '../../src/cte-issuance/application/export-cte-documents.port'
import { CTE_EXPORT_MAX_DOCUMENTS } from '../../src/cte-issuance/application/export-cte-documents.port'
import { createCteExportSelection } from '../../src/cte-issuance/infrastructure/cte-export-selection.query'
import { storedObjects } from '../../src/database/database.schema'
import {
  ITEM_SCENARIOS,
  type SeededCompany,
  type TestDatabase,
  testWithPostgres,
  withCteItemGraph,
} from './cte-item-list-repository/cte-item-graph.fixture'

const CTE_XML_PURPOSE = 'cte_document'

type PrimaryExportQuery = Omit<CteExportSelectionQuery, 'companyId' | 'limit'>

/** Só o documento autorizado e sem pedido de cancelamento é exportável. */
const EXPORTABLE_SCENARIO_KEYS = ITEM_SCENARIOS.filter(
  (scenario) => scenario.document === 'authorized',
).map((scenario) => scenario.key)

/** Cada um cai por um motivo diferente: sem documento, cancelamento pedido, cancelado. */
const EXCLUDED_SCENARIO_KEYS = [
  'autorizada_sem_documento',
  'cancelamento_solicitado',
  'cancelada',
] as const

function requiredId(source: ReadonlyMap<string, string>, key: string): string {
  const value = source.get(key)
  if (value === undefined) throw new Error(`MISSING_SCENARIO_${key}`)
  return value
}

function sortedKeys(documents: readonly CteExportDocument[]): string[] {
  return [...documents.map((document) => document.accessKey)].sort()
}

async function readCteObjectKeys(
  database: TestDatabase,
  company: SeededCompany,
): Promise<readonly string[]> {
  const rows = await database.db
    .select({ objectKey: storedObjects.objectKey })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, company.companyId),
        eq(storedObjects.purpose, CTE_XML_PURPOSE),
      ),
    )

  return rows.map((row) => row.objectKey)
}

describe('cte export selection integration', () => {
  testWithPostgres(
    'exporta só documento autorizado vivo, resolve o objeto do XML pelo join e não atravessa empresa',
    async () => {
      await withCteItemGraph(async ({ database, primary, secondary }) => {
        const selection = createCteExportSelection(database.db)
        const listPrimary = (query: PrimaryExportQuery): Promise<readonly CteExportDocument[]> =>
          selection.listAuthorizedDocuments({
            companyId: primary.companyId,
            limit: CTE_EXPORT_MAX_DOCUMENTS,
            ...query,
          })

        const exported = await listPrimary({})
        expect(exported).toHaveLength(EXPORTABLE_SCENARIO_KEYS.length)
        expect(EXPORTABLE_SCENARIO_KEYS.length).toBeGreaterThan(1)

        // Ordem estável por chave de acesso: o nome da entrada do ZIP sai daqui.
        expect(exported.map((document) => document.accessKey)).toEqual(sortedKeys(exported))
        expect(new Set(exported.map((document) => document.accessKey)).size).toBe(exported.length)

        // O segundo `innerJoin` resolve bucket e chave do objeto — nenhuma linha sai sem eles.
        const primaryObjectKeys = await readCteObjectKeys(database, primary)
        for (const document of exported) {
          expect(document.bucket).toBe('integration')
          expect(primaryObjectKeys).toContain(document.objectKey)
        }

        // O primeiro `innerJoin` e o recorte de status derrubam estes três, cada um por um motivo.
        for (const key of EXCLUDED_SCENARIO_KEYS) {
          const itemId = requiredId(primary.itemIdByScenario, key)
          expect({ key, rows: await listPrimary({ itemIds: [itemId] }) }).toEqual({ key, rows: [] })
        }

        // Recorte por seleção: um item exportável devolve exatamente uma entrada.
        const exportableKey = EXPORTABLE_SCENARIO_KEYS[0] ?? ''
        const exportableItemId = requiredId(primary.itemIdByScenario, exportableKey)
        const singleSelection = await listPrimary({ itemIds: [exportableItemId] })
        expect(singleSelection).toHaveLength(1)

        // Recorte por filtro: o número do CT-e do mesmo item chega ao mesmo documento.
        const fiscalNumber = requiredId(primary.fiscalNumberByScenario, exportableKey)
        const filtered = await listPrimary({ filters: { cteNumberIn: [fiscalNumber] } })
        expect(sortedKeys(filtered)).toEqual(sortedKeys(singleSelection))

        // O filtro de status da tela chega intacto até o SQL.
        const authorizedOnly = await listPrimary({ filters: { statusIn: ['authorized'] } })
        expect(sortedKeys(authorizedOnly)).toEqual(sortedKeys(exported))
        expect(await listPrimary({ filters: { statusIn: ['cancelled'] } })).toEqual([])

        // Teto por requisição: o limite corta a consulta, não o consumidor.
        const limited = await selection.listAuthorizedDocuments({
          companyId: primary.companyId,
          limit: 1,
        })
        expect(limited.map((document) => document.accessKey)).toEqual([
          exported[0]?.accessKey ?? '',
        ])

        // Isolamento: item de outra empresa no corpo não vira linha exportada.
        const secondaryItemId = requiredId(secondary.itemIdByScenario, exportableKey)
        expect(await listPrimary({ itemIds: [secondaryItemId] })).toEqual([])
        expect(await listPrimary({ itemIds: [exportableItemId, secondaryItemId] })).toHaveLength(1)

        const secondaryExported = await selection.listAuthorizedDocuments({
          companyId: secondary.companyId,
          limit: CTE_EXPORT_MAX_DOCUMENTS,
        })
        expect(secondaryExported).toHaveLength(EXPORTABLE_SCENARIO_KEYS.length)
        const primaryAccessKeys = new Set(exported.map((document) => document.accessKey))
        const primaryKeys = new Set(primaryObjectKeys)
        for (const document of secondaryExported) {
          expect(primaryAccessKeys.has(document.accessKey)).toBe(false)
          expect(primaryKeys.has(document.objectKey)).toBe(false)
        }
      })
    },
  )
})

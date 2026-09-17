/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createListPackageBoxes } from '../../src/nfe-documents/application/list-package-boxes.use-case.js'
import type {
  PackageBoxFilters,
  PackageBoxRepositoryPort,
  PackageBoxView,
} from '../../src/nfe-documents/application/package-box.port.js'

function buildBox(overrides: Partial<PackageBoxView>): PackageBoxView {
  return {
    cartonGtin: null,
    commercialUnit: 'CX24',
    description: 'REFRIGERANTE 350ML',
    emitterTaxId: '05868574001090',
    familyKey: undefined,
    familyMeasuredCount: 0,
    familyPendingCount: 0,
    grossWeightGrams: null,
    heightMm: null,
    id: 'id',
    lengthMm: null,
    measuredAt: null,
    measurementMarginMm: null,
    measurementSource: null,
    packagingSiblingCount: 0,
    packagingUnitCount: undefined,
    productCode: '7896004003405',
    transportedVolumes: 10,
    unitsPerBox: 1,
    variantLabel: '',
    widthMm: null,
    ...overrides,
  }
}

/**
 * O GTIN ainda não é gravado nas caixas (chega com o pacote fiscal numa etapa seguinte) — hoje a
 * etiqueta lida casa por `carton_gtin` ou `product_code`, e o segundo é ambíguo entre emitentes.
 * Quem escolhe a candidata certa é o operador na tela, nunca esta rota — então a lista devolvida
 * aqui precisa trazer **todas** as caixas da empresa que casaram, e não só a primeira.
 */
describe('a busca por código devolve todas as candidatas da empresa (spec em andamento)', () => {
  test('não trunca em uma quando o repositório acha mais de uma caixa', async () => {
    const boxes = [
      buildBox({ emitterTaxId: '05868574001090', id: 'a' }),
      buildBox({ emitterTaxId: '11444777000161', id: 'b' }),
      buildBox({ emitterTaxId: '22555888000172', id: 'c' }),
    ]

    let capturedCompanyId: string | undefined
    const repository: PackageBoxRepositoryPort = {
      list: (input) => {
        capturedCompanyId = input.companyId
        return Promise.resolve(boxes)
      },
      measure: () => Promise.resolve(true),
    }

    const listPackageBoxes = createListPackageBoxes({ repository })
    const result = await listPackageBoxes.execute({
      context: { companyId: 'company-1' },
      filters: { scanned: '7896004003405' },
      limit: 50,
    })

    expect(result.items.map((item) => item.id).sort()).toEqual(['a', 'b', 'c'])
    /** `companyId` do contexto autenticado, nunca do payload — a mesma regra de `CLAUDE.md`. */
    expect(capturedCompanyId).toBe('company-1')
  })

  test('uma caixa só continua respondendo uma candidata', async () => {
    const repository: PackageBoxRepositoryPort = {
      list: () => Promise.resolve([buildBox({ id: 'unica' })]),
      measure: () => Promise.resolve(true),
    }

    const result = await createListPackageBoxes({ repository }).execute({
      context: { companyId: 'company-1' },
      filters: { scanned: '7896004003405' },
      limit: 50,
    })

    expect(result.items.map((item) => item.id)).toEqual(['unica'])
  })

  test('nenhuma caixa devolve lista vazia, não erro', async () => {
    const repository: PackageBoxRepositoryPort = {
      list: () => Promise.resolve([]),
      measure: () => Promise.resolve(true),
    }

    const result = await createListPackageBoxes({ repository }).execute({
      context: { companyId: 'company-1' },
      filters: { scanned: '0000000000000' },
      limit: 50,
    })

    expect(result.items).toEqual([])
  })

  /** O código bipado nunca aparece no log — só passa como filtro para o repositório. */
  test('o filtro chega ao repositório sem sobrar em nenhum outro lugar', async () => {
    let capturedFilters: PackageBoxFilters | undefined
    const repository: PackageBoxRepositoryPort = {
      list: (input) => {
        capturedFilters = input.filters
        return Promise.resolve([])
      },
      measure: () => Promise.resolve(true),
    }

    await createListPackageBoxes({ repository }).execute({
      context: { companyId: 'company-1' },
      filters: { scanned: '7896004003405', status: 'pending' },
      limit: 50,
    })

    expect(capturedFilters?.status).toBe('pending')
    expect(
      (capturedFilters as PackageBoxFilters & { scanCodes?: readonly string[] })?.scanCodes,
    ).toEqual(['7896004003405'])
  })
})

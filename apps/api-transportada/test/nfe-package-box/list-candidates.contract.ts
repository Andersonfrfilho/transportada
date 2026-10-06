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
    estimate: null,
    familyKey: undefined,
    familyMeasuredCount: 0,
    familyPendingCount: 0,
    grossWeightGrams: null,
    heightMm: null,
    id: 'id',
    isEstimated: false,
    lengthMm: null,
    measuredAt: null,
    measuredByName: null,
    measurementMarginMm: null,
    measurementSource: null,
    packagingSiblingCount: 0,
    packagingUnitCount: undefined,
    productCode: '7896004003405',
    transportedVolumes: 10,
    unit: null,
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
      countMeasurement: () => Promise.resolve({ measuredCount: 0, pendingCount: 0 }),
      getSiblings: () => Promise.reject(new Error('not stubbed')),
      list: (input) => {
        capturedCompanyId = input.companyId
        return Promise.resolve(boxes)
      },
      measure: () => Promise.resolve(true),
      replicate: () => Promise.reject(new Error('not stubbed')),
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
      countMeasurement: () => Promise.resolve({ measuredCount: 0, pendingCount: 0 }),
      getSiblings: () => Promise.reject(new Error('not stubbed')),
      list: () => Promise.resolve([buildBox({ id: 'unica' })]),
      measure: () => Promise.resolve(true),
      replicate: () => Promise.reject(new Error('not stubbed')),
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
      countMeasurement: () => Promise.resolve({ measuredCount: 0, pendingCount: 0 }),
      getSiblings: () => Promise.reject(new Error('not stubbed')),
      list: () => Promise.resolve([]),
      measure: () => Promise.resolve(true),
      replicate: () => Promise.reject(new Error('not stubbed')),
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
      countMeasurement: () => Promise.resolve({ measuredCount: 0, pendingCount: 0 }),
      getSiblings: () => Promise.reject(new Error('not stubbed')),
      list: (input) => {
        capturedFilters = input.filters
        return Promise.resolve([])
      },
      measure: () => Promise.resolve(true),
      replicate: () => Promise.reject(new Error('not stubbed')),
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

/**
 * O contador do cabeçalho não depende da página nem da situação escolhida: se respeitasse
 * `status`, em "Faltam medir" as medidas seriam sempre zero e o número não diria nada.
 */
describe('a fila devolve quantas caixas já foram medidas e quantas faltam', () => {
  test('conta com a busca e a etiqueta bipada, mas sem a situação, e devolve os dois totais', async () => {
    let capturedCount: Parameters<PackageBoxRepositoryPort['countMeasurement']>[0] | undefined
    const repository: PackageBoxRepositoryPort = {
      countMeasurement: (input) => {
        capturedCount = input
        return Promise.resolve({ measuredCount: 12, pendingCount: 38 })
      },
      getSiblings: () => Promise.reject(new Error('not stubbed')),
      list: () => Promise.resolve([buildBox({ id: 'unica' })]),
      measure: () => Promise.resolve(true),
      replicate: () => Promise.reject(new Error('not stubbed')),
    }

    const result = await createListPackageBoxes({ repository }).execute({
      context: { companyId: 'company-1' },
      filters: { scanned: '7896004003405', search: 'refri', status: 'measured' },
      limit: 1,
    })

    expect(result.measuredCount).toBe(12)
    expect(result.pendingCount).toBe(38)
    expect(capturedCount).toEqual({
      companyId: 'company-1',
      filters: { scanCodes: ['7896004003405'], search: 'refri' },
    })
  })

  test('sem busca nem bipe, conta a empresa inteira', async () => {
    let capturedCount: Parameters<PackageBoxRepositoryPort['countMeasurement']>[0] | undefined
    const repository: PackageBoxRepositoryPort = {
      countMeasurement: (input) => {
        capturedCount = input
        return Promise.resolve({ measuredCount: 0, pendingCount: 0 })
      },
      getSiblings: () => Promise.reject(new Error('not stubbed')),
      list: () => Promise.resolve([]),
      measure: () => Promise.resolve(true),
      replicate: () => Promise.reject(new Error('not stubbed')),
    }

    await createListPackageBoxes({ repository }).execute({
      context: { companyId: 'company-1' },
      filters: { status: 'pending' },
      limit: 50,
    })

    expect(capturedCount).toEqual({ companyId: 'company-1', filters: {} })
  })
})

describe('a lista das já medidas abre pelo último registro', () => {
  function buildRepository(boxes: readonly PackageBoxView[]): PackageBoxRepositoryPort {
    return {
      countMeasurement: () => Promise.resolve({ measuredCount: boxes.length, pendingCount: 0 }),
      getSiblings: () => Promise.reject(new Error('not stubbed')),
      list: () => Promise.resolve(boxes),
      measure: () => Promise.resolve(true),
      replicate: () => Promise.reject(new Error('not stubbed')),
    }
  }

  const recentButSmall = buildBox({
    id: 'recent',
    measuredAt: '2026-10-01T12:00:00.000Z',
    measuredByName: 'Maria',
    transportedVolumes: 1,
  })
  const oldButBig = buildBox({
    id: 'old',
    measuredAt: '2026-09-16T12:00:00.000Z',
    measuredByName: 'João',
    transportedVolumes: 500,
  })

  test('com status "measured" mantém a ordem do repositório, e não a do volume', async () => {
    const listPackageBoxes = createListPackageBoxes({
      repository: buildRepository([recentButSmall, oldButBig]),
    })

    const result = await listPackageBoxes.execute({
      context: { companyId: 'company-1' },
      filters: { status: 'measured' },
      limit: 50,
    })

    expect(result.items.map((item) => item.id)).toEqual(['recent', 'old'])
    expect(result.items[0]?.measuredByName).toBe('Maria')
  })

  test('com status "pending" a fila continua na ordem do volume transportado', async () => {
    const listPackageBoxes = createListPackageBoxes({
      repository: buildRepository([recentButSmall, oldButBig]),
    })

    const result = await listPackageBoxes.execute({
      context: { companyId: 'company-1' },
      filters: { status: 'pending' },
      limit: 50,
    })

    expect(result.items.map((item) => item.id)).toEqual(['old', 'recent'])
  })
})

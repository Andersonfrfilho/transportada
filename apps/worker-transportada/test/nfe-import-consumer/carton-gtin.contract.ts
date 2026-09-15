/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  normalizeCartonGtin,
  resolveCartonGtin,
} from '../../src/nfe-imports/domain/carton-gtin.policy.js'
import { buildPackageBoxRows } from '../../src/nfe-imports/domain/package-box.policy.js'

const WORKER_POLICY = new URL('../../src/nfe-imports/domain/carton-gtin.policy.ts', import.meta.url)
const API_POLICY = new URL(
  '../../../api-transportada/src/nfe-documents/domain/package-box-queue.policy.ts',
  import.meta.url,
)

/** GTIN-13 real com dígito correto, e o DUN-14 da caixa master do mesmo produto. */
const GTIN_13 = '7894900011517'
const DUN_14 = '17894900011514'

function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`função ${name} ausente`)
  const end = source.indexOf('\n}\n', start)
  return source.slice(start, end + 2)
}

describe('o GTIN da caixa gravado pela importação (fiscal-provider 0.3.2)', () => {
  test('GTIN-13 com dígito correto é gravado como veio', () => {
    expect(normalizeCartonGtin(GTIN_13)).toBe(GTIN_13)
  })

  /** A busca casa pelo GTIN-13: o DUN-14 é reduzido pela mesma régua do leitor da API. */
  test('DUN-14 com dígito correto é reduzido ao GTIN-13 do produto', () => {
    expect(normalizeCartonGtin(DUN_14)).toBe(GTIN_13)
  })

  test('GTIN-8 e GTIN-12 válidos passam intactos', () => {
    expect(normalizeCartonGtin('96385074')).toBe('96385074')
    expect(normalizeCartonGtin('036000291452')).toBe('036000291452')
  })

  /** O pacote não valida o dígito: código com dígito errado buscaria outro produto. */
  test('dígito verificador errado é nulo', () => {
    expect(normalizeCartonGtin('7894900011518')).toBeNull()
    expect(normalizeCartonGtin('17894900011515')).toBeNull()
  })

  test('zeros, tamanho fora do GS1 e não dígito são nulos', () => {
    expect(normalizeCartonGtin('0000000000000')).toBeNull()
    expect(normalizeCartonGtin('12345')).toBeNull()
    expect(normalizeCartonGtin('SEM GTIN')).toBeNull()
    expect(normalizeCartonGtin(undefined)).toBeNull()
  })

  test('cEAN vence o cEANTrib', () => {
    expect(resolveCartonGtin({ gtin: GTIN_13, taxableUnitGtin: '96385074' })).toBe(GTIN_13)
  })

  test('cEANTrib só entra quando o cEAN está ausente', () => {
    expect(resolveCartonGtin({ taxableUnitGtin: GTIN_13 })).toBe(GTIN_13)
  })

  /** cEAN presente e inválido não cai para o cEANTrib: a unidade tributável é outra embalagem. */
  test('cEAN inválido não cai para o cEANTrib', () => {
    expect(resolveCartonGtin({ gtin: '7894900011518', taxableUnitGtin: GTIN_13 })).toBeNull()
  })

  test('sem código nenhum é nulo', () => {
    expect(resolveCartonGtin({})).toBeNull()
  })
})

describe('a caixa que a nota apresenta leva o GTIN do produto', () => {
  const PRODUCT = { code: '18245', commercialUnit: 'CX24', description: 'ENERG' }

  test('GTIN válido entra na linha da caixa', () => {
    expect(
      buildPackageBoxRows({
        emitterTaxId: '05868574001090',
        products: [{ ...PRODUCT, gtin: DUN_14 }],
      }),
    ).toEqual([
      {
        cartonGtin: GTIN_13,
        commercialUnit: 'CX24',
        description: 'ENERG',
        emitterTaxId: '05868574001090',
        productCode: '18245',
      },
    ])
  })

  test('sem GTIN válido a linha não carrega o campo', () => {
    const [row] = buildPackageBoxRows({
      emitterTaxId: '05868574001090',
      products: [{ ...PRODUCT, gtin: '7894900011518' }],
    })
    expect(row).not.toHaveProperty('cartonGtin')
  })

  /** Linhas repetidas do mesmo par: a primeira com GTIN válido fica, a sem GTIN não o apaga. */
  test('linha repetida sem GTIN não apaga o GTIN da anterior', () => {
    const [row] = buildPackageBoxRows({
      emitterTaxId: '05868574001090',
      products: [{ ...PRODUCT, gtin: GTIN_13 }, PRODUCT],
    })
    expect(row?.cartonGtin).toBe(GTIN_13)
  })
})

/**
 * ⚠️ A redução é **cópia por valor** da API (as apps não importam código uma da outra). Se
 * divergirem, o worker grava um GTIN-13 e o leitor reduz a etiqueta a outro — a busca volta vazia.
 */
describe('a redução do GTIN: paridade com a API', () => {
  test('reduceToGtin13 e computeCheckDigit são idênticas nas duas apps', async () => {
    const [worker, api] = await Promise.all([
      readFile(WORKER_POLICY, 'utf8'),
      readFile(API_POLICY, 'utf8'),
    ])

    expect(extractFunction(worker, 'reduceToGtin13')).toBe(extractFunction(api, 'reduceToGtin13'))
    expect(extractFunction(worker, 'computeCheckDigit')).toBe(
      extractFunction(api, 'computeCheckDigit'),
    )
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolvePredominantProduct } from '../../src/cte-issuance/domain/cte-cargo.service.js'
import type {
  CtePayloadInvoice,
  CtePayloadProduct,
  CtePayloadProfile,
  CtePayloadVolume,
} from '../../src/cte-issuance/domain/cte-payload.types.js'

import { GOLDEN_INVOICE, GOLDEN_PROFILE, expectApiErrorCode } from './support.js'

const FIRST_ACCESS_KEY = '12345678901234567890123456789012345678901234'
const SECOND_ACCESS_KEY = '12345678901234567890123456789012345678905678'
const THIRD_ACCESS_KEY = '12345678901234567890123456789012345678909012'

const PRODUCT = {
  ALFA: 'PRODUTO ALFA',
  BRAVO: 'PRODUTO BRAVO',
  CHARLIE: 'PRODUTO CHARLIE',
  DELTA: 'PRODUTO DELTA',
  ECHO: 'PRODUTO ECHO',
} as const

const HIGHEST_QUANTITY_PROFILE: CtePayloadProfile = {
  ...GOLDEN_PROFILE,
  predominantProductMode: 'highest_quantity',
}

const HIGHEST_WEIGHT_PROFILE: CtePayloadProfile = {
  ...GOLDEN_PROFILE,
  predominantProductMode: 'highest_weight',
}

function buildInvoice(
  input: Readonly<{
    accessKey: string
    products: readonly CtePayloadProduct[]
    volumes?: readonly CtePayloadVolume[]
  }>,
): CtePayloadInvoice {
  return {
    ...GOLDEN_INVOICE,
    accessKey: input.accessKey,
    products: input.products,
    volumes: input.volumes ?? GOLDEN_INVOICE.volumes,
  }
}

function buildVolume(grossWeight: null | string): CtePayloadVolume {
  return { grossWeight, netWeight: null, quantity: null }
}

function resolveByQuantity(invoices: readonly CtePayloadInvoice[]): string {
  return resolvePredominantProduct({ invoices, profile: HIGHEST_QUANTITY_PROFILE })
}

function resolveByWeight(invoices: readonly CtePayloadInvoice[]): string {
  return resolvePredominantProduct({ invoices, profile: HIGHEST_WEIGHT_PROFILE })
}

describe('resolvePredominantProduct — modo highest_quantity', () => {
  test('escolhe a maior quantidade mesmo havendo item de valor maior', () => {
    // forma derivada da amostra 14093, onde highest_value erra o produto predominante
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 2,
          quantity: '3.0000',
          totalValue: '150.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 11,
          quantity: '6.0000',
          totalValue: '900.0000',
        },
        {
          description: PRODUCT.CHARLIE,
          grossWeight: null,
          ordinal: 13,
          quantity: '12.0000',
          totalValue: '480.0000',
        },
      ],
    })

    expect(resolveByQuantity([invoice])).toBe(PRODUCT.CHARLIE)
  })

  test('compara a quantidade comercial crua, sem expandir a embalagem', () => {
    // forma derivada da amostra 14094: 5 caixas de 12 e 4 fardos de 15 dariam 60 unidades cada
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 2,
          quantity: '4.0000',
          totalValue: '700.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 5,
          quantity: '5.0000',
          totalValue: '300.0000',
        },
      ],
    })

    expect(resolveByQuantity([invoice])).toBe(PRODUCT.BRAVO)
  })

  test('desempata quantidade igual pelo maior valor do item', () => {
    // forma derivada da amostra 14108
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 1,
          quantity: '2.0000',
          totalValue: '900.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 3,
          quantity: '3.0000',
          totalValue: '210.0000',
        },
        {
          description: PRODUCT.CHARLIE,
          grossWeight: null,
          ordinal: 6,
          quantity: '3.0000',
          totalValue: '360.0000',
        },
      ],
    })

    expect(resolveByQuantity([invoice])).toBe(PRODUCT.CHARLIE)
  })

  test('desempata quantidade e valor iguais pelo menor ordinal do item', () => {
    // forma derivada da amostra 14123, onde toda a nota tem quantidade 1
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 9,
          quantity: '1.0000',
          totalValue: '150.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 5,
          quantity: '1.0000',
          totalValue: '201.3500',
        },
        {
          description: PRODUCT.CHARLIE,
          grossWeight: null,
          ordinal: 2,
          quantity: '1.0000',
          totalValue: '201.3500',
        },
      ],
    })

    expect(resolveByQuantity([invoice])).toBe(PRODUCT.CHARLIE)
  })

  test('mantém o desempate por valor no caso em que o CT-e real divergiu', () => {
    // forma derivada da amostra 14139 — única divergência conhecida da regra (1 em 166)
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 3,
          quantity: '2.0000',
          totalValue: '119.9000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 4,
          quantity: '2.0000',
          totalValue: '89.9000',
        },
      ],
    })

    expect(resolveByQuantity([invoice])).toBe(PRODUCT.ALFA)
  })

  test('escolhe entre os itens de todas as notas do agrupamento', () => {
    const first = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 1,
          quantity: '4.0000',
          totalValue: '800.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 2,
          quantity: '2.0000',
          totalValue: '120.0000',
        },
      ],
    })
    const second = buildInvoice({
      accessKey: SECOND_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.CHARLIE,
          grossWeight: null,
          ordinal: 1,
          quantity: '9.0000',
          totalValue: '90.0000',
        },
        {
          description: PRODUCT.DELTA,
          grossWeight: null,
          ordinal: 2,
          quantity: '1.0000',
          totalValue: '990.0000',
        },
      ],
    })

    expect(resolveByQuantity([first, second])).toBe(PRODUCT.CHARLIE)
  })

  test('rejeita quando nenhum item declara quantidade positiva', () => {
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 1,
          quantity: '0.0000',
          totalValue: '150.0000',
        },
        {
          description: PRODUCT.ECHO,
          grossWeight: null,
          ordinal: 2,
          quantity: null,
          totalValue: '260.0000',
        },
      ],
    })

    expectApiErrorCode(
      () => resolveByQuantity([invoice]),
      'CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT',
    )
  })
})

describe('resolvePredominantProduct — modo highest_weight', () => {
  test('usa o peso bruto do volume quando nenhum item traz peso próprio', () => {
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 2,
          quantity: '3.0000',
          totalValue: '150.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 11,
          quantity: '6.0000',
          totalValue: '900.0000',
        },
      ],
      volumes: [buildVolume('101.7320')],
    })

    expect(resolveByWeight([invoice])).toBe(PRODUCT.BRAVO)
  })

  test('sem peso por item, vence a nota de maior peso bruto e nela o maior valor', () => {
    const first = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: null,
          ordinal: 1,
          quantity: '4.0000',
          totalValue: '900.0000',
        },
      ],
      volumes: [buildVolume('10.0000')],
    })
    const second = buildInvoice({
      accessKey: SECOND_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 4,
          quantity: '2.0000',
          totalValue: '300.0000',
        },
        {
          description: PRODUCT.CHARLIE,
          grossWeight: null,
          ordinal: 2,
          quantity: '2.0000',
          totalValue: '300.0000',
        },
      ],
      volumes: [buildVolume('90.0000')],
    })
    const third = buildInvoice({
      accessKey: THIRD_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.DELTA,
          grossWeight: null,
          ordinal: 1,
          quantity: '1.0000',
          totalValue: '450.0000',
        },
      ],
      volumes: [buildVolume('50.0000')],
    })

    expect(resolveByWeight([first, second, third])).toBe(PRODUCT.CHARLIE)
  })

  test('com peso em todos os itens, vence o item mais pesado', () => {
    const first = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: '5.0000',
          ordinal: 1,
          quantity: '4.0000',
          totalValue: '900.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: '40.0000',
          ordinal: 2,
          quantity: '1.0000',
          totalValue: '10.0000',
        },
      ],
      volumes: [buildVolume('12.0000')],
    })
    const second = buildInvoice({
      accessKey: SECOND_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.CHARLIE,
          grossWeight: '9.0000',
          ordinal: 1,
          quantity: '2.0000',
          totalValue: '500.0000',
        },
      ],
      volumes: [buildVolume('80.0000')],
    })

    expect(resolveByWeight([first, second])).toBe(PRODUCT.BRAVO)
  })

  test('descarta a fonte por item inteira quando só parte dos itens traz peso', () => {
    const first = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ALFA,
          grossWeight: '50.0000',
          ordinal: 1,
          quantity: '1.0000',
          totalValue: '10.0000',
        },
        {
          description: PRODUCT.BRAVO,
          grossWeight: null,
          ordinal: 2,
          quantity: '3.0000',
          totalValue: '900.0000',
        },
      ],
      volumes: [buildVolume('30.0000')],
    })
    const second = buildInvoice({
      accessKey: SECOND_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.CHARLIE,
          grossWeight: null,
          ordinal: 1,
          quantity: '2.0000',
          totalValue: '100.0000',
        },
      ],
      volumes: [buildVolume('80.0000')],
    })

    expect(resolveByWeight([first, second])).toBe(PRODUCT.CHARLIE)
  })

  test('rejeita quando não há peso em item nem em volume', () => {
    const invoice = buildInvoice({
      accessKey: FIRST_ACCESS_KEY,
      products: [
        {
          description: PRODUCT.ECHO,
          grossWeight: null,
          ordinal: 1,
          quantity: '1.0000',
          totalValue: '150.0000',
        },
      ],
      volumes: [buildVolume(null)],
    })

    expectApiErrorCode(
      () => resolveByWeight([invoice]),
      'CTE_PAYLOAD_UNRESOLVED_PREDOMINANT_PRODUCT',
    )
  })
})

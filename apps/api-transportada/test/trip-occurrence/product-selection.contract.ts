/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma ocorrência aponta **vários** itens da nota. Uma caixa violada costuma levar mais de um item,
 * e a foto, a observação e o tipo são os mesmos — repetir a ocorrência por item multiplicaria o
 * mesmo fato.
 */
import { describe, expect, test } from 'bun:test'

import { buildOccurrenceAttachmentCreateFingerprint } from '../../src/trips/domain/occurrence-attachment.policy.js'
import {
  resolveOccurrenceProductCodes,
  resolveOccurrenceProductSelection,
} from '../../src/trips/domain/occurrence-scope.policy.js'
import {
  buildOccurrenceItemValues,
  renderOccurrenceTemplate,
} from '../../src/trips/domain/occurrence-template.policy.js'

const PRODUTOS = [
  { code: 'ZG-4410', description: 'Parafuso sextavado' },
  { code: 'ZG-4411', description: 'Porca' },
  { code: 'ZG-4412', description: 'Arruela' },
] as const

function recusaDe(run: () => unknown): string {
  try {
    run()
  } catch (error) {
    return (error as { readonly code: string }).code
  }
  throw new Error('esperava recusa, e nada foi lançado')
}

describe('a ocorrência aponta vários itens da nota', () => {
  test('lista vazia é a nota inteira, e o product_code gravado fica vazio', () => {
    expect(
      resolveOccurrenceProductSelection({
        productCode: '',
        productCodes: [],
        products: PRODUTOS,
      }),
    ).toEqual({ productCode: '', productCodes: [], scope: 'document' })
  })

  test('sem productCodes, o productCode sozinho continua valendo', () => {
    expect(
      resolveOccurrenceProductSelection({ productCode: 'ZG-4410', products: PRODUTOS }),
    ).toEqual({
      productCode: 'ZG-4410',
      productCodes: ['ZG-4410'],
      scope: 'product',
    })
  })

  /** Compatibilidade: a coluna antiga leva o **primeiro** item, na ordem em que foram marcados. */
  test('vários itens: o product_code gravado é o primeiro, e a ordem é preservada', () => {
    expect(
      resolveOccurrenceProductSelection({
        productCode: '',
        productCodes: ['ZG-4412', 'ZG-4410'],
        products: PRODUTOS,
      }),
    ).toEqual({
      productCode: 'ZG-4412',
      productCodes: ['ZG-4412', 'ZG-4410'],
      scope: 'product',
    })
  })

  test('o código é comparado sem espaço em volta — a etiqueta é lida com o dedo na tela', () => {
    expect(
      resolveOccurrenceProductSelection({
        productCode: '',
        productCodes: ['  ZG-4410 ', 'ZG-4411'],
        products: PRODUTOS,
      }).productCodes,
    ).toEqual(['ZG-4410', 'ZG-4411'])
  })

  /** Mandar os dois é ambiguidade do cliente: qual deles vale? Adivinhar gravaria o item errado. */
  test('productCode e productCodes juntos é conflito, nunca um deles escolhido em silêncio', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceProductSelection({
          productCode: 'ZG-4410',
          productCodes: ['ZG-4411'],
          products: PRODUTOS,
        }),
      ),
    ).toBe('OCCURRENCE_PRODUCT_SELECTION_CONFLICT')
  })

  test('o mesmo productCode nos dois campos ainda é conflito — não é repetição inofensiva', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceProductSelection({
          productCode: 'ZG-4410',
          productCodes: ['ZG-4410'],
          products: PRODUTOS,
        }),
      ),
    ).toBe('OCCURRENCE_PRODUCT_SELECTION_CONFLICT')
  })

  test('productCode vazio com lista preenchida não é conflito', () => {
    expect(
      resolveOccurrenceProductSelection({
        productCode: '',
        productCodes: ['ZG-4411'],
        products: PRODUTOS,
      }).productCodes,
    ).toEqual(['ZG-4411'])
  })

  test('item repetido na lista é recusado', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceProductSelection({
          productCode: '',
          productCodes: ['ZG-4410', ' ZG-4410'],
          products: PRODUTOS,
        }),
      ),
    ).toBe('OCCURRENCE_PRODUCT_DUPLICATE')
  })

  /**
   * ⚠️ Produto fora da nota é **recusado, nunca convertido** em "nota inteira": apontar para item
   * que a nota não tem é engano de quem registrou, e silenciá-lo gravaria ocorrência sobre carga
   * que nunca esteve ali.
   */
  test('item que não existe na nota é recusado', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceProductSelection({
          productCode: '',
          productCodes: ['ZG-4410', 'NAO-EXISTE'],
          products: PRODUTOS,
        }),
      ),
    ).toBe('OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT')
  })

  test('productCode sozinho fora da nota é recusado pelo mesmo motivo', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceProductSelection({ productCode: 'NAO-EXISTE', products: PRODUTOS }),
      ),
    ).toBe('OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT')
  })

  test('entrada vazia dentro da lista não vira nota inteira por acidente', () => {
    expect(
      recusaDe(() =>
        resolveOccurrenceProductSelection({
          productCode: '',
          productCodes: ['ZG-4410', '   '],
          products: PRODUTOS,
        }),
      ),
    ).toBe('OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT')
  })
})

/**
 * Ocorrência antiga não tem linha na tabela de junção, e o fluxo do WhatsApp grava só a coluna. A
 * leitura deriva de uma ou de outra — nunca devolve lista vazia para uma ocorrência que aponta um
 * item.
 */
describe('a leitura deriva productCodes da tabela nova ou da coluna antiga', () => {
  test('a tabela nova manda quando tem linha', () => {
    expect(
      resolveOccurrenceProductCodes({
        productCode: 'ZG-4410',
        productCodes: ['ZG-4410', 'ZG-4411'],
      }),
    ).toEqual(['ZG-4410', 'ZG-4411'])
  })

  test('ocorrência antiga cai na coluna', () => {
    expect(resolveOccurrenceProductCodes({ productCode: 'ZG-4410', productCodes: [] })).toEqual([
      'ZG-4410',
    ])
  })

  test('nota inteira antiga continua sendo lista vazia', () => {
    expect(resolveOccurrenceProductCodes({ productCode: '', productCodes: [] })).toEqual([])
  })
})

describe('o e-mail pronto cita todos os itens marcados', () => {
  const ITENS = [
    { code: 'ZG-4410', description: 'Parafuso sextavado', quantity: 12 },
    { code: 'ZG-4411', description: 'Porca', quantity: 3 },
  ] as const

  test('os três marcadores de item listam todos, na ordem marcada', () => {
    expect(buildOccurrenceItemValues(ITENS)).toEqual({
      itemCode: 'ZG-4410, ZG-4411',
      itemLabel: 'Parafuso sextavado, Porca',
      itemQuantity: '12, 3',
    })
  })

  test('um item só continua saindo sozinho, sem separador', () => {
    expect(buildOccurrenceItemValues([ITENS[0]])).toEqual({
      itemCode: 'ZG-4410',
      itemLabel: 'Parafuso sextavado',
      itemQuantity: '12',
    })
  })

  /** Nota inteira imprime vazio nos três, nunca o marcador cru no e-mail do cliente. */
  test('a nota inteira imprime vazio', () => {
    expect(buildOccurrenceItemValues([])).toEqual({
      itemCode: '',
      itemLabel: '',
      itemQuantity: '',
    })
  })

  test('o texto renderizado nomeia os dois itens', () => {
    expect(
      renderOccurrenceTemplate({
        template: 'Itens: {{item}} ({{codigoItem}}) — quantidades {{quantidadeItem}}',
        values: {
          contractorName: '',
          documentLabel: '',
          driverName: '',
          ...buildOccurrenceItemValues(ITENS),
          note: '',
          occurredOn: '',
          recipientName: '',
          stopLabel: '',
          totalValue: '',
        },
      }),
    ).toBe('Itens: Parafuso sextavado, Porca (ZG-4410, ZG-4411) — quantidades 12, 3')
  })
})

describe('a impressão de idempotência distingue seleções diferentes', () => {
  const BASE = {
    attachmentSha256: 'a'.repeat(64),
    documentId: 'd1d1d1d1-0000-4000-8000-000000000001',
    note: 'caixa violada',
    occurrenceTypeId: '00000000-0000-4000-8000-0000000000e1',
    productCode: '',
  }

  /**
   * A mesma foto, o mesmo texto e o mesmo tipo com outra seleção de itens é **outra** ocorrência.
   * Convergir para a anterior engoliria o segundo registro em silêncio.
   */
  test('outra seleção de itens é outra impressão', () => {
    expect(
      buildOccurrenceAttachmentCreateFingerprint({ ...BASE, productCodes: ['ZG-4410'] }),
    ).not.toBe(
      buildOccurrenceAttachmentCreateFingerprint({
        ...BASE,
        productCodes: ['ZG-4410', 'ZG-4411'],
      }),
    )
  })

  test('a ordem dos itens também muda a impressão — é a ordem que o e-mail cita', () => {
    expect(
      buildOccurrenceAttachmentCreateFingerprint({
        ...BASE,
        productCodes: ['ZG-4410', 'ZG-4411'],
      }),
    ).not.toBe(
      buildOccurrenceAttachmentCreateFingerprint({
        ...BASE,
        productCodes: ['ZG-4411', 'ZG-4410'],
      }),
    )
  })

  test('sem itens, a impressão é a mesma de antes desta mudança', () => {
    expect(buildOccurrenceAttachmentCreateFingerprint({ ...BASE, productCodes: [] })).toBe(
      buildOccurrenceAttachmentCreateFingerprint(BASE),
    )
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  isWholeDocumentOccurrence,
  resolveOccurrenceProductScope,
} from '../../src/trips/domain/occurrence-scope.policy.js'

const PRODUTOS = [
  { code: 'ZG-4410', description: 'CAIXA DE PARAFUSOS' },
  { code: 'ZG-9002', description: 'ROLAMENTO 6204' },
]

describe('escopo da ocorrência (spec 079)', () => {
  /**
   * ⚠️ **Vazio é a nota inteira, e é o padrão.** Recusa total não tem item a apontar — obrigar a
   * escolher um produto ali faria o motorista escolher qualquer um, e a estatística passaria a
   * dizer que um parafuso específico foi recusado quando a carga toda voltou.
   */
  test('sem produto, a ocorrência é da nota inteira', () => {
    expect(resolveOccurrenceProductScope({ productCode: '', products: PRODUTOS })).toEqual({
      productCode: '',
      scope: 'document',
    })
    expect(isWholeDocumentOccurrence({ productCode: '' })).toBe(true)
  })

  test('com produto, a ocorrência é daquele item', () => {
    expect(resolveOccurrenceProductScope({ productCode: 'ZG-4410', products: PRODUTOS })).toEqual({
      productCode: 'ZG-4410',
      scope: 'product',
    })
    expect(isWholeDocumentOccurrence({ productCode: 'ZG-4410' })).toBe(false)
  })

  /**
   * ⚠️ **Produto que não está na nota é recusado**, não convertido em "nota inteira". Apontar para
   * um item que a nota não tem é engano de quem registrou — silenciá-lo gravaria uma ocorrência
   * sobre carga que nunca esteve ali.
   */
  test('produto fora da nota é recusado', () => {
    expect(
      resolveOccurrenceProductScope({ productCode: 'NAO-EXISTE', products: PRODUTOS }),
    ).toBeNull()
  })

  /** Espaço em volta não faz do código outro código: a etiqueta é lida com o dedo na tela. */
  test('o código é comparado sem espaço em volta', () => {
    expect(
      resolveOccurrenceProductScope({ productCode: '  ZG-4410 ', products: PRODUTOS }),
    ).toEqual({ productCode: 'ZG-4410', scope: 'product' })
  })

  /** Nota sem item declarado só aceita ocorrência da nota inteira — não há item a apontar. */
  test('nota sem produtos só aceita o escopo da nota', () => {
    expect(resolveOccurrenceProductScope({ productCode: '', products: [] })).toEqual({
      productCode: '',
      scope: 'document',
    })
    expect(resolveOccurrenceProductScope({ productCode: 'ZG-4410', products: [] })).toBeNull()
  })
})

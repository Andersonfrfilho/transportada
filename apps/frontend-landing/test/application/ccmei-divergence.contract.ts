/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { listCcmeiDivergences } from '@/modules/application/shared/ccmei.service'

const TYPED = {
  companyLegalName: '',
  companyOpenedAt: '',
  taxId: '',
} as const

describe('divergência entre o que foi digitado e o que o CCMEI diz', () => {
  /**
   * O CNPJ digitado é da pessoa e o documento é conferência — inverter isso faria o arquivo anexado
   * reescrever o cadastro de quem o anexou.
   */
  test('CNPJ diferente do digitado é sinalizado', () => {
    const divergences = listCcmeiDivergences({
      current: { ...TYPED, taxId: '11.222.333/0001-81' },
      values: { cnpj: '30213061000106' },
    })

    expect(divergences).toEqual([
      { declared: '11222333000181', field: 'taxId', read: '30213061000106' },
    ])
  })

  /** A máscara é do teclado, não do dado: comparar com ponto e barra acusaria divergência falsa. */
  test('o mesmo CNPJ com e sem máscara não é divergência', () => {
    const divergences = listCcmeiDivergences({
      current: { ...TYPED, taxId: '30.213.061/0001-06' },
      values: { cnpj: '30213061000106' },
    })

    expect(divergences).toEqual([])
  })

  /** Campo vazio não é divergência: é o campo que o documento vai preencher. */
  test('campo em branco não diverge de nada', () => {
    const divergences = listCcmeiDivergences({
      current: TYPED,
      values: { cnpj: '30213061000106', legalName: 'FULANO DE TAL' },
    })

    expect(divergences).toEqual([])
  })

  /** Campo que o documento não trouxe também não diverge — ausência nunca é conflito. */
  test('campo que o documento não trouxe não diverge', () => {
    const divergences = listCcmeiDivergences({
      current: { ...TYPED, taxId: '30.213.061/0001-06' },
      values: {},
    })

    expect(divergences).toEqual([])
  })

  test('razão social e data de abertura também são conferidas', () => {
    const divergences = listCcmeiDivergences({
      current: {
        companyLegalName: 'OUTRA EMPRESA LTDA',
        companyOpenedAt: '2018-04-17',
        taxId: '',
      },
      values: { legalName: 'FULANO DE TAL 123', openedAt: '2020-01-02' },
    })

    expect(divergences).toHaveLength(2)
    expect(divergences.map((divergence) => divergence.field).sort()).toEqual([
      'companyLegalName',
      'companyOpenedAt',
    ])
  })
})

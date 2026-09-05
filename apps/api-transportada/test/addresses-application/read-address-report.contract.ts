/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { AddressReportRow } from '../../src/addresses/application/address-report.port.js'
import { createReadAddressReportUseCase } from '../../src/addresses/application/read-address-report.use-case.js'

const LINHA: AddressReportRow = {
  addressKey: '3527256|14210000|533',
  city: 'LUIS ANTONIO',
  cityMismatch: false,
  comparedAt: new Date('2026-09-04T12:00:00Z'),
  contractorName: 'ZARAGOZA',
  contractorTaxId: '11222333000181',
  distanceMetres: 175,
  matchLevel: 'rooftop',
  noteDistrict: 'Centro',
  noteNumber: '533',
  notePostalCode: '14210-000',
  noteStreet: 'RUA CAP AUGUSTO DE ALMEIDA',
  providerDistrict: 'Centro',
  providerNumber: '533',
  providerPostalCode: '14210-000',
  providerStreet: 'Rua Capitão Augusto de Almeida',
  state: 'SP',
}

function relatorio(
  linhas: readonly AddressReportRow[],
  naoResolvidos: readonly AddressReportRow[] = [],
) {
  return createReadAddressReportUseCase({
    repository: {
      read: async () => ({ measurements: linhas, unresolved: naoResolvidos }),
    },
  }).read({ companyId: 'empresa-1' })
}

/** ADR-0062: o que a rotina paga tentou e não conseguiu apontar. Sem medição guardada. */
const NAO_RESOLVIDO: AddressReportRow = {
  ...LINHA,
  addressKey: '3527256|14210000|999',
  distanceMetres: null,
  matchLevel: 'not_found',
  providerDistrict: '',
  providerNumber: '',
  providerPostalCode: '',
  providerStreet: '',
}

describe('relatório de endereços a corrigir (spec 084, G8)', () => {
  /**
   * ⚠️ **O denominador viaja junto, e não é enfeite.** "24 endereços a corrigir" sozinho parece uma
   * base podre; "24 de 148 medidos" diz que o cadastro está majoritariamente bom. É a diferença
   * entre um pedido e uma acusação, e quem recebe o relatório é um cliente.
   */
  test('publica quantos foram medidos, não só quantos têm pedido', async () => {
    const { totals } = await relatorio([
      LINHA,
      { ...LINHA, addressKey: 'b', providerStreet: 'Avenida Júlio Macari' },
    ])

    expect(totals).toEqual({ measured: 2, needingAttention: 1 })
  })

  test('endereço sem pedido não aparece no relatório', async () => {
    const { groups } = await relatorio([LINHA])
    expect(groups).toEqual([])
  })

  test('agrupa por quem emitiu a nota, que é quem corrige o cadastro', async () => {
    const { groups } = await relatorio([
      { ...LINHA, addressKey: 'a', providerStreet: 'Avenida Júlio Macari' },
      { ...LINHA, addressKey: 'b', providerStreet: 'Rua Outra Coisa Totalmente' },
      {
        ...LINHA,
        addressKey: 'c',
        contractorName: 'OUTRA',
        contractorTaxId: '99888777000166',
        matchLevel: 'not_found',
        providerStreet: '',
      },
    ])

    expect(groups).toHaveLength(2)
    /** `street_unknown` é mais grave que `street_different`: quem o tem vem primeiro. */
    expect(groups[0]?.contractorTaxId).toBe('99888777000166')
    expect(groups[1]?.findings).toHaveLength(2)
  })

  /**
   * ⚠️ **Ordenar só por quantidade poria no topo o contratante com dez cadastros curtos**, que é o
   * achado mais brando — e empurraria para baixo quem tem um logradouro que não existe.
   */
  test('quantidade só desempata quando a gravidade é a mesma', async () => {
    const curtos = Array.from({ length: 5 }, (_unused, index) => ({
      ...LINHA,
      addressKey: `curto-${index}`,
      contractorName: 'MUITOS CURTOS',
      contractorTaxId: '11111111000111',
      noteStreet: 'RUA MARECHAL FLORIANO',
      providerStreet: 'Rua Marechal Floriano Peixoto',
    }))

    const { groups } = await relatorio([
      ...curtos,
      { ...LINHA, addressKey: 'grave', matchLevel: 'not_found', providerStreet: '' },
    ])

    expect(groups[0]?.contractorTaxId).toBe('11222333000181')
    expect(groups[0]?.findings[0]?.kind).toBe('street_unknown')
  })

  /** Dentro do mesmo pedido, o mais distante primeiro: é onde o caminhão erra mais. */
  test('empate de gravidade ordena pela distância', async () => {
    const { groups } = await relatorio([
      { ...LINHA, addressKey: 'perto', distanceMetres: 90, providerStreet: 'Avenida Júlio Macari' },
      {
        ...LINHA,
        addressKey: 'longe',
        distanceMetres: 4200,
        providerStreet: 'Avenida Júlio Macari',
      },
    ])

    expect(groups[0]?.findings.map((finding) => finding.addressKey)).toEqual(['longe', 'perto'])
  })

  /**
   * ⚠️ **O não resolvido não passa pelo classificador** (ADR-0062). Ele tem `matchLevel: not_found`
   * e rua do provedor vazia, que é exatamente o que `resolveAddressFinding` chamaria de
   * `street_unknown` — e são coisas diferentes: ali o provedor conhece o município e não a rua;
   * aqui ele não pôs a carga em lugar nenhum, e a entrega sai com palpite de ~8 km.
   */
  test('o endereço que nem pagando foi apontado vira o achado mais grave', async () => {
    const { groups, totals } = await relatorio([], [NAO_RESOLVIDO])

    expect(groups[0]?.findings[0]?.kind).toBe('coordinate_unresolved')
    expect(totals).toEqual({ measured: 1, needingAttention: 1 })
  })

  test('o não resolvido vem antes de qualquer divergência de texto do mesmo cliente', async () => {
    const { groups } = await relatorio(
      [{ ...LINHA, addressKey: 'a', providerStreet: 'Avenida Júlio Macari' }],
      [NAO_RESOLVIDO],
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.findings.map((finding) => finding.kind)).toEqual([
      'coordinate_unresolved',
      'street_different',
    ])
  })

  /** O denominador soma as duas origens: as duas custaram uma consulta ao provedor. */
  test('conta no denominador o que a rotina paga tentou', async () => {
    const { totals } = await relatorio([LINHA], [NAO_RESOLVIDO])

    expect(totals.measured).toBe(2)
  })
})

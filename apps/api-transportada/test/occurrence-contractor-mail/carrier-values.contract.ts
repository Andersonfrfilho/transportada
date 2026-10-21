/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 T2.3 (ADR-0110 §5, D5/D16): as variáveis de texto da transportadora e da contratante, e o catálogo.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES,
  OCCURRENCE_CONTRACTOR_MAIL_VARIABLES,
  OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES,
} from '../../src/occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import {
  buildOccurrenceMailIdentityValues,
  formatContractorTaxId,
} from '../../src/occurrence-conversation/domain/occurrence-mail-carrier-values.policy.js'

const CARRIER = {
  city: 'Ribeirão Preto',
  cnpj: '11444777000161',
  displayName: 'Alfa Transportes',
  hasLogo: false,
  legalName: 'Alfa Transportes e Logística Ltda',
  state: 'SP',
} as const

const NEW_TEXT_VARIABLES = [
  'nomeExibicao',
  'cnpjTransportadora',
  'cnpjContratante',
  'assinaturaNome',
  'assinaturaCargo',
  'cidadeTransportadora',
  'razaoSocialTransportadora',
  'assinaturaIniciais',
] as const

describe('spec 272 D5: o documento da contratante', () => {
  test.each([
    { expected: '123.456.789-09', input: '12345678909', label: 'onze dígitos: CPF' },
    { expected: '123.456.789-09', input: '123.456.789-09', label: 'CPF já pontuado' },
    { expected: '11.222.333/0001-81', input: '11222333000181', label: 'catorze dígitos: CNPJ' },
    { expected: '12.ABC.345/01DE-35', input: '12ABC34501DE35', label: 'CNPJ alfanumérico' },
    { expected: '', input: null, label: 'sem documento' },
    { expected: '', input: '', label: 'documento vazio' },
    { expected: '', input: '12345', label: 'tamanho que não é de documento' },
    { expected: '', input: '1234567890123X', label: 'catorze posições que não fecham CNPJ' },
  ] as const)('$label', ({ expected, input }) => {
    expect(formatContractorTaxId(input)).toBe(expected)
  })
})

describe('spec 272 D5/D16: os valores de texto da identidade', () => {
  test('transportadora e contratante', () => {
    expect(
      buildOccurrenceMailIdentityValues({ carrier: CARRIER, contractorTaxId: '11222333000181' }),
    ).toEqual({
      cidadeTransportadora: 'Ribeirão Preto · SP',
      cnpjContratante: '11.222.333/0001-81',
      cnpjTransportadora: '11.444.777/0001-61',
      nomeExibicao: 'Alfa Transportes',
      razaoSocialTransportadora: 'Alfa Transportes e Logística Ltda',
    })
  })

  test('contratante sem documento: vazio, não "null"', () => {
    expect(
      buildOccurrenceMailIdentityValues({ carrier: CARRIER, contractorTaxId: null })
        .cnpjContratante,
    ).toBe('')
  })

  test('cidade ou UF faltando: sem o separador solto', () => {
    const values = (city: string, state: string) =>
      buildOccurrenceMailIdentityValues({
        carrier: { ...CARRIER, city, state },
        contractorTaxId: null,
      }).cidadeTransportadora
    expect(values('Ribeirão Preto', '')).toBe('Ribeirão Preto')
    expect(values('', 'SP')).toBe('SP')
    expect(values('', '')).toBe('')
  })
})

describe('spec 272 D5: o catálogo da API', () => {
  test('as oito variáveis de texto e as cinco de HTML do sistema entram, com descrição', () => {
    for (const name of [...NEW_TEXT_VARIABLES, ...OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES]) {
      expect(OCCURRENCE_CONTRACTOR_MAIL_VARIABLE_NAMES.has(name)).toBe(true)
    }
    for (const variable of OCCURRENCE_CONTRACTOR_MAIL_VARIABLES) {
      expect(variable.description.trim()).not.toBe('')
    }
    expect(OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.length).toBe(
      new Set(OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.map((variable) => variable.name)).size,
    )
    expect(OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.length).toBe(17 + 13)
  })

  test('a ordem do catálogo: as 17 da 271 primeiro, as 13 da 272 depois', () => {
    expect(OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.slice(17).map((variable) => variable.name)).toEqual(
      [
        'nomeExibicao',
        'cnpjTransportadora',
        'cnpjContratante',
        'assinaturaNome',
        'assinaturaCargo',
        'logoTransportadora',
        'tabelaItens',
        'cidadeTransportadora',
        'razaoSocialTransportadora',
        'assinaturaIniciais',
        'faixaResposta',
        'marcasRodape',
        'logoAssinatura',
      ],
    )
  })
})

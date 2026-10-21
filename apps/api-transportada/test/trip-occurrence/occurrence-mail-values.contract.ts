/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.3: os valores que o modelo `occurrence` recebe — os mesmos que o texto do tipo recebia
 * (`{{camelCase}}`), agora com as chaves `{snake_case}` do catálogo. Tabela espelhada: o esperado é
 * escrito à mão, não calculado pela função.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRENCE_CONTRACTOR_MAIL_VARIABLES,
  OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES,
} from '../../src/occurrence-conversation/domain/occurrence-contractor-mail.constant.js'
import { buildOccurrenceMailIdentityValues } from '../../src/occurrence-conversation/domain/occurrence-mail-carrier-values.policy.js'
import { buildSignerValues } from '../../src/occurrence-conversation/domain/occurrence-mail-signer.policy.js'
import {
  buildContractorMailValues,
  buildOccurrenceItemValues,
} from '../../src/trips/domain/occurrence-mail-values.policy.js'
import type {
  OccurrenceMailLine,
  OccurrenceMailValues,
} from '../../src/trips/domain/occurrence-mail-values.types.js'

const LINE_A: OccurrenceMailLine = {
  code: '7000001 01',
  declaredAmount: null,
  description: 'PRODUTO EXEMPLO A 500G',
  nfeQuantity: '10.000',
  quantity: '1.000',
  totalValue: '572.0000',
  unit: 'FD',
  unitValue: '57.2000',
}

const LINE_B: OccurrenceMailLine = {
  code: '7000002 02',
  declaredAmount: '10.0000',
  description: 'PRODUTO EXEMPLO B 1KG',
  nfeQuantity: '6.000',
  quantity: '2.500',
  totalValue: '119.9700',
  unit: 'CX',
  unitValue: '19.9950',
}

const VALUES: OccurrenceMailValues = {
  contractorName: 'Contratante Exemplo',
  declaredAmount: null,
  documentLabel: '123456/1',
  documentNumber: '123456',
  driverName: 'Motorista Exemplo',
  itemCode: '7000001 01, 7000002 02',
  itemLabel: 'PRODUTO EXEMPLO A 500G, PRODUTO EXEMPLO B 1KG',
  itemQuantity: '1, 2,5',
  lines: [LINE_A, LINE_B],
  note: 'Avaria identificada',
  occurrenceTypeName: 'Avaria',
  occurredOn: '01/01/2026',
  recipientName: 'Supermercado Exemplo Ltda',
  referenceNumber: '45029',
  stopLabel: 'Rua Exemplo, 100',
  totalValue: '7840.6400',
}

describe('valores do e-mail da ocorrência (spec 271 T2.2)', () => {
  test('o nível do e-mail traz as chaves camelCase com os valores de hoje, mais tipoOcorrencia e linhasItens', () => {
    expect(buildContractorMailValues(VALUES).mail).toEqual({
      codigosItens: '7000001 01, 7000002 02',
      contratante: 'Contratante Exemplo',
      data: '01/01/2026',
      itens: 'PRODUTO EXEMPLO A 500G, PRODUTO EXEMPLO B 1KG',
      linhasItens:
        '7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20\n7000002 02 – PRODUTO EXEMPLO B 1KG – 2,5 CX – R$ 10,00',
      motorista: 'Motorista Exemplo',
      numeroNota: '123456/1',
      numeroNotaSemSerie: '123456',
      numeroReferencia: '45029',
      observacao: 'Avaria identificada',
      parada: 'Rua Exemplo, 100',
      quantidadesItens: '1, 2,5',
      razaoSocial: 'Supermercado Exemplo Ltda',
      somaItens: '107,19',
      tipoOcorrencia: 'Avaria',
      valorDeclarado: '67,20',
      valorNota: '7.840,64',
    })
  })

  test('uma linha por item, na ordem em que foram marcados', () => {
    expect(buildContractorMailValues(VALUES).itemLines).toEqual([
      '7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20',
      '7000002 02 – PRODUTO EXEMPLO B 1KG – 2,5 CX – R$ 10,00',
    ])
  })

  test('um item vira uma linha só', () => {
    const { itemLines, mail } = buildContractorMailValues({ ...VALUES, lines: [LINE_A] })

    expect(itemLines).toEqual(['7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20'])
    expect(mail.linhasItens).toBe('7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20')
  })

  test('três itens viram três linhas', () => {
    const { mail } = buildContractorMailValues({ ...VALUES, lines: [LINE_A, LINE_B, LINE_A] })

    expect(mail.linhasItens?.split('\n')).toHaveLength(3)
  })

  test('201 itens: 200 linhas e "e mais 1 item"', () => {
    const lines = Array.from({ length: 201 }, () => LINE_A)
    const { itemLines, mail } = buildContractorMailValues({ ...VALUES, lines })
    const printed = mail.linhasItens?.split('\n') ?? []

    expect(itemLines).toHaveLength(201)
    expect(printed).toHaveLength(201)
    expect(printed[199]).toBe('7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20')
    expect(printed[200]).toBe('e mais 1 item')
  })

  test('202 itens: "e mais 2 itens" no plural', () => {
    const lines = Array.from({ length: 202 }, () => LINE_A)

    expect(
      buildContractorMailValues({ ...VALUES, lines }).mail.linhasItens?.endsWith('e mais 2 itens'),
    ).toBe(true)
  })

  test('item sem código imprime a linha sem o código, nunca com um traço solto', () => {
    const { itemLines } = buildContractorMailValues({
      ...VALUES,
      lines: [{ ...LINE_A, code: '' }],
    })

    expect(itemLines).toEqual(['PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20'])
  })

  test('o valor pago da ocorrência vence a soma dos valores das linhas', () => {
    const { mail } = buildContractorMailValues({ ...VALUES, declaredAmount: '0.0000' })

    expect(mail.valorDeclarado).toBe('0,00')
  })

  test('sem linha, a soma e o valor pago saem vazios e não há linha de item', () => {
    const { itemLines, mail } = buildContractorMailValues({
      ...VALUES,
      itemCode: '',
      itemLabel: '',
      itemQuantity: '',
      lines: undefined,
    })

    expect(itemLines).toEqual([])
    expect(mail.somaItens).toBe('')
    expect(mail.valorDeclarado).toBe('')
    expect(mail.itens).toBe('')
    expect(mail.linhasItens).toBe('')
  })

  test('campo opcional ausente sai vazio, nunca undefined', () => {
    const { mail } = buildContractorMailValues({
      ...VALUES,
      documentNumber: undefined,
      referenceNumber: undefined,
      totalValue: '',
    })

    expect(mail.numeroNotaSemSerie).toBe('')
    expect(mail.numeroReferencia).toBe('')
    expect(mail.valorNota).toBe('')
  })

  /**
   * Spec 272: o catálogo tem quatro origens — a nota e a ocorrência (este módulo), a transportadora e a contratante,
   * o assinante e o HTML do sistema —, e juntas cobrem a lista fechada, sem sobra nem falta.
   */
  test('cobre exatamente a lista fechada de variáveis', () => {
    const { mail } = buildContractorMailValues(VALUES)
    const identity = buildOccurrenceMailIdentityValues({
      carrier: {
        city: '',
        cnpj: '',
        displayName: '',
        hasLogo: false,
        legalName: '',
        state: '',
      },
      contractorTaxId: null,
    })
    const signer = buildSignerValues({ companyDisplayName: '', signer: { kind: 'team' } })

    expect(
      [
        ...Object.keys(mail),
        ...Object.keys(identity),
        ...Object.keys(signer),
        ...OCCURRENCE_MAIL_SYSTEM_HTML_VARIABLES,
      ].toSorted(),
    ).toEqual(OCCURRENCE_CONTRACTOR_MAIL_VARIABLES.map((variable) => variable.name).toSorted())
  })
})

describe('os valores que agregam os itens seguem como eram, com a quantidade formatada (spec 247 RF8, D5)', () => {
  const ITENS = [
    { code: 'ZG-4410', description: 'Parafuso sextavado', quantity: '12.000' },
    { code: 'ZG-4411', description: 'Porca', quantity: '2.500' },
  ] as const

  test('a quantidade da ocorrência sai sem zeros à direita, e os itens seguem juntos por vírgula', () => {
    expect(buildOccurrenceItemValues(ITENS)).toEqual({
      itemCode: 'ZG-4410, ZG-4411',
      itemLabel: 'Parafuso sextavado, Porca',
      itemQuantity: '12, 2,5',
    })
  })

  test('quantidade numérica continua aceita', () => {
    expect(buildOccurrenceItemValues([{ code: 'A', description: 'B', quantity: 2.5 }])).toEqual({
      itemCode: 'A',
      itemLabel: 'B',
      itemQuantity: '2,5',
    })
  })
})

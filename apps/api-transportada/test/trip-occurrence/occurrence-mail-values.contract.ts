/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 269 T2.3: os valores que o modelo `occurrence` recebe — os mesmos que o texto do tipo recebia
 * (`{{camelCase}}`), agora com as chaves `{snake_case}` do catálogo. Tabela espelhada: o esperado é
 * escrito à mão, não calculado pela função.
 */
import { describe, expect, test } from 'bun:test'

import { MAIL_TEMPLATE_CATALOG } from '../../src/contractor-mail/domain/mail-template-catalog.constant.js'
import {
  buildOccurrenceItemValues,
  buildOccurrenceMailValues,
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
  occurredOn: '01/01/2026',
  recipientName: 'Supermercado Exemplo Ltda',
  referenceNumber: '45029',
  stopLabel: 'Rua Exemplo, 100',
  totalValue: '7840.6400',
}

describe('valores do e-mail da ocorrência (spec 269 T2.3)', () => {
  test('o nível do e-mail traz as chaves snake_case com os valores de hoje', () => {
    expect(buildOccurrenceMailValues(VALUES).mail).toEqual({
      codigos_itens: '7000001 01, 7000002 02',
      contratante: 'Contratante Exemplo',
      data: '01/01/2026',
      itens: 'PRODUTO EXEMPLO A 500G, PRODUTO EXEMPLO B 1KG',
      motorista: 'Motorista Exemplo',
      numero_nota: '123456/1',
      numero_nota_sem_serie: '123456',
      numero_referencia: '45029',
      observacao: 'Avaria identificada',
      parada: 'Rua Exemplo, 100',
      quantidades_itens: '1, 2,5',
      razao_social: 'Supermercado Exemplo Ltda',
      soma_itens: '107,19',
      valor_declarado: '67,20',
      valor_nota: '7.840,64',
    })
  })

  test('cada item traz as chaves de item, uma por linha', () => {
    expect(buildOccurrenceMailValues(VALUES).items).toEqual([
      {
        codigo_item: '7000001 01',
        item: 'PRODUTO EXEMPLO A 500G',
        quantidade_item: '1',
        soma_item: '57,20',
        unidade_item: 'FD',
        valor_item: '57,20',
        valor_unitario_item: '57,20',
      },
      {
        codigo_item: '7000002 02',
        item: 'PRODUTO EXEMPLO B 1KG',
        quantidade_item: '2,5',
        soma_item: '49,99',
        unidade_item: 'CX',
        valor_item: '10,00',
        valor_unitario_item: '20,00',
      },
    ])
  })

  test('o valor pago da ocorrência vence a soma dos valores das linhas', () => {
    const { mail } = buildOccurrenceMailValues({ ...VALUES, declaredAmount: '0.0000' })

    expect(mail.valor_declarado).toBe('0,00')
  })

  test('sem linha, a soma e o valor pago saem vazios e não há item', () => {
    const { items, mail } = buildOccurrenceMailValues({
      ...VALUES,
      itemCode: '',
      itemLabel: '',
      itemQuantity: '',
      lines: undefined,
    })

    expect(items).toEqual([])
    expect(mail.soma_itens).toBe('')
    expect(mail.valor_declarado).toBe('')
    expect(mail.itens).toBe('')
  })

  test('campo opcional ausente sai vazio, nunca undefined', () => {
    const { mail } = buildOccurrenceMailValues({
      ...VALUES,
      documentNumber: undefined,
      referenceNumber: undefined,
      totalValue: '',
    })

    expect(mail.numero_nota_sem_serie).toBe('')
    expect(mail.numero_referencia).toBe('')
    expect(mail.valor_nota).toBe('')
  })

  test('cobre exatamente as variáveis do catálogo, nos dois níveis', () => {
    const { items, mail } = buildOccurrenceMailValues(VALUES)
    const catalog = MAIL_TEMPLATE_CATALOG.occurrence

    expect(Object.keys(mail).toSorted()).toEqual(
      catalog.mailVariables.map((variable) => variable.name).toSorted(),
    )
    expect(Object.keys(items[0] ?? {}).toSorted()).toEqual(
      catalog.itemVariables.map((variable) => variable.name).toSorted(),
    )
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

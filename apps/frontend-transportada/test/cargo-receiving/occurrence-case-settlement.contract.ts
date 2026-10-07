/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: o rascunho do acerto da avaria de recebimento (decisão `goods_paid`) vira o corpo que a API lê
 * (`occurrence-settlement.schema.ts`, `occurrence-settlement.policy.ts`): valor mascarado pt-BR → decimal em texto,
 * `amountSource: 'manual'`, nunca `payerId` (sem viagem não há motorista: `driver` exigiria um), pagador entre
 * transportadora, contratante e seguradora. A linha incompleta ou repetida é nomeada, nunca descartada em silêncio.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildSettlementItems,
  listSettlementRowIssues,
  toSettlementDraftRows,
  type SettlementDraftRow,
} from '@/modules/cargo-receiving/shared/cargoSettlement.service'
import { CARGO_SETTLEMENT_PAYER_KINDS } from '@/modules/cargo-receiving/shared/cargoOccurrenceCase.constant'

const row = (overrides: Partial<SettlementDraftRow> = {}): SettlementDraftRow => ({
  amount: '1.234,50',
  id: 'row-1',
  payerKind: 'carrier',
  productCode: 'P-100',
  ...overrides,
})

describe('o corpo do acerto', () => {
  test('valor mascarado vira decimal, a origem é manual e nenhum `payerId` viaja', () => {
    expect(buildSettlementItems([row()])).toEqual([
      { amount: '1234.50', amountSource: 'manual', payerKind: 'carrier', productCode: 'P-100' },
    ])
  })

  test('uma linha por item, na ordem digitada, com o pagador de cada uma', () => {
    const items = buildSettlementItems([
      row({ amount: '10,00', id: 'a', payerKind: 'contractor', productCode: 'P-100' }),
      row({ amount: '0,99', id: 'b', payerKind: 'insurer', productCode: 'P-200' }),
    ])

    expect(items.map((item) => [item.productCode, item.amount, item.payerKind])).toEqual([
      ['P-100', '10.00', 'contractor'],
      ['P-200', '0.99', 'insurer'],
    ])
  })

  test('o motorista não é pagador possível: sem viagem não há `payerId` para mandar', () => {
    expect([...CARGO_SETTLEMENT_PAYER_KINDS]).toEqual(['carrier', 'contractor', 'insurer'])
  })
})

describe('a linha que não pode seguir', () => {
  test('sem item escolhido ou sem valor positivo, a linha diz o que falta', () => {
    const issues = listSettlementRowIssues([
      row({ id: 'sem-item', productCode: '' }),
      row({ amount: '', id: 'sem-valor', productCode: 'P-200' }),
      row({ amount: '0,00', id: 'zerada', productCode: 'P-300' }),
      row({ id: 'ok', productCode: 'P-400' }),
    ])

    expect(issues.get('sem-item')).toEqual(['productCodeRequired'])
    expect(issues.get('sem-valor')).toEqual(['amountRequired'])
    expect(issues.get('zerada')).toEqual(['amountRequired'])
    expect(issues.has('ok')).toBe(false)
  })

  test('o mesmo item em duas linhas é recusado antes do servidor: ele grava um acerto por item', () => {
    const issues = listSettlementRowIssues([
      row({ id: 'a', productCode: 'P-100' }),
      row({ id: 'b', productCode: 'P-100' }),
    ])

    expect(issues.get('b')).toEqual(['productCodeDuplicated'])
    expect(issues.has('a')).toBe(false)
  })

  test('nenhuma linha é nenhum acerto: o envio não sai vazio', () => {
    expect(buildSettlementItems([])).toEqual([])
    expect(listSettlementRowIssues([]).size).toBe(0)
  })
})

describe('o acerto que já está gravado volta ao formulário', () => {
  test('o decimal da API chega mascarado, como o operador o digitaria', () => {
    const rows = toSettlementDraftRows({
      createId: (index) => `row-${String(index)}`,
      items: [
        { amount: '120.0000', amountSource: 'manual', payerKind: 'insurer', productCode: 'P-100' },
      ],
    })

    expect(rows).toEqual([
      { amount: '120,00', id: 'row-0', payerKind: 'insurer', productCode: 'P-100' },
    ])
  })

  test('item gravado com pagador que a tela não oferece (motorista) cai para a transportadora, nunca some', () => {
    const rows = toSettlementDraftRows({
      createId: (index) => `row-${String(index)}`,
      items: [{ amount: '5.0000', amountSource: 'nfe', payerKind: 'driver', productCode: 'P-100' }],
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]?.payerKind).toBe('carrier')
  })
})

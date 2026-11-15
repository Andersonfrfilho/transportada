/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { isDirectExpenseIntent } from '../../src/whatsapp/domain/direct-expense-intent.policy.js'

describe('o financeiro que também é motorista no 1:1', () => {
  it('conta, boleto e pagamento vão ao assistente', () => {
    for (const text of [
      'conta',
      'quero lançar uma conta',
      'Contas do mês',
      'tenho um boleto',
      'preciso pagar o aluguel',
      'dar baixa em conta',
    ]) {
      expect(isDirectExpenseIntent(text)).toBe(true)
    }
  })

  it('abrir a conversa também mostra o menu do assistente', () => {
    for (const text of ['oi', 'Olá!', 'menu', 'opções', 'Bom dia', 'ajuda']) {
      expect(isDirectExpenseIntent(text)).toBe(true)
    }
  })

  it('comando de rota e baixa de entrega seguem no fluxo do motorista', () => {
    for (const text of [
      'cheguei',
      'saí',
      'entreguei 17234',
      'dar baixa na nota 123',
      'não entreguei 17234',
      '',
    ]) {
      expect(isDirectExpenseIntent(text)).toBe(false)
    }
  })
})

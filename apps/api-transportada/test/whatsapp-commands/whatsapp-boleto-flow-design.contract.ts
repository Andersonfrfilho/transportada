/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T5.2 (critério 1): o fluxo 8 (Boleto) de `specs/300-o-bot-fala-num-padrao-so/conversas.html` —
 * o boleto que chegou, o que ainda não chegou e o pedido de novo —, comparado inteiro.
 */
import { describe, expect, test } from 'bun:test'

import { GROUP_BOLETO_RESEND_TEXT } from '../../src/whatsapp/application/whatsapp-group-boleto-resend.service.js'
import { GROUP_BOLETO_RETURN_TEXT } from '../../src/occurrence-conversation/infrastructure/whatsapp-group-boleto-return.support.js'

const BOLETO_SUMMARY = {
  clientName: 'RETA ALIMENTOS LTDA',
  documentNumber: '899839',
  series: '',
  typeName: 'Prorrogação do boleto',
} as const

describe('spec 300 T5.2 — fluxo 8 Boleto', () => {
  test('boleto atualizado: nota e tipo em citação, conferência e conclusão', () => {
    expect(GROUP_BOLETO_RETURN_TEXT.clientSent(BOLETO_SUMMARY, ['(16) ****-4821'], true)).toBe(
      [
        '📄 *Boleto atualizado · NF `899839`*',
        '> 🏪 RETA ALIMENTOS LTDA',
        '> ⚠️ Prorrogação do boleto',
        '',
        '📨 A contratante respondeu e o boleto já foi enviado ao cliente: *(16) ****-4821*.',
        '',
        '✅ *Antes de pagar, o cliente confere:*',
        '💰 o valor · 📅 o vencimento · 🏦 o beneficiário',
        '',
        '🏁 *Ocorrência concluída.*',
      ].join('\n'),
    )
  })

  test('ainda não chegou: a nota e o jeito de pedir de novo', () => {
    expect(GROUP_BOLETO_RETURN_TEXT.overdue(BOLETO_SUMMARY)).toBe(
      [
        '⏳ *NF `899839` · o boleto ainda não chegou*',
        'A contratante não respondeu no prazo, e o escritório já foi avisado.',
        '',
        '➡️ _Para pedir de novo:_ me marque e escreva *pedir boleto de novo 899839*',
      ].join('\n'),
    )
  })

  test('pedir de novo: confirmação do pedido', () => {
    expect(GROUP_BOLETO_RESEND_TEXT.sent('899839')).toBe(
      [
        '📨 *Pedi de novo o boleto da NF `899839`.*',
        'Assim que a contratante responder, ele vem para cá.',
      ].join('\n'),
    )
  })
})

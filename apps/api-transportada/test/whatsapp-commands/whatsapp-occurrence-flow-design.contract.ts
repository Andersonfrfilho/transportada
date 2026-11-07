/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T5.1 (critério 1): o fluxo 7 (Ocorrência) de `specs/300-o-bot-fala-num-padrao-so/conversas.html` —
 * nota, tipo, contato, observação, confirmação, registro e "só pelo aplicativo" —, comparado inteiro. O texto
 * é o mesmo no grupo e na conversa individual.
 */
import { describe, expect, test } from 'bun:test'

import {
  GROUP_OCCURRENCE_TEXT,
  type GroupOccurrenceType,
} from '../../src/whatsapp/application/whatsapp-group-occurrence-flow.service.js'
import { describeWhatsAppDriverEventRefusal } from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'

const OCCURRENCE_TYPES: readonly GroupOccurrenceType[] = [
  { id: 'type-a', name: 'Prorrogação do boleto' },
  { id: 'type-b', name: 'Avaria parcial' },
  { id: 'type-c', name: 'Cliente pediu outro dia' },
]

describe('spec 300 T5.1 — fluxo 7 Ocorrência', () => {
  test('em qual nota: nota e cliente em negrito por opção', () => {
    expect(
      GROUP_OCCURRENCE_TEXT.askDocument([
        { id: 'doc-a', number: '899839', recipientName: 'RETA ALIMENTOS LTDA' },
        { id: 'doc-b', number: '899836', recipientName: 'RETA ALIMENTOS LTDA' },
        { id: 'doc-c', number: '899862', recipientName: 'SUPERMERCADO SAO PAULO LTDA' },
      ]),
    ).toBe(
      [
        '⚠️ *Em qual nota é a ocorrência?*',
        '',
        '*1* - 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '*2* - 🧾 NF `899836` · *RETA ALIMENTOS LTDA*',
        '*3* - 🧾 NF `899862` · *SUPERMERCADO SAO PAULO LTDA*',
        '',
        '_Responda com o número da opção ou da nota._',
      ].join('\n'),
    )
  })

  test('qual ocorrência: nota em citação e tipos com ícone', () => {
    expect(
      GROUP_OCCURRENCE_TEXT.askType(OCCURRENCE_TYPES, {
        clientName: 'RETA ALIMENTOS LTDA',
        documentNumber: '899839',
      }),
    ).toBe(
      [
        '⚠️ *Qual ocorrência?*',
        '> 🧾 NF `899839` · RETA ALIMENTOS LTDA',
        '',
        '*1* - ⚠️ Prorrogação do boleto',
        '*2* - ⚠️ Avaria parcial',
        '*3* - ⚠️ Cliente pediu outro dia',
        '',
        '_Responda com o número ou o nome._',
      ].join('\n'),
    )
  })

  test('contato: o cadastrado em citação, com a opção de usar', () => {
    expect(
      GROUP_OCCURRENCE_TEXT.askContactKnown([
        { addressMasked: '(16) ****-4821', channel: 'whatsapp' },
      ]),
    ).toBe(
      [
        '📇 *Contato do cliente para o boleto*',
        'O cliente já tem este contato:',
        '> 📱 *(16) ****-4821*',
        '',
        '*1* - ✅ Usar este contato',
        'Ou escreva outro telefone com DDD ou e-mail.',
        '_Sem contato agora? Responda continuar e o boleto volta aqui pelo grupo._',
      ].join('\n'),
    )
  })

  test('observação: pergunta e como pular', () => {
    expect(GROUP_OCCURRENCE_TEXT.askNote).toBe(
      ['📝 *Quer acrescentar uma observação?*', 'Escreva agora. _Se não, responda pular._'].join(
        '\n',
      ),
    )
  })

  test('confirmação: a nota em citação e "Posso registrar?"', () => {
    expect(
      GROUP_OCCURRENCE_TEXT.confirm(
        'Prorrogação do boleto',
        '899839',
        'cliente pediu 10 dias',
        '(16) ****-4821',
        {
          address: 'R. 18, 1240 – Centro, Guaira/SP',
          amount: 'R$ 4.812,30',
          client: 'RETA ALIMENTOS LTDA',
          contractor: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
        },
      ),
    ).toBe(
      [
        '📋 *Confira a ocorrência*',
        '',
        '> ⚠️ *Prorrogação do boleto*',
        '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '> 🏢 Contratante: COMERCIAL ZARAGOZA IMP EXP LTDA',
        '> 📍 R. 18, 1240 – Centro, Guaira/SP',
        '> 💰 Valor da nota: *R$ 4.812,30*',
        '',
        '📝 Observação: _cliente pediu 10 dias_',
        '📇 Contato: *(16) ****-4821*',
        '',
        '*Posso registrar?*',
        '*1* - ✅ Sim, registrar',
        '*2* - ❌ Não, cancelar',
      ].join('\n'),
    )
  })

  test('registrada: hora, nota em citação e o aviso da contratante', () => {
    expect(
      GROUP_OCCURRENCE_TEXT.registered({
        clientName: 'RETA ALIMENTOS LTDA',
        contact: '(16) ****-4821',
        documentNumber: '899839',
        registeredAt: '2026-11-06T02:52:00.000Z',
        sentToClient: true,
        typeName: 'Prorrogação do boleto',
      }),
    ).toBe(
      [
        '✅ *Ocorrência registrada* · 23:52',
        '',
        '> ⚠️ *Prorrogação do boleto*',
        '> 🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '> 📇 Contato: *(16) ****-4821*',
        '',
        '📨 Assim que a contratante responder, o boleto segue para o cliente e eu aviso aqui.',
      ].join('\n'),
    )
  })

  test('só pelo aplicativo: título, o que falta e o próximo passo', () => {
    expect(
      describeWhatsAppDriverEventRefusal(
        { code: 'occurrence_requirement', field: 'items' },
        { kind: 'driver' },
      ),
    ).toEqual({
      text: [
        '📱 *Esta ocorrência é registrada pelo aplicativo.*',
        'Essa ocorrência pede para apontar os produtos da nota, e isso o WhatsApp não faz.',
        '➡️ _Próximo passo:_ abra o app e toque em *Ocorrência*.',
      ].join('\n'),
    })
  })
})

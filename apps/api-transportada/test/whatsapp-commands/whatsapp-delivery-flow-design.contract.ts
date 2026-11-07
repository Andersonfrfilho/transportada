/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T4.1 (critério 1): as mensagens do fluxo 5 (Entreguei) de
 * `specs/300-o-bot-fala-num-padrao-so/conversas.html` — escolha da nota e comprovante —, comparadas inteiras.
 * O desenho conta 3 itens na primeira pergunta e nenhum na da mercadoria; aqui o contador é o mesmo em toda pergunta
 * (RF10) e conta tudo o que falta, inclusive o nome, então a primeira lista 4 e a da mercadoria também traz o contador.
 */
import { describe, expect, test } from 'bun:test'

import { GROUP_DELIVERY_TEXT } from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import {
  resolveDeliveryProofChecklist,
  type CollectedDeliveryProof,
} from '../../src/whatsapp-commands/domain/whatsapp-delivery-proof-checklist.policy.js'
import { DELIVERY_PROOF_SPEECH } from '../../src/whatsapp-commands/domain/whatsapp-delivery-proof-speech.constant.js'
import {
  describeDeliveryConfirmCollected,
  describeDeliveryConfirmDocument,
} from '../../src/whatsapp-commands/domain/whatsapp-delivery-confirm-summary.policy.js'
import { describeWhatsAppDriverEventResult } from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import { BOT_SPEECH_DEFAULTS } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { interpolateBotSpeech } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.policy.js'
import { DEFAULT_DELIVERY_PROOF_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'

const CLIENT = { city: 'Guaira', name: 'RETA ALIMENTOS LTDA' }

const SETTINGS = {
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  cargo: 'optional',
  photo: 'required',
  receivedBy: 'required',
} as const

const NOTHING_COLLECTED: CollectedDeliveryProof = {
  cargoCount: 0,
  hasLocation: false,
  hasReceivedBy: false,
  hasReceiverName: false,
  photoCount: 0,
  skipped: new Set(['location']),
}

function questionAfter(collected: Partial<CollectedDeliveryProof>): string {
  const checklist = resolveDeliveryProofChecklist({
    collected: { ...NOTHING_COLLECTED, ...collected },
    settings: SETTINGS,
  })
  if (checklist.next === null) throw new Error('no question left')
  return DELIVERY_PROOF_SPEECH.question('899839', checklist.next, {
    client: CLIENT,
    pendingItems: checklist.pendingItems,
  })
}

describe('spec 300 T4.1 — fluxo 5 Entreguei: escolha da nota e comprovante', () => {
  test('qual nota você entregou', () => {
    expect(
      GROUP_DELIVERY_TEXT.askDocument([
        { city: 'Guaira', id: 'a', number: '899839', recipientName: 'RETA ALIMENTOS LTDA' },
        {
          city: 'Sao Joaquim da Barra',
          id: 'b',
          number: '899836',
          recipientName: 'RETA ALIMENTOS LTDA',
        },
      ]),
    ).toBe(
      [
        '✅ *Qual nota você entregou?*',
        '',
        '*1* - 🧾 NF `899839` · *RETA ALIMENTOS LTDA* · Guaira',
        '*2* - 🧾 NF `899836` · *RETA ALIMENTOS LTDA* · Sao Joaquim da Barra',
        '',
        '_Responda com o número da opção ou da nota._',
      ].join('\n'),
    )
  })

  test('foto do canhoto: contador desde a primeira pergunta', () => {
    expect(questionAfter({})).toBe(
      [
        '📸 *NF `899839` · foto do canhoto*',
        'Mande a foto do canhoto assinado.',
        '',
        '_Faltam 4 itens: canhoto, foto da mercadoria, quem recebeu e o nome._',
      ].join('\n'),
    )
  })

  test('foto da mercadoria, com o desfecho do canhoto', () => {
    const text = [DELIVERY_PROOF_SPEECH.received.photo, '', questionAfter({ photoCount: 1 })].join(
      '\n',
    )
    expect(text).toBe(
      [
        '✅ _Canhoto recebido._',
        '',
        '📦 *NF `899839` · foto da mercadoria*',
        'Mande 1 foto da mercadoria entregue.',
        '_Faltam 3 itens: foto da mercadoria, quem recebeu e o nome. Se não tiver, responda pular._',
      ].join('\n'),
    )
  })

  test('quem recebeu: ícone por opção e o cliente em citação', () => {
    const text = [
      DELIVERY_PROOF_SPEECH.received.skipped('cargo'),
      '',
      questionAfter({ photoCount: 1, skipped: new Set(['location', 'cargo']) }),
    ].join('\n')
    expect(text).toBe(
      [
        '👍 _Ok, sem a foto da mercadoria._',
        '',
        '👤 *Quem recebeu a NF `899839`?*',
        '> 🏪 *RETA ALIMENTOS LTDA* · Guaira',
        '',
        '*1* - 🙋 O próprio destinatário',
        '*2* - 💍 Cônjuge',
        '*3* - 🧒 Filho ou filha',
        '*4* - 🧓 Pai ou mãe',
        '*5* - 🧑‍🤝‍🧑 Irmão ou irmã',
        '*6* - 👪 Outro parente',
        '*7* - 🏘️ Vizinho',
        '*8* - 🛎️ Porteiro',
        '*9* - 🧑‍💼 Funcionário do local',
        '*10* - 👤 Outra pessoa',
        '',
        '_Faltam 2 itens: quem recebeu e o nome._',
        '_Responda com o número._',
      ].join('\n'),
    )
  })

  test('nome de quem recebeu, com o vínculo anotado', () => {
    const text = [
      DELIVERY_PROOF_SPEECH.received.receivedBy('employee'),
      '',
      questionAfter({
        hasReceivedBy: true,
        photoCount: 1,
        skipped: new Set(['location', 'cargo']),
      }),
    ].join('\n')
    expect(text).toBe(
      [
        '👍 _Anotado: funcionário do local._',
        '',
        '✍️ *Qual o nome de quem recebeu a NF `899839`?*',
        '> 🏪 *RETA ALIMENTOS LTDA* · Guaira',
        '',
        'Escreva o nome.',
        '_Falta 1 item. Se não tiver, responda pular._',
      ].join('\n'),
    )
  })

  test('"não entendi" do quem recebeu repete as opções por extenso', () => {
    expect(DELIVERY_PROOF_SPEECH.receivedByNotUnderstood.split('\n').slice(0, 3)).toEqual([
      '🤔 *Não entendi.* Responda com o número da opção:',
      '*1* - 🙋 O próprio destinatário',
      '*2* - 💍 Cônjuge',
    ])
  })

  test('confirmação da entrega: nota em citação, o que foi colhido e as opções', () => {
    expect(
      DELIVERY_PROOF_SPEECH.confirm('899839', {
        collected: describeDeliveryConfirmCollected({
          canhotoPhotos: 1,
          cargoPhotos: 0,
          location: {
            accuracyMeters: null,
            capturedAt: '2026-11-07T00:00:00.000Z',
            latitude: '-20.3',
            longitude: '-48.3',
          },
          receivedBy: 'employee',
          receiverName: 'João Pereira',
          skipped: ['cargo'],
        }),
        document: describeDeliveryConfirmDocument({
          address: 'R. 18, 1240 – Centro, Guaira/SP',
          amount: '4812.30',
          client: 'RETA ALIMENTOS LTDA',
          contractor: 'COMERCIAL ZARAGOZA IMP EXP LTDA',
        }),
      }),
    ).toBe(
      [
        '📋 *Confira a entrega da NF `899839`*',
        '',
        '> 🏢 Contratante: COMERCIAL ZARAGOZA IMP EXP LTDA',
        '> 🏪 Cliente: *RETA ALIMENTOS LTDA*',
        '> 📍 R. 18, 1240 – Centro, Guaira/SP',
        '> 💰 Valor da nota: *R$ 4.812,30*',
        '',
        '🧾 Canhoto: foto recebida ✅',
        '📦 Mercadoria: sem foto',
        '🙋 Recebido por: *João Pereira* (funcionário do local)',
        '📍 Localização: enviada ✅',
        '',
        '*Confirma a entrega?*',
        '*1* - ✅ Sim, confirmar',
        '*2* - ❌ Não, cancelar',
      ].join('\n'),
    )
  })

  test('"não entendi" da confirmação repete as opções', () => {
    expect(DELIVERY_PROOF_SPEECH.confirmNotUnderstood).toBe(
      [
        '🤔 *Não entendi.* Responda com o número da opção:',
        '*1* - ✅ Sim, confirmar',
        '*2* - ❌ Não, cancelar',
      ].join('\n'),
    )
  })

  test('entrega registrada: nota e parada concluída, igual no grupo e na individual', () => {
    const result = {
      event: 'deliver',
      kind: 'registered',
      details: { proofPending: false, stopCompleted: true, tripCompleted: false },
      recordedTogether: ['arrived'],
    } as const
    const render = (kind: 'driver' | 'group') => {
      const line = describeWhatsAppDriverEventResult(result as never, {
        documentNumber: '899839',
        kind,
        stopSequence: 3,
      })
      if (!('key' in line)) throw new Error('expected a catalog line')
      return [
        interpolateBotSpeech(BOT_SPEECH_DEFAULTS[line.key], line.params ?? {}),
        ...(line.after ?? []),
      ].join('\n')
    }
    const expected = [
      '✅ *NF `899839` entregue.* Parada 3 concluída.',
      '_Marquei a chegada junto com a entrega._',
    ].join('\n')
    expect(render('group')).toBe(expected)
    expect(render('driver')).toBe(expected)
  })
})

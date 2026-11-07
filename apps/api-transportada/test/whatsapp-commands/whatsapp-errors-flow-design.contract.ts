/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T5.4: o fluxo 10 (Tempo, áudio e erros) de `specs/300-o-bot-fala-num-padrao-so/conversas.html` —
 * pedido sem resposta, áudio ("Entendi assim") e recusas da API —, comparado inteiro.
 */
import { describe, expect, test } from 'bun:test'

import {
  BOT_AUDIO_SPEECH,
  botAudioConfirmationText,
} from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import { GROUP_REQUEST_TEXT } from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import { describeSpokenNotes } from '../../src/whatsapp/domain/bot-spoken-note.policy.js'
import { GROUP_REQUEST_EXPIRY_TEXT } from '../../src/whatsapp/infrastructure/whatsapp-group-request-expiry.watcher.js'
import { BOT_SPEECH_DEFAULTS } from '../../src/whatsapp-commands/domain/whatsapp-bot-speech.constant.js'
import { WHATSAPP_COMMAND_FAILURE_REPLY } from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'

const NEXT_STEP_ESCRITORIO = '➡️ _Próximo passo:_ confira com o escritório.'
const REGISTER_FAILED = [
  '⚠️ *Não consegui registrar agora.*',
  '➡️ _Próximo passo:_ tente de novo em instantes, ou registre pelo aplicativo.',
].join('\n')

describe('spec 300 T5.4 — fluxo 10 Tempo, áudio e erros', () => {
  test('pedido sem resposta: aviso, encerramento e três tentativas', () => {
    expect(GROUP_REQUEST_EXPIRY_TEXT.warning).toBe(
      '⏳ *Ainda espero sua resposta.*\nSe ninguém responder nos próximos minutos, eu encerro este pedido.',
    )
    expect(GROUP_REQUEST_EXPIRY_TEXT.expired).toBe(
      [
        '⏰ *Pedido encerrado sem resposta.* Nada foi registrado.',
        '➡️ _Próximo passo:_ para recomeçar, é só me marcar de novo.',
      ].join('\n'),
    )
    expect(GROUP_REQUEST_TEXT.gaveUp).toBe(
      '🙋 *Não consegui entender depois de 3 tentativas* e encerrei o pedido.\nO escritório vai acompanhar por aqui.',
    )
  })

  test('áudio: escutando e "Entendi assim" com a nota falada', () => {
    expect(BOT_AUDIO_SPEECH.received).toBe('🎙️ _Escutando seu áudio, só um momento._')
    const text = 'entreguei a nota 899839'
    const note = {
      address: 'Rua das Flores, 100 - Guaira',
      number: '899839',
      recipientName: 'RETA ALIMENTOS LTDA',
      series: '',
      totalAmount: '',
    }
    expect(
      botAudioConfirmationText(
        text,
        describeSpokenNotes([note], text),
        'entreguei a nota oito nove nove oito três nove',
      ),
    ).toBe(
      [
        '🎙️ *Entendi assim:*',
        '> 💬 _"entreguei a nota oito nove nove oito três nove"_',
        '',
        '🧾 NF `899839` · *RETA ALIMENTOS LTDA*',
        '📍 Rua das Flores, 100 - Guaira',
        '',
        '*Está certo?*',
        '*1* - ✅ Sim, pode seguir',
        '*2* - ❌ Não, descartar',
        '',
        '_Responda com o número ou por áudio (sim ou não)._',
      ].join('\n'),
    )
  })

  test('áudio sem nota: a pergunta vai direto depois da fala', () => {
    expect(botAudioConfirmationText('chego em 10 minutos')).toBe(
      [
        '🎙️ *Entendi assim:*',
        '> 💬 _"chego em 10 minutos"_',
        '',
        '*Está certo?*',
        '*1* - ✅ Sim, pode seguir',
        '*2* - ❌ Não, descartar',
        '',
        '_Responda com o número ou por áudio (sim ou não)._',
      ].join('\n'),
    )
  })

  test('recusas: a nota sai da viagem, com ou sem grupo, o motorista sem acesso e a falha', () => {
    expect(BOT_SPEECH_DEFAULTS.groupDocumentNotReachable).toBe(
      ['🚫 *Essa nota não está mais na viagem do motorista.*', NEXT_STEP_ESCRITORIO].join('\n'),
    )
    expect(BOT_SPEECH_DEFAULTS.driverDocumentNotReachable).toBe(
      BOT_SPEECH_DEFAULTS.groupDocumentNotReachable,
    )
    expect(BOT_SPEECH_DEFAULTS.groupDriverWithoutAccess).toBe(
      [
        '🔒 *O motorista deste grupo ainda não tem acesso ao aplicativo.*',
        'O registro precisa ficar no nome dele.',
        '➡️ _Próximo passo:_ peça ao escritório para liberar o acesso, ou registre pelo painel.',
      ].join('\n'),
    )
    expect(BOT_SPEECH_DEFAULTS.groupRegisterFailed).toBe(REGISTER_FAILED)
    expect(WHATSAPP_COMMAND_FAILURE_REPLY).toBe(REGISTER_FAILED)
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T4.3 (critério 1): as mensagens do canhoto do fluxo 5 (Entreguei) de
 * `specs/300-o-bot-fala-num-padrao-so/conversas.html` — leitura, repetido, troca e foto que não parece canhoto —,
 * comparadas inteiras.
 */
import { describe, expect, test } from 'bun:test'

import { CANHOTO_RECOGNITION_SPEECH } from '../../src/whatsapp-commands/domain/whatsapp-canhoto-recognition-speech.constant.js'
import { CANHOTO_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-canhoto.policy.js'

const NOTE = {
  city: 'Sao Joaquim da Barra',
  clientName: 'RETA ALIMENTOS LTDA',
  documentId: 'doc-b',
  documentNumber: '899836',
  label: 'NF 899836 · RETA ALIMENTOS LTDA',
}

describe('spec 300 T4.3 — fluxo 5 Entreguei: canhoto', () => {
  test('este canhoto é da nota? com cliente e cidade em citação', () => {
    expect(CANHOTO_RECOGNITION_SPEECH.confirmNote(NOTE)).toBe(
      [
        '📸 *Este canhoto é da NF `899836`?*',
        '> 🏪 RETA ALIMENTOS LTDA · Sao Joaquim da Barra',
        '',
        '*1* - ✅ Sim, é dessa nota',
        '*2* - 🔄 Não, é de outra',
      ].join('\n'),
    )
  })

  test('de qual nota é este canhoto? com as notas por extenso e descartar', () => {
    const other = { ...NOTE, city: 'Guaira', documentNumber: '899839' }
    expect(CANHOTO_RECOGNITION_SPEECH.chooseNote([other, NOTE])).toBe(
      [
        '📸 *De qual nota é este canhoto?*',
        '',
        '*1* - 🧾 NF `899839` · *RETA ALIMENTOS LTDA* · Guaira',
        '*2* - 🧾 NF `899836` · *RETA ALIMENTOS LTDA* · Sao Joaquim da Barra',
        '*3* - 🗑️ Descartar a foto',
        '',
        '_Responda com o número da opção ou da nota._',
      ].join('\n'),
    )
  })

  test('canhoto repetido', () => {
    const attachedAt = new Date('2026-11-07T02:41:00.000Z')
    expect(CANHOTO_TEXT.duplicate({ attachedAt, documentNumber: '899839' })).toBe(
      [
        '🔁 *Esse canhoto já tinha chegado.*',
        'NF `899839`, entregue às 23:41. Nada foi gravado de novo.',
      ].join('\n'),
    )
  })

  test('troca do canhoto: pergunta e desfecho', () => {
    expect(CANHOTO_TEXT.replaceQuestion('899839')).toBe(
      [
        '⚠️ *A NF `899839` já tem um canhoto diferente deste.*',
        '',
        '*1* - 🔄 Trocar o canhoto _(vai para conferência do escritório)_',
        '*2* - 🗑️ Descartar esta foto',
      ].join('\n'),
    )
    expect(CANHOTO_TEXT.replaced('899839')).toBe(
      '🔄 *Canhoto da NF `899839` trocado.* O escritório vai conferir.',
    )
    expect(CANHOTO_TEXT.kept('899839')).toBe(
      '↩️ *Foto descartada.* Mantive o canhoto da NF `899839`.',
    )
    expect(CANHOTO_TEXT.notUnderstood).toBe(
      [
        '🤔 *Não entendi.* Responda com o número da opção:',
        '*1* - 🔄 Trocar o canhoto _(vai para conferência do escritório)_',
        '*2* - 🗑️ Descartar esta foto',
      ].join('\n'),
    )
  })

  test('foto que não parece canhoto e a resposta "foto da mercadoria"', () => {
    expect(CANHOTO_RECOGNITION_SPEECH.photoKind()).toBe(
      [
        '🤔 *Essa foto não parece um canhoto assinado.*',
        'O que é?',
        '',
        '*1* - 📦 Foto da mercadoria',
        '*2* - 🧾 É o canhoto, sim',
        '*3* - 🗑️ Descartar',
      ].join('\n'),
    )
    expect(CANHOTO_RECOGNITION_SPEECH.cargoNoted).toBe(
      [
        '📦 *Anotei como foto da mercadoria.*',
        '➡️ _Próximo passo:_ ela entra quando você mandar *entreguei* da nota.',
      ].join('\n'),
    )
  })
})

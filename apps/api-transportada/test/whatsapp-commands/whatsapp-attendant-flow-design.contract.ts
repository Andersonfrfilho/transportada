/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T5.5: o fluxo 11 (Atendente, baixa em lote) de `specs/300-o-bot-fala-num-padrao-so/conversas.html` —
 * o resumo que o escritório recebe depois de "entreguei n1 n2 n3 n4" —, comparado inteiro. Grupo e conversa
 * individual montam o resumo pela mesma função.
 */
import { describe, expect, test } from 'bun:test'

import { formatAttendantBatch } from '../../src/whatsapp-commands/domain/whatsapp-message-format.policy.js'

const NEXT_STEP_FOTO = '➡️ _Próximo passo:_ o canhoto pendente pode ser mandado aqui por foto.'

describe('spec 300 T5.5 — fluxo 11 Atendente, baixa em lote', () => {
  test('o desenho: baixadas, canhoto pendente e já baixadas, com o próximo passo', () => {
    expect(
      formatAttendantBatch({
        alreadyDone: ['899839'],
        failed: [],
        missing: [],
        pendingProof: ['899857'],
        registered: ['899862', '899859', '899857'],
      }),
    ).toBe(
      [
        '📋 *Baixa pelo escritório*',
        '',
        '✅ *Baixadas:* NF `899862`, NF `899859`',
        '🧾 *Canhoto pendente:* NF `899857`',
        '🔁 *Já estavam baixadas:* NF `899839`',
        '',
        NEXT_STEP_FOTO,
      ].join('\n'),
    )
  })

  test('sem canhoto pendente, não há próximo passo', () => {
    expect(
      formatAttendantBatch({
        alreadyDone: [],
        failed: [],
        missing: [],
        pendingProof: [],
        registered: ['899862'],
      }),
    ).toBe(['📋 *Baixa pelo escritório*', '', '✅ *Baixadas:* NF `899862`'].join('\n'))
  })

  test('nota que não está em aberto e recusa aparecem nas próprias linhas', () => {
    expect(
      formatAttendantBatch({
        alreadyDone: [],
        failed: ['900'],
        missing: ['17236', '901'],
        pendingProof: [],
        registered: [],
      }),
    ).toBe(
      [
        '📋 *Baixa pelo escritório*',
        '',
        '⚠️ *Não encontrei em aberto em viagem na rua:* NF `17236`, NF `901`',
        '⚠️ *Não consegui baixar:* NF `900`',
      ].join('\n'),
    )
  })

  test('nada para resumir: texto vazio', () => {
    expect(
      formatAttendantBatch({
        alreadyDone: [],
        failed: [],
        missing: [],
        pendingProof: [],
        registered: [],
      }),
    ).toBe('')
  })
})

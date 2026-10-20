/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Várias mensagens de um chat da ocorrência podem ser marcadas de uma vez: copiar junta o texto na ordem da
 * conversa, com quem escreveu e a hora; encaminhar repete, para cada mensagem, os mesmos passos do encaminhar
 * de uma só, na ordem da conversa — não na ordem em que foram marcadas.
 */
import { describe, expect, test } from 'bun:test'

import {
  formatSelectionForCopy,
  planSelectionForward,
  selectedInConversationOrder,
  toggleSelected,
} from '@/modules/occurrence-conversation/shared/messageSelection.service'

const FIRST = {
  attachments: [],
  authorName: 'Operadora Lima',
  id: 'm1',
  isMine: true,
  text: 'Aguarde na doca.',
}
const SECOND = {
  attachments: [{ filename: 'boleto.pdf', id: 'a1' }],
  authorName: 'Compras Alfa',
  id: 'm2',
  isMine: false,
  text: 'Segue o boleto.',
}
const CONVERSATION = [
  { createdAt: '2026-10-20T14:20:00.000Z', id: 'm1' },
  { createdAt: '2026-10-20T14:41:00.000Z', id: 'm2' },
]

describe('seleção de várias mensagens', () => {
  test('marcar e desmarcar a mesma mensagem', () => {
    const once = toggleSelected(new Map(), SECOND)
    expect([...once.keys()]).toEqual(['m2'])
    expect(toggleSelected(once, SECOND).size).toBe(0)
  })

  test('a ordem é a da conversa, não a da marcação', () => {
    const selected = toggleSelected(toggleSelected(new Map(), SECOND), FIRST)
    expect(selectedInConversationOrder(CONVERSATION, selected).map((item) => item.id)).toEqual([
      'm1',
      'm2',
    ])
  })

  test('copiar junta autor, hora e texto; arquivo entra pelo nome', () => {
    const selected = toggleSelected(toggleSelected(new Map(), SECOND), FIRST)
    expect(
      formatSelectionForCopy({
        conversation: CONVERSATION,
        formatTime: (iso) => iso.slice(11, 16),
        selected,
      }),
    ).toBe(
      '[14:20] Operadora Lima: Aguarde na doca.\n[14:41] Compras Alfa: Segue o boleto. [boleto.pdf]',
    )
  })

  test('encaminhar soma os passos de cada mensagem, na ordem da conversa', () => {
    const selected = toggleSelected(toggleSelected(new Map(), SECOND), FIRST)
    expect(
      planSelectionForward({ conversation: CONVERSATION, from: 'contractor', selected }).map(
        (step) => step.kind,
      ),
    ).toEqual(['driver-text', 'deliver-attachment-to-driver', 'driver-text'])
  })
})

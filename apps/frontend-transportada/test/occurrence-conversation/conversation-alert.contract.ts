/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Conversa minimizada (ou fora de vista) que recebe mensagem avisa: som, ícone na coluna e "(n)" no título
 * da aba do navegador. Conversa aberta e à vista não faz barulho.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  shouldChime,
  titleWithUnread,
} from '@/modules/occurrence-conversation/shared/conversationAlert.service'

describe('aviso de mensagem nova com a conversa fora de vista', () => {
  test('toca só quando a contagem sobe e a conversa não está à vista', () => {
    expect(shouldChime({ isOpen: false, next: 1, previous: 0 })).toBe(true)
    expect(shouldChime({ isOpen: true, next: 1, previous: 0 })).toBe(false)
    expect(shouldChime({ isOpen: false, next: 1, previous: 1 })).toBe(false)
    expect(shouldChime({ isOpen: false, next: 0, previous: 2 })).toBe(false)
  })

  test('o título ganha "(n)" sem empilhar e volta ao nome com zero', () => {
    expect(titleWithUnread('Rodoex', 2)).toBe('(2) Rodoex')
    expect(titleWithUnread('(2) Rodoex', 3)).toBe('(3) Rodoex')
    expect(titleWithUnread('(3) Rodoex', 0)).toBe('Rodoex')
  })

  test('o painel liga o aviso às duas conversas e a coluna minimizada mostra o ícone', async () => {
    const root = new URL('../../src/modules/occurrence-conversation/components/', import.meta.url)
    const panel = await readFile(new URL('OccurrenceConversations.component.tsx', root), 'utf8')
    expect(panel).toContain('useConversationAlerts([')
    const column = await readFile(new URL('ConversationLayoutSwitch.component.tsx', root), 'utf8')
    expect(column).toContain('{collapsed ? <Icon name="message"')
  })
})

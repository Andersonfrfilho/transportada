/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T902 (achado D2): mensagem nova que chega numa leitura (a automática da T703, ou a do
 * foco) é anunciada a leitor de tela, numa região `aria-live="polite"` da conversa. O carregamento
 * inicial não anuncia nada — o fio inteiro não é "novo" —, e só conta o que o outro lado mandou.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import { countNewIncomingMessages } from '@/modules/occurrence-conversation/shared/occurrenceConversation.service'

const message = (id: string, direction: 'inbound' | 'outbound') => ({ direction, id })

describe('mensagem nova anunciada (spec 183 T902, D2)', () => {
  test('conta só as recebidas que não estavam na leitura anterior; a primeira leitura não conta', () => {
    expect(countNewIncomingMessages(null, [message('a', 'inbound')])).toBe(0)
    expect(
      countNewIncomingMessages(
        ['a'],
        [message('a', 'inbound'), message('b', 'outbound'), message('c', 'inbound')],
      ),
    ).toBe(1)
    expect(
      countNewIncomingMessages(['a', 'c'], [message('a', 'inbound'), message('c', 'inbound')]),
    ).toBe(0)
  })

  test('o fio do painel tem a região polite', async () => {
    const component = await readFile(
      new URL(
        '../../src/modules/occurrence-conversation/components/OccurrenceConversations.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const thread = component.slice(component.indexOf('function ConversationThread('))

    expect(thread).toMatch(/aria-live="polite"/u)
  })
})

describe('a conversa se relê sozinha mesmo sem status pendente (spec 183 T902, D2)', () => {
  test('o intervalo ocioso existe, e o da query nunca devolve false', async () => {
    const query = await readFile(
      new URL(
        '../../src/modules/occurrence-conversation/queries/occurrenceConversation.query.ts',
        import.meta.url,
      ),
      'utf8',
    )
    const refetch = query.slice(
      query.indexOf('refetchInterval:'),
      query.indexOf('})', query.indexOf('refetchInterval:')),
    )

    expect(refetch).toContain('CONVERSATION_IDLE_REFETCH_MS')
    expect(refetch).not.toMatch(/:\s*false/u)
  })
})

/* Copyright (c) 2026 Ada Technology. MIT License. */
/** Mensagem nova no app do motorista toca um som curto; a primeira leitura e a contagem que cai ficam em silêncio. */
import { describe, expect, test } from 'bun:test'

import { shouldChime } from '@/modules/conversation/shared/conversationChime.service'

describe('som de mensagem nova no app do motorista', () => {
  test('toca só quando a soma de não lidas sobe depois da primeira leitura', () => {
    expect(shouldChime(null, 3)).toBe(false)
    expect(shouldChime(0, 1)).toBe(true)
    expect(shouldChime(2, 2)).toBe(false)
    expect(shouldChime(3, 1)).toBe(false)
  })
})

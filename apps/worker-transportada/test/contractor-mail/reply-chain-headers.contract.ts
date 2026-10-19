/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 274 T4.2 (D7): a montagem pura de `In-Reply-To`/`References` a partir dos `rfc_message_id` da thread.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildReplyChainHeaders,
  normalizeRfcMessageId,
} from '../../src/contractor-mail/domain/reply-chain-headers.policy.js'

const ids = (count: number) => Array.from({ length: count }, (_, index) => `<m${index + 1}@x>`)

describe('buildReplyChainHeaders (spec 274 D7)', () => {
  const cases: readonly {
    readonly expected: { readonly inReplyTo: string; readonly references: string } | undefined
    readonly input: readonly string[]
    readonly name: string
  }[] = [
    { expected: undefined, input: [], name: 'sem nenhum id: sem cabeçalho' },
    { expected: undefined, input: ['', '  '], name: 'ids vazios (sem rfc) não entram' },
    {
      expected: { inReplyTo: '<in1@x>', references: '<in1@x>' },
      input: ['<in1@x>'],
      name: 'só entrada',
    },
    {
      expected: { inReplyTo: '<out1@x>', references: '<out1@x>' },
      input: ['<out1@x>'],
      name: 'só saída (message_id do provedor)',
    },
    {
      expected: { inReplyTo: '<out2@x>', references: '<in1@x> <out1@x> <in2@x> <out2@x>' },
      input: ['<in1@x>', '<out1@x>', '<in2@x>', '<out2@x>'],
      name: 'mistura de entrada e saída, na ordem recebida',
    },
    {
      expected: { inReplyTo: '<m25@x>', references: ids(25).slice(5).join(' ') },
      input: ids(25),
      name: 'mais de 20: ficam os 20 últimos',
    },
    {
      expected: { inReplyTo: '<a@x>', references: '<a@x>' },
      input: ['a@x', '<a@x>', ' <<a@x>> '],
      name: 'normaliza para <…> e não repete',
    },
    {
      expected: { inReplyTo: '<b@x>', references: '<a@x> <b@x>' },
      input: ['<a@x>', '', '<b@x>'],
      name: 'mensagem sem rfc no meio simplesmente não entra',
    },
  ]

  for (const item of cases) {
    test(item.name, () => {
      const headers = buildReplyChainHeaders(item.input)
      expect(headers).toEqual(
        item.expected === undefined
          ? undefined
          : { 'In-Reply-To': item.expected.inReplyTo, References: item.expected.references },
      )
    })
  }

  test('normalizeRfcMessageId', () => {
    expect(normalizeRfcMessageId('abc@x')).toBe('<abc@x>')
    expect(normalizeRfcMessageId('<abc@x>')).toBe('<abc@x>')
    expect(normalizeRfcMessageId('<>')).toBe('')
  })
})

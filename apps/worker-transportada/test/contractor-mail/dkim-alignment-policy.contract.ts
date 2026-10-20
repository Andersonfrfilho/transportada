/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { summarizeDkimSignatures } from '../../src/contractor-mail/domain/dkim-alignment.policy.js'

/**
 * O log do DKIM diz por que a assinatura não alinhou sem levar domínio, seletor nem endereço: o motivo da
 * `mailauth` só sai quando é do vocabulário fixo.
 */
describe('summarizeDkimSignatures', () => {
  test('keeps verdict, alignment and the fixed-vocabulary reason', () => {
    expect(
      summarizeDkimSignatures([
        {
          status: { aligned: 'gmail.com', comment: 'body hash did not verify', result: 'neutral' },
        },
        { canonBodyLengthLimited: true, status: { aligned: false, result: 'pass' } },
      ]),
    ).toEqual([
      {
        aligned: true,
        lengthLimited: false,
        reason: 'body hash did not verify',
        result: 'neutral',
      },
      { aligned: false, lengthLimited: true, reason: null, result: 'pass' },
    ])
  })

  test('hides a free-text reason, which could carry a domain', () => {
    expect(
      summarizeDkimSignatures([
        { status: { comment: 'no key for s1._domainkey.example.com', result: 'neutral' } },
      ]),
    ).toEqual([{ aligned: false, lengthLimited: false, reason: 'other', result: 'neutral' }])
  })

  test('caps the list at five signatures', () => {
    const signatures = Array.from({ length: 8 }, () => ({ status: { result: 'none' } }))
    expect(summarizeDkimSignatures(signatures)).toHaveLength(5)
  })
})

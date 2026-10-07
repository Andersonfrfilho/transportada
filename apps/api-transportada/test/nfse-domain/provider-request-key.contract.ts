/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveInheritedProviderRequestKey,
  type NfseIssuanceAttemptHistory,
} from '../../src/nfse-invoices/domain/nfse-provider-request-key.policy'

const PREVIOUS_KEY = '00000000-0000-4000-8000-0000000000e1'

function previousAttempt(
  overrides: Partial<NfseIssuanceAttemptHistory> = {},
): NfseIssuanceAttemptHistory {
  return {
    lastErrorCause: 'timeout',
    providerDocumentId: null,
    providerRequestKey: PREVIOUS_KEY,
    status: 'failed',
    ...overrides,
  }
}

describe('nfse provider request key inheritance', () => {
  test('a primeira tentativa não herda chave: a dela é o próprio attemptId', () => {
    expect(resolveInheritedProviderRequestKey(null)).toBeUndefined()
  })

  test('tentativa anterior rejeitada pelo provedor gera chave nova', () => {
    const rejected = previousAttempt({ lastErrorCause: null, status: 'rejected' })

    expect(resolveInheritedProviderRequestKey(rejected)).toBeUndefined()
  })

  test('tentativa anterior ambígua por timeout copia a chave', () => {
    expect(resolveInheritedProviderRequestKey(previousAttempt())).toBe(PREVIOUS_KEY)
  })

  test('tentativa anterior ambígua por falha de transporte copia a chave', () => {
    const attempt = previousAttempt({ lastErrorCause: 'transport_failure' })

    expect(resolveInheritedProviderRequestKey(attempt)).toBe(PREVIOUS_KEY)
  })

  test('ambígua sem chave anterior (tentativa legada) gera chave nova', () => {
    const legacy = previousAttempt({ providerRequestKey: null })

    expect(resolveInheritedProviderRequestKey(legacy)).toBeUndefined()
  })

  test('se o provedor já devolveu o id da nota, a emissão não é ambígua', () => {
    const accepted = previousAttempt({ providerDocumentId: '98765' })

    expect(resolveInheritedProviderRequestKey(accepted)).toBeUndefined()
  })

  test('falha por causa que não é de transporte não herda a chave', () => {
    const malformed = previousAttempt({ lastErrorCause: 'unexpected_status' })

    expect(resolveInheritedProviderRequestKey(malformed)).toBeUndefined()
  })

  test('tentativa que não terminou em failed não herda a chave', () => {
    const scheduled = previousAttempt({ status: 'retry_scheduled' })

    expect(resolveInheritedProviderRequestKey(scheduled)).toBeUndefined()
  })
})

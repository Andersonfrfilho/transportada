/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  canReuseProviderDocumentId,
  parseProviderApiVersion,
  resolveLatestIssuanceApiVersion,
  type NfseIssuanceAttemptHistoryEntry,
  type NfseProviderApiVersion,
} from '../../src/nfse-issuance/domain/nfse-provider-api-version.policy.js'

function entry(attemptNumber: bigint, providerConfig: unknown): NfseIssuanceAttemptHistoryEntry {
  return { attemptNumber, providerConfig }
}

describe('NFS-e provider API version — leitura da tentativa', () => {
  test.each<[unknown, NfseProviderApiVersion]>([
    [{ providerApiVersion: 'v3' }, 'v3'],
    [{ providerApiVersion: 'v2' }, 'v2'],
    [{}, 'v2'],
    [null, 'v2'],
    [undefined, 'v2'],
    ['v3', 'v2'],
    [{ providerApiVersion: 'v4' }, 'v2'],
    [{ providerApiVersion: 3 }, 'v2'],
  ])('providerConfig %j resolve %s (ausente ou desconhecida é v2)', (providerConfig, expected) => {
    expect(parseProviderApiVersion(providerConfig)).toBe(expected)
  })

  test('a última tentativa de emissão manda, não a mais antiga', () => {
    const history = [
      entry(1n, { providerApiVersion: 'v2' }),
      entry(3n, { providerApiVersion: 'v3' }),
      entry(2n, {}),
    ]

    expect(resolveLatestIssuanceApiVersion(history)).toBe('v3')
  })

  test('sem tentativa de emissão a versão é v2', () => {
    expect(resolveLatestIssuanceApiVersion([])).toBe('v2')
  })
})

describe('NFS-e provider API version — id_nota só atravessa v3 para v3', () => {
  test('reedita quando todas as emissões anteriores foram v3', () => {
    const history = [
      entry(1n, { providerApiVersion: 'v3' }),
      entry(2n, { providerApiVersion: 'v3' }),
      entry(3n, { providerApiVersion: 'v3' }),
    ]

    expect(canReuseProviderDocumentId({ attemptNumber: 3n, history })).toBe(true)
  })

  test('uma emissão anterior da v2 impede: a origem do id_nota não se prova', () => {
    const history = [
      entry(1n, { providerApiVersion: 'v2' }),
      entry(2n, { providerApiVersion: 'v3' }),
      entry(3n, { providerApiVersion: 'v3' }),
    ]

    expect(canReuseProviderDocumentId({ attemptNumber: 3n, history })).toBe(false)
  })

  test('tentativa anterior sem versão gravada conta como v2', () => {
    const history = [entry(1n, {}), entry(2n, { providerApiVersion: 'v3' })]

    expect(canReuseProviderDocumentId({ attemptNumber: 2n, history })).toBe(false)
  })

  test('sem emissão anterior não há id_nota a reaproveitar', () => {
    const history = [entry(1n, { providerApiVersion: 'v3' })]

    expect(canReuseProviderDocumentId({ attemptNumber: 1n, history })).toBe(false)
  })

  test('tentativas posteriores à atual não entram na conta', () => {
    const history = [
      entry(1n, { providerApiVersion: 'v3' }),
      entry(2n, { providerApiVersion: 'v3' }),
      entry(5n, { providerApiVersion: 'v2' }),
    ]

    expect(canReuseProviderDocumentId({ attemptNumber: 2n, history })).toBe(true)
  })
})

describe('NFS-e provider API version — vínculo externo', () => {
  test('o id_nota de um vínculo nunca é reaproveitado numa reemissão', () => {
    const history = [
      entry(1n, { externalLink: true, providerApiVersion: 'v3' }),
      entry(2n, { providerApiVersion: 'v3' }),
    ]

    expect(canReuseProviderDocumentId({ attemptNumber: 2n, history })).toBe(false)
  })
})

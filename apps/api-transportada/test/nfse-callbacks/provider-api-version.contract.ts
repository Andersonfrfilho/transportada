/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

describe('nfse provider api version environment contract', () => {
  test('o padrão é v2 quando a variável está ausente ou em branco', () => {
    expect(parseEnvironment(API_ENVIRONMENT).nfseProviderApiVersion).toBe('v2')
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, NFSE_PROVIDER_API_VERSION: '' })
        .nfseProviderApiVersion,
    ).toBe('v2')
  })

  test('lê v3 declarada no ambiente', () => {
    expect(
      parseEnvironment({ ...API_ENVIRONMENT, NFSE_PROVIDER_API_VERSION: 'v3' })
        .nfseProviderApiVersion,
    ).toBe('v3')
  })

  for (const invalid of ['v1', 'V3', '3', 'latest']) {
    test(`derruba o boot com a versão desconhecida ${invalid}`, () => {
      expect(() =>
        parseEnvironment({ ...API_ENVIRONMENT, NFSE_PROVIDER_API_VERSION: invalid }),
      ).toThrow()
    })
  }

  test('o .env.example declara a variável com o padrão v2', async () => {
    const example = await Bun.file(new URL('../../../../.env.example', import.meta.url)).text()

    expect(example).toContain('\nNFSE_PROVIDER_API_VERSION=v2\n')
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseEnvironment } from '../../src/config/environment.schema.js'
import { API_ENVIRONMENT } from '../fixtures/cryptographic-environment.fixture.js'

describe('contrato das variáveis de origem do IP do cliente', () => {
  test('sem declarar, confia no x-real-ip do edge do Railway, com um salto', () => {
    expect(parseEnvironment(API_ENVIRONMENT).clientIpPolicy).toEqual({
      source: 'x-real-ip',
      trustedProxyHops: 1,
    })
  })

  test('declarar a cadeia com dois saltos é lido como número', () => {
    const config = parseEnvironment({
      ...API_ENVIRONMENT,
      CLIENT_IP_SOURCE: 'x-forwarded-for',
      TRUSTED_PROXY_HOPS: '2',
    })
    expect(config.clientIpPolicy).toEqual({ source: 'x-forwarded-for', trustedProxyHops: 2 })
  })

  test('origem fora da lista derruba o boot', () => {
    expect(() => parseEnvironment({ ...API_ENVIRONMENT, CLIENT_IP_SOURCE: 'forwarded' })).toThrow()
  })

  test.each(['0', '-1', '11', '1.5', 'dois'])('TRUSTED_PROXY_HOPS=%s derruba o boot', (hops) => {
    expect(() => parseEnvironment({ ...API_ENVIRONMENT, TRUSTED_PROXY_HOPS: hops })).toThrow()
  })
})

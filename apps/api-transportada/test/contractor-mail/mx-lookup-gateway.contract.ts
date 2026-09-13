/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createMxLookupGateway } from '../../src/contractor-mail/infrastructure/mx-lookup.gateway.js'

const DOMAIN = 'resposta.fernandes-transportadora.com.br'

describe('mx lookup gateway (spec 143 T007)', () => {
  test('reports the mx hosts when the domain has records', async () => {
    const gateway = createMxLookupGateway({
      resolveDns: async () => [{ exchange: 'feedback-smtp.sa-east-1.amazonses.com', priority: 10 }],
    })

    const result = await gateway.lookupMx({ domain: DOMAIN })

    expect(result).toEqual({
      hosts: ['feedback-smtp.sa-east-1.amazonses.com'],
      kind: 'found',
    })
  })

  test('reports absence when the domain has no mx records', async () => {
    const gateway = createMxLookupGateway({ resolveDns: async () => [] })

    expect(await gateway.lookupMx({ domain: DOMAIN })).toEqual({ kind: 'absent' })
  })

  test('reports absence when the resolver says the domain does not exist', async () => {
    const error = Object.assign(new Error('queryMx ENOTFOUND'), { code: 'ENOTFOUND' })
    const gateway = createMxLookupGateway({ resolveDns: () => Promise.reject(error) })

    expect(await gateway.lookupMx({ domain: DOMAIN })).toEqual({ kind: 'absent' })
  })

  test('reports absence when the resolver has no data for the record type', async () => {
    const error = Object.assign(new Error('queryMx ENODATA'), { code: 'ENODATA' })
    const gateway = createMxLookupGateway({ resolveDns: () => Promise.reject(error) })

    expect(await gateway.lookupMx({ domain: DOMAIN })).toEqual({ kind: 'absent' })
  })

  test('reports unreachable on any other resolver failure', async () => {
    const error = Object.assign(new Error('queryMx SERVFAIL'), { code: 'SERVFAIL' })
    const gateway = createMxLookupGateway({ resolveDns: () => Promise.reject(error) })

    expect(await gateway.lookupMx({ domain: DOMAIN })).toEqual({ kind: 'unreachable' })
  })

  test('reports unreachable when the resolver never settles within the timeout', async () => {
    const gateway = createMxLookupGateway({
      resolveDns: () => new Promise(() => {}),
      timeoutMilliseconds: 5,
    })

    expect(await gateway.lookupMx({ domain: DOMAIN })).toEqual({ kind: 'unreachable' })
  })
})

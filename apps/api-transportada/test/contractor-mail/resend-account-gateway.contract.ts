/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createResendAccountGateway } from '../../src/contractor-mail/infrastructure/resend-account.gateway.js'
import {
  ResendProviderUnauthorizedError,
  ResendProviderUnexpectedResponseError,
  ResendProviderUnreachableError,
} from '../../src/contractor-mail/domain/resend-provider.error.js'

const API_KEY = 're_synthetic_key'
const SENDER_DOMAIN = 'resposta.fernandes-transportadora.com.br'
const DOMAINS_TARGET = 'https://api.resend.com/domains'

type FakeFetch = {
  readonly calls: readonly { readonly init: RequestInit; readonly target: string }[]
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>
}

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status,
  })

const fakeFetch = (
  respond: (target: string, init: RequestInit) => Promise<Response>,
): FakeFetch => {
  const calls: { init: RequestInit; target: string }[] = []
  return {
    calls,
    fetch: async (target, init) => {
      calls.push({ init, target })
      return respond(target, init)
    },
  }
}

describe('resend account gateway (spec 143 T007)', () => {
  test('asks GET /domains with a bearer token and a timeout signal', async () => {
    const stub = fakeFetch(async () => json({ data: [] }))
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    await gateway.checkApiKeyAndSenderDomain({ apiKey: API_KEY, senderDomain: SENDER_DOMAIN })

    expect(stub.calls).toHaveLength(1)
    expect(stub.calls[0]?.target).toBe(DOMAINS_TARGET)
    expect(stub.calls[0]?.init.headers).toEqual({ authorization: `Bearer ${API_KEY}` })
    expect(stub.calls[0]?.init.signal).toBeInstanceOf(AbortSignal)
  })

  test('reports the sender domain as verified when Resend says so', async () => {
    const stub = fakeFetch(async () =>
      json({ data: [{ name: SENDER_DOMAIN, status: 'verified' }] }),
    )
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    const result = await gateway.checkApiKeyAndSenderDomain({
      apiKey: API_KEY,
      senderDomain: SENDER_DOMAIN,
    })

    expect(result).toEqual({ apiKeyAccepted: true, reason: 'ok', senderDomainVerified: true })
  })

  test('reports a not-yet-verified domain without treating it as an error', async () => {
    const stub = fakeFetch(async () => json({ data: [{ name: SENDER_DOMAIN, status: 'pending' }] }))
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    const result = await gateway.checkApiKeyAndSenderDomain({
      apiKey: API_KEY,
      senderDomain: SENDER_DOMAIN,
    })

    expect(result).toEqual({
      apiKeyAccepted: true,
      reason: 'sender_domain_not_verified',
      senderDomainVerified: false,
    })
  })

  test('reports the sender domain as not found when the account has no matching domain', async () => {
    const stub = fakeFetch(async () =>
      json({ data: [{ name: 'other-domain.com.br', status: 'verified' }] }),
    )
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    const result = await gateway.checkApiKeyAndSenderDomain({
      apiKey: API_KEY,
      senderDomain: SENDER_DOMAIN,
    })

    expect(result).toEqual({
      apiKeyAccepted: true,
      reason: 'sender_domain_not_found',
      senderDomainVerified: false,
    })
  })

  test('matches the domain name case-insensitively', async () => {
    const stub = fakeFetch(async () =>
      json({ data: [{ name: SENDER_DOMAIN.toUpperCase(), status: 'verified' }] }),
    )
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    const result = await gateway.checkApiKeyAndSenderDomain({
      apiKey: API_KEY,
      senderDomain: SENDER_DOMAIN,
    })

    expect(result.senderDomainVerified).toBe(true)
  })

  test('rejects a refused key with a typed error, for 401 and for 403', async () => {
    for (const status of [401, 403]) {
      const stub = fakeFetch(async () => json({ message: 'unauthorized' }, status))
      const gateway = createResendAccountGateway({ fetch: stub.fetch })

      await expect(
        gateway.checkApiKeyAndSenderDomain({ apiKey: API_KEY, senderDomain: SENDER_DOMAIN }),
      ).rejects.toBeInstanceOf(ResendProviderUnauthorizedError)
    }
  })

  test('rejects a network failure as unreachable', async () => {
    const stub = fakeFetch(() => Promise.reject(new Error('ECONNRESET')))
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    await expect(
      gateway.checkApiKeyAndSenderDomain({ apiKey: API_KEY, senderDomain: SENDER_DOMAIN }),
    ).rejects.toBeInstanceOf(ResendProviderUnreachableError)
  })

  test('rejects a request that aborts on timeout as unreachable', async () => {
    const stub = fakeFetch(() =>
      Promise.reject(new DOMException('The signal timed out', 'TimeoutError')),
    )
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    await expect(
      gateway.checkApiKeyAndSenderDomain({ apiKey: API_KEY, senderDomain: SENDER_DOMAIN }),
    ).rejects.toBeInstanceOf(ResendProviderUnreachableError)
  })

  test('rejects a body outside the expected schema as an unexpected response', async () => {
    const stub = fakeFetch(async () => json({ data: [{ name: SENDER_DOMAIN }] }))
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    await expect(
      gateway.checkApiKeyAndSenderDomain({ apiKey: API_KEY, senderDomain: SENDER_DOMAIN }),
    ).rejects.toBeInstanceOf(ResendProviderUnexpectedResponseError)
  })

  test('rejects a body that is not JSON at all as an unexpected response', async () => {
    const stub = fakeFetch(async () => new Response('<html>oops</html>', { status: 200 }))
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    await expect(
      gateway.checkApiKeyAndSenderDomain({ apiKey: API_KEY, senderDomain: SENDER_DOMAIN }),
    ).rejects.toBeInstanceOf(ResendProviderUnexpectedResponseError)
  })

  test('rejects a server failure that is not 401/403 as an unexpected response', async () => {
    const stub = fakeFetch(async () => json({ message: 'boom' }, 500))
    const gateway = createResendAccountGateway({ fetch: stub.fetch })

    await expect(
      gateway.checkApiKeyAndSenderDomain({ apiKey: API_KEY, senderDomain: SENDER_DOMAIN }),
    ).rejects.toBeInstanceOf(ResendProviderUnexpectedResponseError)
  })
})

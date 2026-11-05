/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CnhPictureApiError,
  createCnhPictureApiGateway,
} from '../../src/cnh-face/infrastructure/cnh-picture-api.gateway.js'

const COMPANY_ID = crypto.randomUUID()
const ATTACHMENT_ID = crypto.randomUUID()
const CONFIGURATION = {
  apiBaseUrl: 'http://api.test/',
  clientId: 'worker',
  clientSecret: 'secret',
  tokenUrl: 'http://keycloak.test/token',
}

type Call = { readonly init: RequestInit | undefined; readonly url: string }

function buildFetch(apiResponse: () => Response) {
  const calls: Call[] = []
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ init, url: String(url) })
    if (String(url) === CONFIGURATION.tokenUrl) {
      return Response.json({ access_token: 'token-1', expires_in: 300 })
    }
    return apiResponse()
  }) as typeof globalThis.fetch
  return { calls, fetch }
}

describe('a porta da API da foto da CNH', () => {
  test('pede o token, envia multipart ao anexo com a empresa no cabeçalho e lê applied', async () => {
    const { calls, fetch } = buildFetch(() => Response.json({ data: { applied: true } }))
    const gateway = createCnhPictureApiGateway({ configuration: CONFIGURATION, fetch })

    const result = await gateway.apply({
      attachmentId: ATTACHMENT_ID,
      companyId: COMPANY_ID,
      image: new Uint8Array([1, 2, 3]),
    })

    expect(result).toEqual({ applied: true })
    const put = calls[1]
    expect(put?.url).toBe(`http://api.test/fleet/driver-attachments/${ATTACHMENT_ID}/cnh-picture`)
    expect(put?.init?.method).toBe('PUT')
    expect(put?.init?.headers).toEqual({
      authorization: 'Bearer token-1',
      'x-company-id': COMPANY_ID,
    })
    expect((put?.init?.body as FormData).get('file')).toBeInstanceOf(File)
  })

  test('reaproveita o token entre chamadas', async () => {
    const { calls, fetch } = buildFetch(() => Response.json({ data: { applied: false } }))
    const gateway = createCnhPictureApiGateway({ configuration: CONFIGURATION, fetch })
    const input = { attachmentId: ATTACHMENT_ID, companyId: COMPANY_ID, image: new Uint8Array([1]) }

    await gateway.apply(input)
    const second = await gateway.apply(input)

    expect(second).toEqual({ applied: false })
    expect(calls.filter((call) => call.url === CONFIGURATION.tokenUrl)).toHaveLength(1)
  })

  test.each([
    [401, 'api_unauthorized'],
    [403, 'api_unauthorized'],
    [404, 'rejected'],
    [413, 'rejected'],
    [415, 'rejected'],
    [500, 'api_unreachable'],
  ] as const)('status %i vira %s', async (status, reason) => {
    const { fetch } = buildFetch(() => new Response(null, { status }))
    const gateway = createCnhPictureApiGateway({ configuration: CONFIGURATION, fetch })

    const failure = await gateway
      .apply({ attachmentId: ATTACHMENT_ID, companyId: COMPANY_ID, image: new Uint8Array([1]) })
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(CnhPictureApiError)
    expect((failure as CnhPictureApiError).reason).toBe(reason)
  })
})

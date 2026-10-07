/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseFiscalGateway } from '../../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import { createRateLimitedFetch } from '../../src/nfse-issuance/infrastructure/nota-rp-rate-limit.js'
import type { NotaRpV3Config } from '../../src/nfse-issuance/infrastructure/nota-rp-v3.types.js'
import { createNfseFiscalStatusGateway } from '../../src/nfse-status-pull/infrastructure/nfse-fiscal-status.gateway.js'
import {
  COMPANY_TAX_ID,
  CREDENTIAL,
  GATEWAY_CONFIG,
  PROVIDER_DOCUMENT_ID,
  PROVIDER_REQUEST_KEY,
  SECRET_SERVICE,
  V3_PAYLOAD,
  createFakeV2Client,
  createFakeV3Client,
  rejectingFetch,
  type Calls,
} from './fixture.js'

function buildStatusGateway(calls: Calls, configs: NotaRpV3Config[] = []) {
  return createNfseFiscalStatusGateway({
    config: { baseUrl: GATEWAY_CONFIG.baseUrl, timeoutMilliseconds: 15_000 },
    createClient: () => createFakeV2Client(calls),
    createV3Client: ({ config }) => {
      configs.push(config)
      return createFakeV3Client(calls)
    },
    fetch: rejectingFetch,
    secretService: SECRET_SERVICE,
  })
}

describe('NFS-e gateway de consulta — roteamento pela versão da nota', () => {
  test('consulta e documentos vão ao cliente da versão recebida', async () => {
    const calls: Calls = []
    const configs: NotaRpV3Config[] = []
    const gateway = buildStatusGateway(calls, configs)
    const base = { credential: CREDENTIAL, providerDocumentId: PROVIDER_DOCUMENT_ID }

    await gateway.fetchStatus({ ...base, providerApiVersion: 'v2' })
    await gateway.fetchStatus({ ...base, providerApiVersion: 'v3' })
    await gateway.fetchDocument({ ...base, kind: 'pdf', providerApiVersion: 'v2' })
    const document = await gateway.fetchDocument({
      ...base,
      kind: 'xml',
      providerApiVersion: 'v3',
    })

    expect(calls).toEqual([
      'v2.fetchStatus',
      'v3.fetchStatus',
      'v2.fetchDocument',
      'v3.fetchDocument',
    ])
    expect(document).toEqual({
      bytes: new Uint8Array([2]),
      contentType: 'application/xml',
      status: 'ok',
    })
    expect(configs[0]?.taxId).toBe(COMPANY_TAX_ID)
  })

  test('v3 sem endereço do provedor não abre o envelope', async () => {
    const decrypted: number[] = []
    const gateway = createNfseFiscalStatusGateway({
      config: { baseUrl: undefined, timeoutMilliseconds: 1 },
      fetch: rejectingFetch,
      secretService: {
        decrypt: async () => {
          decrypted.push(1)
          return SECRET_SERVICE.decrypt()
        },
      },
    })

    const outcome = await gateway.fetchStatus({
      credential: CREDENTIAL,
      providerApiVersion: 'v3',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome).toEqual({ cause: 'provider_not_configured', status: 'error' })
    expect(decrypted).toEqual([])
  })
})

describe('NFS-e limitador único — compartilhado pelos dois gateways', () => {
  function listResponse(): Response {
    return new Response(JSON.stringify({ results: [], success: true }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  test('uma chamada de emissão e uma de consulta v3 dividem o mesmo relógio', async () => {
    let now = 10_000
    const slept: number[] = []
    const started: number[] = []
    const limitedFetch = createRateLimitedFetch({
      clock: () => now,
      fetch: async () => {
        started.push(now)
        return listResponse()
      },
      minIntervalMilliseconds: 1000,
      sleep: async (milliseconds) => {
        slept.push(milliseconds)
        now += milliseconds
      },
    })
    const issuance = createNfseFiscalGateway({
      config: GATEWAY_CONFIG,
      fetch: rejectingFetch,
      secretService: SECRET_SERVICE,
      v3Fetch: limitedFetch,
    })
    const status = createNfseFiscalStatusGateway({
      config: { baseUrl: GATEWAY_CONFIG.baseUrl, timeoutMilliseconds: 15_000 },
      fetch: rejectingFetch,
      secretService: SECRET_SERVICE,
      v3Fetch: limitedFetch,
    })

    await issuance.fetchStatus({
      credential: CREDENTIAL,
      providerApiVersion: 'v3',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })
    await status.fetchStatus({
      credential: CREDENTIAL,
      providerApiVersion: 'v3',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(started).toEqual([10_000, 11_000])
    expect(slept).toEqual([1000])
  })

  test('a v2 passa pelo fetch cru, sem espera do limitador', async () => {
    const slept: number[] = []
    const limitedFetch = createRateLimitedFetch({
      clock: () => 0,
      fetch: async () => listResponse(),
      minIntervalMilliseconds: 1000,
      sleep: async (milliseconds) => {
        slept.push(milliseconds)
      },
    })
    const calls: Calls = []
    const gateway = createNfseFiscalGateway({
      config: GATEWAY_CONFIG,
      createClient: () => createFakeV2Client(calls),
      fetch: rejectingFetch,
      secretService: SECRET_SERVICE,
      v3Fetch: limitedFetch,
    })
    const base = {
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v2',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    } as const

    await gateway.issue(base)
    await gateway.issue(base)

    expect(calls).toEqual(['v2.issue', 'v2.issue'])
    expect(slept).toEqual([])
  })
})

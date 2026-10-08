/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseFiscalGateway } from '../../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import type { NotaRpV3Config } from '../../src/nfse-issuance/infrastructure/nota-rp-v3.types.js'
import {
  API_TOKEN,
  CALLBACK_BASE_URL,
  CALLBACK_TOKEN,
  COMPANY_TAX_ID,
  CREDENTIAL,
  GATEWAY_CONFIG,
  PROVIDER_DOCUMENT_ID,
  PROVIDER_ORIGIN_V3,
  PROVIDER_REQUEST_KEY,
  SECRET_SERVICE,
  V3_PAYLOAD,
  createFakeV2Client,
  createFakeV3Client,
  rejectingFetch,
  type Calls,
} from './fixture.js'

function buildGateway(input: {
  calls: Calls
  configs?: NotaRpV3Config[]
  seen?: Record<string, unknown>[]
  config?:
    | typeof GATEWAY_CONFIG
    | { baseUrl: string; callbackBaseUrl: undefined; timeoutMilliseconds: number }
}) {
  return createNfseFiscalGateway({
    config: input.config ?? GATEWAY_CONFIG,
    createClient: () => createFakeV2Client(input.calls),
    createV3Client: ({ config }) => {
      input.configs?.push(config)
      return createFakeV3Client(input.calls, input.seen)
    },
    fetch: rejectingFetch,
    secretService: SECRET_SERVICE,
  })
}

describe('NFS-e gateway de emissão — roteamento pela versão da tentativa', () => {
  test('v2 emite pelo cliente v2 e nunca monta o cliente v3', async () => {
    const calls: Calls = []

    const outcome = await buildGateway({ calls }).issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v2',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome).toEqual({ providerDocumentId: 'v2-nota', status: 'accepted' })
    expect(calls).toEqual(['v2.issue'])
  })

  test('v3 emite pelo cliente v3 com chave do provedor, id_nota da reedição e a config completa', async () => {
    const calls: Calls = []
    const configs: NotaRpV3Config[] = []
    const seen: Record<string, unknown>[] = []

    const outcome = await buildGateway({ calls, configs, seen }).issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v3',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome).toEqual({ providerDocumentId: 'v3-nota', status: 'accepted' })
    expect(calls).toEqual(['v3.issue'])
    expect(seen[0]).toEqual({
      payload: V3_PAYLOAD,
      providerDocumentId: PROVIDER_DOCUMENT_ID,
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })
    expect(configs[0]).toEqual({
      baseUrl: GATEWAY_CONFIG.baseUrl,
      callbackBaseUrl: CALLBACK_BASE_URL,
      callbackToken: CALLBACK_TOKEN,
      municipalRegistration: CREDENTIAL.municipalRegistration,
      taxId: COMPANY_TAX_ID,
      timeoutMilliseconds: GATEWAY_CONFIG.timeoutMilliseconds,
      token: API_TOKEN,
    })
  })

  test('v3 sem id_nota não o inventa', async () => {
    const calls: Calls = []
    const seen: Record<string, unknown>[] = []

    await buildGateway({ calls, seen }).issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v3',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(seen[0]).not.toHaveProperty('providerDocumentId')
  })

  test('v3 sem endereço de retorno é provider_not_configured, com o envelope fechado', async () => {
    const calls: Calls = []

    const outcome = await buildGateway({
      calls,
      config: {
        baseUrl: GATEWAY_CONFIG.baseUrl,
        callbackBaseUrl: undefined,
        timeoutMilliseconds: 1,
      },
    }).issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v3',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome).toEqual({ cause: 'provider_not_configured', status: 'error' })
    expect(calls).toEqual([])
  })

  test('v3 com envelope ilegível é credential_unreadable', async () => {
    const gateway = createNfseFiscalGateway({
      config: GATEWAY_CONFIG,
      fetch: rejectingFetch,
      secretService: {
        decrypt: async () => {
          throw new Error('sealed')
        },
      },
    })

    const outcome = await gateway.issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v3',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome).toEqual({ cause: 'credential_unreadable', status: 'error' })
  })

  // O zod da v2 não pode interceptar: a recusa nomeada da v3 mora no cliente.
  test('payload v3 sem nationalTaxationCode é rejected, e não error invalid_payload', async () => {
    const requests: string[] = []
    const gateway = createNfseFiscalGateway({
      config: GATEWAY_CONFIG,
      fetch: rejectingFetch,
      secretService: SECRET_SERVICE,
      v3Fetch: async (url) => {
        requests.push(url)
        throw new Error('A recusa nomeada não chega à rede')
      },
    })
    const withoutCode: Record<string, unknown> = { ...V3_PAYLOAD }
    delete withoutCode['nationalTaxationCode']

    const outcome = await gateway.issue({
      credential: CREDENTIAL,
      payload: withoutCode,
      providerApiVersion: 'v3',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.cause).toBeUndefined()
    expect(requests).toEqual([])
  })

  test('v3 usa o fetch do limitador e nunca o fetch cru; a v2 faz o inverso', async () => {
    const v3Requests: string[] = []
    const gateway = createNfseFiscalGateway({
      config: GATEWAY_CONFIG,
      createClient: () => createFakeV2Client([]),
      fetch: rejectingFetch,
      secretService: SECRET_SERVICE,
      v3Fetch: async (url) => {
        v3Requests.push(url)
        return new Response(JSON.stringify({ id_nota: 1, success: true }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    })

    const v3 = await gateway.issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v3',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })
    await gateway.issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v2',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(v3).toEqual({ providerDocumentId: '1', status: 'accepted' })
    expect(v3Requests).toEqual([`${PROVIDER_ORIGIN_V3}/nota/emitir`])
  })

  test('cancelamento e documentos seguem a versão recebida', async () => {
    const calls: Calls = []
    const gateway = buildGateway({ calls })
    const base = { credential: CREDENTIAL, providerDocumentId: PROVIDER_DOCUMENT_ID }

    await gateway.cancel({ ...base, cancellationMotive: '2', providerApiVersion: 'v2' })
    await gateway.cancel({ ...base, cancellationMotive: '4', providerApiVersion: 'v3' })
    await gateway.fetchDocument({ ...base, kind: 'pdf', providerApiVersion: 'v2' })
    await gateway.fetchDocument({ ...base, kind: 'xml', providerApiVersion: 'v3' })
    await gateway.fetchStatus({ ...base, providerApiVersion: 'v2' })
    await gateway.fetchStatus({ ...base, providerApiVersion: 'v3' })

    expect(calls).toEqual([
      'v2.cancel',
      'v3.cancel',
      'v2.fetchDocument',
      'v3.fetchDocument',
      'v2.fetchStatus',
      'v3.fetchStatus',
    ])
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfseFiscalGateway } from '../../src/nfse-issuance/infrastructure/nfse-fiscal-gateway.js'
import { createNfseFiscalStatusGateway } from '../../src/nfse-status-pull/infrastructure/nfse-fiscal-status.gateway.js'
import {
  documentBody,
  errorBody,
  issuedBody,
  jsonResponse,
  listBody,
  noteListItem,
  recordingFetch,
  type FetchCall,
} from '../nota-rp-v3/fixture.js'
import {
  BASE_URL,
  CALLBACK_BASE_URL,
  CREDENTIAL,
  PROVIDER_DOCUMENT_ID,
  PROVIDER_ORIGIN_V3,
  PROVIDER_REQUEST_KEY,
  SECRET_SERVICE,
  V3_PAYLOAD,
} from './fixture.js'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const CONFIG = { baseUrl: BASE_URL, callbackBaseUrl: CALLBACK_BASE_URL, timeoutMilliseconds: 8000 }

/** Gateway de emissão e de consulta com o cliente v3 REAL, cada um com o fetch cru proibido. */
function buildGateways(respond: (call: FetchCall) => Response) {
  const v3 = recordingFetch(respond)
  const raw = recordingFetch(() => jsonResponse({}, 500))
  const issuance = createNfseFiscalGateway({
    clock: () => new Date('2026-10-08T02:30:00.000Z'),
    config: CONFIG,
    fetch: raw.fetch,
    secretService: SECRET_SERVICE,
    v3Fetch: v3.fetch,
  })
  const status = createNfseFiscalStatusGateway({
    config: CONFIG,
    fetch: raw.fetch,
    secretService: SECRET_SERVICE,
    v3Fetch: v3.fetch,
  })
  return { issuance, raw, status, v3 }
}

const base = { credential: CREDENTIAL, providerDocumentId: PROVIDER_DOCUMENT_ID }

describe('NFS-e gateways com o cliente v3 real — ponta a ponta', () => {
  test('emite: POST /api/v3/nota/emitir com hash_pedido e devolve o id_nota', async () => {
    const { issuance, raw, v3 } = buildGateways(() => issuedBody())

    const outcome = await issuance.issue({
      credential: CREDENTIAL,
      payload: V3_PAYLOAD,
      providerApiVersion: 'v3',
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome).toEqual({ providerDocumentId: PROVIDER_DOCUMENT_ID, status: 'accepted' })
    expect(v3.calls[0]?.url).toBe(`${PROVIDER_ORIGIN_V3}/nota/emitir`)
    expect(JSON.parse(v3.calls[0]?.body ?? '{}').flags.hash_pedido).toBe(PROVIDER_REQUEST_KEY)
    expect(raw.calls).toEqual([])
  })

  test('consulta: Sucesso vira authorized com número e chave', async () => {
    const { raw, status, v3 } = buildGateways(() => listBody([noteListItem()]))

    const facts = await status.fetchStatus({ ...base, providerApiVersion: 'v3' })

    expect(facts.status).toBe('authorized')
    expect(v3.calls[0]?.url).toBe(
      `${PROVIDER_ORIGIN_V3}/nota/listar?id_nota=${PROVIDER_DOCUMENT_ID}`,
    )
    expect(raw.calls).toEqual([])
  })

  test('consulta pelo gateway de emissão fala o mesmo vocabulário', async () => {
    const { issuance } = buildGateways(() => listBody([noteListItem({ status: 'Pendente' })]))

    expect((await issuance.fetchStatus({ ...base, providerApiVersion: 'v3' })).status).toBe(
      'pending',
    )
  })

  test('documento: PDF em base64 vira bytes', async () => {
    const { raw, status, v3 } = buildGateways(() => documentBody(PDF_BYTES))

    const document = await status.fetchDocument({ ...base, kind: 'pdf', providerApiVersion: 'v3' })

    expect(document).toEqual({ bytes: PDF_BYTES, contentType: 'application/pdf', status: 'ok' })
    expect(v3.calls[0]?.url).toBe(`${PROVIDER_ORIGIN_V3}/nota/pdf?id_nota=${PROVIDER_DOCUMENT_ID}`)
    expect(raw.calls).toEqual([])
  })

  test('cancela: o código do banco 4 vira outros com a descrição, pelo gateway', async () => {
    const { issuance, v3 } = buildGateways(() =>
      jsonResponse({ message: 'Nota cancelada com sucesso!', success: true }),
    )

    const outcome = await issuance.cancel({
      ...base,
      cancellationMotive: '4',
      providerApiVersion: 'v3',
    })

    expect(outcome).toEqual({ status: 'accepted' })
    expect(JSON.parse(v3.calls[0]?.body ?? '{}')).toMatchObject({
      descricao: 'Nota duplicada',
      motivo: 'outros',
    })
  })

  test('cancela: 409 confirmado Cancelada na consulta é accepted; sem confirmação é rejected', async () => {
    const confirmed = buildGateways((call) =>
      call.method === 'POST'
        ? errorBody({ message: 'conflito de estado', status: 409 })
        : listBody([noteListItem({ status: 'Cancelada' })]),
    )
    const unconfirmed = buildGateways((call) =>
      call.method === 'POST'
        ? errorBody({ message: 'conflito de estado', status: 409 })
        : listBody([noteListItem({ status: 'Sucesso' })]),
    )
    const input = { ...base, cancellationMotive: '2', providerApiVersion: 'v3' } as const

    expect(await confirmed.issuance.cancel(input)).toEqual({ status: 'accepted' })
    const refused = await unconfirmed.issuance.cancel(input)
    expect(refused.status).toBe('rejected')
    expect(refused.rejection?.code).toBe('NOTA_RP_HTTP_409')
  })

  test('cancela: 409 com a consulta fora do ar é error recuperável', async () => {
    const { issuance } = buildGateways((call) =>
      call.method === 'POST'
        ? errorBody({ message: 'conflito de estado', status: 409 })
        : errorBody({ message: 'indisponível', status: 503 }),
    )

    const outcome = await issuance.cancel({
      ...base,
      cancellationMotive: '2',
      providerApiVersion: 'v3',
    })

    expect(outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
  })

  test('a v2 segue no fetch cru e nunca toca o fetch da v3', async () => {
    const { issuance, raw, v3 } = buildGateways(() => issuedBody())

    await issuance.fetchStatus({ ...base, providerApiVersion: 'v2' })
    await issuance.cancel({ ...base, cancellationMotive: '2', providerApiVersion: 'v2' })

    expect(v3.calls).toEqual([])
    expect(raw.calls.length).toBeGreaterThan(0)
    expect(raw.calls.every((call) => call.url.startsWith(BASE_URL))).toBe(true)
  })
})

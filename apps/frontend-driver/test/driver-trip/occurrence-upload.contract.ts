/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  DRIVER_TRIP_ERROR,
  DriverTripRequestError,
  createDriverTripClient,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'

const API = 'https://api.test'
const UPLOAD_ID = '00000000-0000-4000-8000-0000000000a1'
const UPLOAD_URL = 'https://storage.test/bucket/objeto?X-Amz-Signature=assinatura'
const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])

function buildReport(
  overrides: Partial<Extract<DriverFieldReport, { kind: 'documentOccurrence' }>> = {},
): Extract<DriverFieldReport, { kind: 'documentOccurrence' }> {
  return {
    documentId: 'document-1',
    idempotencyKey: 'chave-da-ocorrencia',
    kind: 'documentOccurrence',
    note: 'Cliente recusou na porta',
    occurrenceTypeId: 'type-1',
    occurrenceTypeName: 'Recusa total',
    photo: { blob: new Blob([PHOTO_BYTES], { type: 'image/jpeg' }), fileName: 'recusa.jpg' },
    productCode: '',
    ...overrides,
  }
}

type Responder = (request: Request) => Promise<Response>

function buildClient(respond: Responder) {
  const seen: Request[] = []
  const client = createDriverTripClient({
    apiUrl: API,
    fetch: (input) => {
      const request = input as Request
      seen.push(request.clone())
      return respond(request)
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
  return { client, seen }
}

/** O caminho feliz: a API emite a URL, o storage aceita, a API confirma e registra. */
const happyPath: Responder = (request) => {
  const url = new URL(request.url)
  if (url.origin === 'https://storage.test')
    return Promise.resolve(new Response(null, { status: 200 }))
  if (url.pathname.endsWith('/occurrence-uploads')) {
    return Promise.resolve(
      Response.json({ data: { id: UPLOAD_ID, uploadUrl: UPLOAD_URL } }, { status: 201 }),
    )
  }
  if (url.pathname.endsWith('/confirm'))
    return Promise.resolve(Response.json({ data: { id: UPLOAD_ID } }))
  return Promise.resolve(Response.json({ data: { id: 'occurrence-1' } }, { status: 201 }))
}

/**
 * Spec 179 T303 (RF2/RF9): a ocorrência da fila sobe a foto **dentro do próprio `send`**, antes do
 * `POST` — o servidor recusa tipo `required` sem anexo, e a drenagem de evento-depois-anexo daria
 * `422`. O arquivo nunca passa pela API: vai direto ao storage pela URL assinada.
 */
describe('a ocorrência com foto sobe inteira pelo send (spec 179 T303)', () => {
  it('pede a URL, sobe ao storage, confirma e só então registra com o anexo', async () => {
    const { client, seen } = buildClient(happyPath)

    await client.send(buildReport())

    expect(seen.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      'POST /me/trips/current/documents/document-1/occurrence-uploads',
      'PUT /bucket/objeto',
      `POST /me/trips/current/documents/document-1/occurrence-uploads/${UPLOAD_ID}/confirm`,
      'POST /me/trips/current/documents/document-1/occurrences',
    ])
    expect(await seen[0]?.json()).toEqual({ mimeType: 'image/jpeg', sizeBytes: PHOTO_BYTES.length })
    expect(new Uint8Array(await (seen[1] as Request).arrayBuffer())).toEqual(PHOTO_BYTES)
    expect(await seen[3]?.json()).toEqual({
      attachmentObjectId: UPLOAD_ID,
      note: 'Cliente recusou na porta',
      occurrenceTypeId: 'type-1',
      productCode: '',
    })
  })

  /** A chave é a do toque, gravada na fila: o reenvio casa com o registro que já existe (RF9). */
  it('o registro leva a chave do item da fila', async () => {
    const { client, seen } = buildClient(happyPath)

    await client.send(buildReport())

    expect(seen[3]?.headers.get('idempotency-key')).toBe('chave-da-ocorrencia')
  })

  /** O token da API nunca vai ao storage — a assinatura da URL é a credencial dele. */
  it('o PUT ao storage não leva o token', async () => {
    const { client, seen } = buildClient(happyPath)

    await client.send(buildReport())

    expect(seen[1]?.headers.get('authorization')).toBeNull()
    expect(seen[1]?.headers.get('content-type')).toBe('image/jpeg')
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer token-de-mentira')
  })

  it('sem foto, só o registro — sem anexo no corpo', async () => {
    const { client, seen } = buildClient(happyPath)

    await client.send(buildReport({ photo: null }))

    expect(seen).toHaveLength(1)
    expect(await seen[0]?.json()).toEqual({
      note: 'Cliente recusou na porta',
      occurrenceTypeId: 'type-1',
      productCode: '',
    })
  })

  /** Subsolo: o storage não respondeu. É "tente depois", e o item fica na fila. */
  it('rede caída no PUT é offline, e o registro não sai', async () => {
    const { client, seen } = buildClient((request) =>
      new URL(request.url).origin === 'https://storage.test'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : happyPath(request),
    )

    const error = await client.send(buildReport()).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DriverTripRequestError)
    expect((error as DriverTripRequestError).isOffline).toBe(true)
    expect(seen.some((request) => request.url.endsWith('/occurrences'))).toBe(false)
  })

  /** URL vencida ou assinatura recusada: é resposta, não rede — o item fica à vista como recusado. */
  it('recusa do storage é recusa, com o status', async () => {
    const { client } = buildClient((request) =>
      new URL(request.url).origin === 'https://storage.test'
        ? Promise.resolve(new Response('<Error/>', { status: 403 }))
        : happyPath(request),
    )

    const error = (await client
      .send(buildReport())
      .catch((caught: unknown) => caught)) as DriverTripRequestError

    expect(error.isOffline).toBe(false)
    expect(error.code).toBe(DRIVER_TRIP_ERROR.UPLOAD_FAILED)
    expect(error.status).toBe(403)
  })

  /** Resposta adulterada não escolhe para onde a foto vai: só `https:`, e `http:` de loopback. */
  it('URL de upload fora de https é resposta inválida, e nada sobe', async () => {
    for (const uploadUrl of ['javascript:alert(1)', 'http://storage.test/objeto']) {
      const { client, seen } = buildClient((request) =>
        new URL(request.url).pathname.endsWith('/occurrence-uploads')
          ? Promise.resolve(Response.json({ data: { id: UPLOAD_ID, uploadUrl } }, { status: 201 }))
          : happyPath(request),
      )

      const error = (await client
        .send(buildReport())
        .catch((caught: unknown) => caught)) as DriverTripRequestError

      expect(error.code).toBe(DRIVER_TRIP_ERROR.RESPONSE_INVALID)
      expect(seen).toHaveLength(1)
    }
  })

  it('o MinIO local (http de loopback) é aceito', async () => {
    const localUrl = 'http://localhost:59000/bucket/objeto?X-Amz-Signature=a'
    const { client, seen } = buildClient((request) => {
      const url = new URL(request.url)
      if (url.origin === 'http://localhost:59000')
        return Promise.resolve(new Response(null, { status: 200 }))
      if (url.pathname.endsWith('/occurrence-uploads')) {
        return Promise.resolve(
          Response.json({ data: { id: UPLOAD_ID, uploadUrl: localUrl } }, { status: 201 }),
        )
      }
      return happyPath(request)
    })

    await client.send(buildReport())

    expect(seen).toHaveLength(4)
  })

  /** A recusa da API no registro (tipo exige observação) sobe com o código que a tela traduz. */
  it('recusa do registro sobe com o código da API', async () => {
    const { client } = buildClient((request) =>
      new URL(request.url).pathname.endsWith('/occurrences')
        ? Promise.resolve(
            Response.json({ error: { code: 'TRIP_OCCURRENCE_NOTE_REQUIRED' } }, { status: 422 }),
          )
        : happyPath(request),
    )

    const error = (await client
      .send(buildReport({ note: '' }))
      .catch((caught: unknown) => caught)) as DriverTripRequestError

    expect(error.code).toBe('TRIP_OCCURRENCE_NOTE_REQUIRED')
    expect(error.status).toBe(422)
  })
})

/** A leitura dos tipos aceita o modo de anexo quando a API passar a mandá-lo — e não exige. */
describe('o modo de anexo do tipo, quando vier', () => {
  it('lê attachmentMode válido e ignora o ausente', async () => {
    const { client } = buildClient(() =>
      Promise.resolve(
        Response.json({
          data: [
            { attachmentMode: 'required', id: 'a', name: 'Recusa total' },
            { id: 'b', name: 'Destinatário ausente' },
          ],
        }),
      ),
    )

    expect(await client.listOccurrenceTypes()).toEqual({
      status: 'loaded',
      types: [
        { attachmentMode: 'required', id: 'a', name: 'Recusa total' },
        { id: 'b', name: 'Destinatário ausente' },
      ],
    })
  })

  it('modo fora do vocabulário vira falha, não um tipo mal lido', async () => {
    const { client } = buildClient(() =>
      Promise.resolve(Response.json({ data: [{ attachmentMode: 'sempre', id: 'a', name: 'x' }] })),
    )

    expect(await client.listOccurrenceTypes()).toEqual({ status: 'failed' })
  })
})

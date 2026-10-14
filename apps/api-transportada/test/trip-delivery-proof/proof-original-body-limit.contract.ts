/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 T002 (RF1, RF2): o teto do corpo é **por rota**. Só `POST /me/trips/current/documents/:id/proof`
 * passa de 1 MiB (até `PROOF_ORIGINAL_MAX_REQUEST_BYTES`); toda outra rota segue com o teto de antes. O
 * original sobe inteiro, e o 413 vem antes da rota — com o corpo lido em fluxo, mesmo sem `content-length`.
 */
import { describe, expect, it } from 'bun:test'

import {
  limitRequestBody,
  resolveRequestBodyLimits,
  SERVER_REQUEST_BODY_CEILING_BYTES,
} from '../../src/http/request-body-limit.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import {
  APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
  PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES,
  SERVER_MAX_REQUEST_BODY_SIZE_BYTES,
} from '../../src/shared/api.constant.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  attachDeliveryProof,
  type DeliveryProofPort,
} from '../../src/trips/application/attach-delivery-proof.use-case.js'
import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  DELIVERY_PROOF_MAX_BYTES,
  DELIVERY_PROOF_THUMBNAIL_MAX_BYTES,
  PROOF_ORIGINAL_MAX_BYTES,
} from '../../src/trips/domain/delivery-proof.policy.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  responseApiError,
} from '../fixtures/freight-region-http.fixture.js'

const MIB = 1024 * 1024
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const PROOF_PATH = `/me/trips/current/documents/${DOCUMENT_ID}/proof`
const OTHER_PATH = `/trips/${DOCUMENT_ID}/field-proof`
const REPORT_PERMISSIONS: CompanyContext['permissions'] = new Set(['trip.report'] as const)

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

/** Um JPEG de verdade só no começo (assinatura `FF D8 FF`): o resto é enchimento. */
function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

function buildHandler() {
  const stored: string[] = []
  const saved: Parameters<DeliveryProofPort['saveProof']>[0][] = []
  const repository: DeliveryProofPort = {
    findDeliveryContext: async () => ({
      deliveredAt: new Date('2026-09-26T12:00:00.000Z'),
      deliveryEventPosition: undefined,
      isDeliveryRecordedByDriver: true,
      stopPosition: undefined,
    }),
    findDeliveryEventId: async () => EVENT_ID,
    findProofIdByAttachmentKey: async () => null,
    countProofsForEvent: async () => 0,
    findProofPunctuality: async () => null,
    resolveProofFieldSettings: async () => DEFAULT_DELIVERY_PROOF_SETTINGS,
    resolveProofPunctualitySettings: async () => DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
    saveProof: async (proof) => {
      saved.push(proof)
      return { id: 'proof-1' }
    },
  }
  const routes = createMeTripRoutes({
    attachProof: (input) =>
      attachDeliveryProof({
        ...input,
        newObjectId: () => crypto.randomUUID(),
        newProofId: () => 'proof-1',
        now: new Date('2026-09-26T12:05:00.000Z'),
        repository,
        sealDocument: () => Promise.reject(new Error('DOCUMENT_MUST_NOT_BE_SEALED_HERE')),
        storage: {
          store: async (proof) => {
            stored.push(proof.objectKey)
            return { sha256: 'a'.repeat(64) }
          },
        },
      }),
    confirmOccurrenceUpload: NOT_CALLED,
    createOccurrenceUpload: NOT_CALLED,
    dispatchCurrentTrip: NOT_CALLED,
    findCurrentTrip: NOT_CALLED,
    listFieldOccurrenceTypes: NOT_CALLED,
    readDeliveryProofs: NOT_CALLED,
    readManifestXml: NOT_CALLED,
    registerDriverOccurrence: NOT_CALLED,
    renderManifestDamdfe: NOT_CALLED,
    reportArrival: NOT_CALLED,
    reportDeparture: NOT_CALLED,
    cancelStopDeparture: NOT_CALLED,
    reportDelivery: NOT_CALLED,
    reportOccurrence: NOT_CALLED,
    reportReturn: NOT_CALLED,
    resolveDriverId: async () => DRIVER_ID,
    startFieldTrip: NOT_CALLED,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(REPORT_PERMISSIONS), routes }),
  })

  return {
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    saved,
    stored,
  }
}

async function multipartBody(input: {
  readonly fileBytes: number
  readonly variant?: string
}): Promise<{ readonly body: ArrayBuffer; readonly contentType: string }> {
  const form = new FormData()
  form.set('file', new File([jpegBytes(input.fileBytes)], 'canhoto.jpg', { type: 'image/jpeg' }))
  form.set('kind', 'photo')
  if (input.variant !== undefined) form.set('variant', input.variant)
  const draft = new Request(`${FRONTEND_ORIGIN}${PROOF_PATH}`, { body: form, method: 'POST' })

  // O `content-type` (com a fronteira) lê-se antes de serializar o corpo: depois a fronteira não bate.
  const contentType = draft.headers.get('content-type') ?? ''

  return { body: await draft.arrayBuffer(), contentType }
}

/** O multipart serializado, com `content-length` — é o que o navegador manda de verdade. */
async function proofRequest(input: {
  readonly fileBytes: number
  readonly method?: string
  readonly pathname?: string
  readonly variant?: string
}): Promise<Request> {
  const { body, contentType } = await multipartBody(input)

  return new Request(`${FRONTEND_ORIGIN}${input.pathname ?? PROOF_PATH}`, {
    body,
    headers: {
      'content-length': String(body.byteLength),
      'content-type': contentType,
      origin: FRONTEND_ORIGIN,
      'x-correlation-id': CORRELATION_ID,
    },
    method: input.method ?? 'POST',
  })
}

/** O mesmo corpo em pedaços de 64 KiB e **sem** `content-length`: o que um proxy HTTP/2 pode mandar. */
async function chunkedProofRequest(input: {
  readonly fileBytes: number
  readonly variant: string
}): Promise<Request> {
  const { body, contentType } = await multipartBody(input)
  const bytes = new Uint8Array(body)
  const CHUNK = 64 * 1024
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + CHUNK))
      offset += CHUNK
    },
  })

  return new Request(`${FRONTEND_ORIGIN}${PROOF_PATH}`, {
    body: stream,
    duplex: 'half',
    headers: {
      'content-type': contentType,
      origin: FRONTEND_ORIGIN,
      'x-correlation-id': CORRELATION_ID,
    },
    method: 'POST',
  } as RequestInit)
}

describe('os tetos de corpo da API (spec 265 RF1)', () => {
  it('o original cabe em 12 MiB; o corpo da rota soma a folga da miniatura e dos campos', () => {
    expect(PROOF_ORIGINAL_MAX_BYTES).toBe(12 * MIB)
    expect(PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES).toBeGreaterThanOrEqual(
      PROOF_ORIGINAL_MAX_BYTES + DELIVERY_PROOF_THUMBNAIL_MAX_BYTES + 64 * 1024,
    )
    expect(PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES).toBeLessThanOrEqual(13 * MIB)
  })

  it('o teto das demais rotas não mexe: 1 MiB na aplicação, 2 MiB no servidor', () => {
    expect(APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES).toBe(MIB)
    expect(SERVER_MAX_REQUEST_BODY_SIZE_BYTES).toBe(2 * MIB)
    expect(DELIVERY_PROOF_MAX_BYTES).toBe(960 * 1024)
  })

  it('só POST do comprovante do motorista ganha o teto maior; o resto tem os de sempre', () => {
    const proof = resolveRequestBodyLimits({ method: 'POST', pathname: PROOF_PATH })
    expect(proof.applicationBytes).toBe(PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES)
    expect(proof.serverBytes).toBe(PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES)

    const ordinary = {
      applicationBytes: APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
      serverBytes: SERVER_MAX_REQUEST_BODY_SIZE_BYTES,
    }
    for (const request of [
      { method: 'PUT', pathname: PROOF_PATH },
      { method: 'PATCH', pathname: PROOF_PATH },
      { method: 'GET', pathname: PROOF_PATH },
      { method: 'POST', pathname: OTHER_PATH },
      { method: 'POST', pathname: `${PROOF_PATH}/extra` },
      { method: 'POST', pathname: `/me/trips/current/documents/${DOCUMENT_ID}/proof-copy` },
      { method: 'POST', pathname: '/me/trips/current/documents//proof' },
      { method: 'POST', pathname: `/other/me/trips/current/documents/${DOCUMENT_ID}/proof` },
    ]) {
      expect(resolveRequestBodyLimits(request), JSON.stringify(request)).toEqual(ordinary)
    }
  })

  it('o teto do Bun.serve acomoda a rota do comprovante sem baixar o das outras', () => {
    expect(SERVER_REQUEST_BODY_CEILING_BYTES).toBe(PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES)
    expect(SERVER_REQUEST_BODY_CEILING_BYTES).toBeGreaterThan(SERVER_MAX_REQUEST_BODY_SIZE_BYTES)
  })
})

describe('o original pela rota HTTP (spec 265 RF1, RF2)', () => {
  it('3 MB de original passam o corpo de 1 MiB e voltam 201 com o estado "received"', async () => {
    const { handle, saved, stored } = buildHandler()
    const request = await proofRequest({ fileBytes: 3 * MIB, variant: 'original' })
    expect(Number(request.headers.get('content-length'))).toBeGreaterThan(
      APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES,
    )

    const response = await handle(request)

    expect(response.status).toBe(201)
    const body = (await response.json()) as { data: { processingState: string } }
    expect(body.data.processingState).toBe('received')
    expect(stored).toHaveLength(1)
    expect(saved).toHaveLength(1)
  })

  it('o mesmo corpo como variant reduced volta 422 TRIP_DELIVERY_PROOF_TOO_LARGE: o teto do reduzido é o de 960 KiB', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(await proofRequest({ fileBytes: 3 * MIB, variant: 'reduced' }))

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
    expect(stored).toEqual([])
  })

  it('sem o campo variant vale reduced: o app antigo recebe a recusa de sempre', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(await proofRequest({ fileBytes: 2 * MIB }))

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
    expect(stored).toEqual([])
  })

  it('o original de exatamente 12 MiB volta 201', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(
      await proofRequest({ fileBytes: PROOF_ORIGINAL_MAX_BYTES, variant: 'original' }),
    )

    expect(response.status).toBe(201)
    expect(stored).toHaveLength(1)
  })

  it('12 MiB + 1 byte cabe no corpo da rota mas volta 422 TOO_LARGE do caso de uso', async () => {
    const { handle, stored } = buildHandler()
    const request = await proofRequest({
      fileBytes: PROOF_ORIGINAL_MAX_BYTES + 1,
      variant: 'original',
    })
    expect(Number(request.headers.get('content-length'))).toBeLessThan(
      PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES,
    )

    const response = await handle(request)

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
    expect(stored).toEqual([])
  })

  it('acima do corpo da rota (13 MiB) volta 413 antes da rota, sem tocar no bucket', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(await proofRequest({ fileBytes: 13 * MIB, variant: 'original' }))

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).code).toBe('PAYLOAD_TOO_LARGE')
    expect(stored).toEqual([])
  })

  it('as demais rotas seguem em 413 a partir de 1 MiB, com o mesmo corpo de 3 MB', async () => {
    const { handle, stored } = buildHandler()

    for (const request of [
      await proofRequest({ fileBytes: 3 * MIB, pathname: OTHER_PATH, variant: 'original' }),
      await proofRequest({ fileBytes: 3 * MIB, method: 'PUT', variant: 'original' }),
      await proofRequest({ fileBytes: 1100 * 1024, pathname: OTHER_PATH }),
    ]) {
      const response = await handle(request)

      expect(response.status).toBe(413)
      expect((await responseApiError(response)).code).toBe('PAYLOAD_TOO_LARGE')
    }
    expect(stored).toEqual([])
  })

  it('o corpo é lido em fluxo: sem content-length, 3 MB de original passam', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(
      await chunkedProofRequest({ fileBytes: 3 * MIB, variant: 'original' }),
    )

    expect(response.status).toBe(201)
    expect(stored).toHaveLength(1)
  })

  it('o corpo é lido em fluxo: sem content-length, 13 MiB voltam 413 e nada é gravado', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(
      await chunkedProofRequest({ fileBytes: 13 * MIB, variant: 'original' }),
    )

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).code).toBe('PAYLOAD_TOO_LARGE')
    expect(stored).toEqual([])
  })
})

describe('a leitura limitada do corpo (spec 265 RF2)', () => {
  function streamOf(chunks: number, chunkBytes: number): ReadableStream<Uint8Array> {
    let sent = 0
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= chunks) {
          controller.close()
          return
        }
        sent += 1
        controller.enqueue(new Uint8Array(chunkBytes))
      },
    })
  }

  it('passa o corpo que cabe no teto, byte a byte', async () => {
    const request = new Request('http://api.test/x', {
      body: streamOf(4, 1024),
      duplex: 'half',
      method: 'POST',
    } as RequestInit)

    const limited = limitRequestBody(request, 4096)

    expect((await limited.arrayBuffer()).byteLength).toBe(4096)
  })

  it('para no primeiro pedaço que passa do teto, com o 413 da API', async () => {
    const request = new Request('http://api.test/x', {
      body: streamOf(5, 1024),
      duplex: 'half',
      method: 'POST',
    } as RequestInit)

    const limited = limitRequestBody(request, 4096)
    const error = await limited.arrayBuffer().catch((cause: unknown) => cause)

    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(413)
  })

  it('requisição sem corpo volta como veio', () => {
    const request = new Request('http://api.test/x', { method: 'GET' })

    expect(limitRequestBody(request, 10)).toBe(request)
  })
})

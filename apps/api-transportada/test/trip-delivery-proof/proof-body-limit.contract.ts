/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 212: a foto do canhoto pela rota HTTP inteira — `createRequestHandler` com o teto do corpo
 * (`APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES`, 1 MiB) e o caso de uso de verdade. O teto do arquivo
 * era 2 MB e nunca era alcançado: o 413 do corpo chegava antes, e a tela não sabia explicar.
 */
import { describe, expect, it } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
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
  OFFICE_PROOF_MAX_BYTES,
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

const DOCUMENT_ID = '00000000-0000-4000-8000-000000000004'
const DRIVER_ID = '00000000-0000-4000-8000-000000000003'
const EVENT_ID = '00000000-0000-4000-8000-000000000005'
const PROOF_PATH = `/me/trips/current/documents/${DOCUMENT_ID}/proof`
const REPORT_PERMISSIONS: CompanyContext['permissions'] = new Set(['trip.report'] as const)

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function buildHandler() {
  const stored: string[] = []
  const repository: DeliveryProofPort = {
    findDeliveryContext: async () => ({
      deliveredAt: new Date('2026-09-26T12:00:00.000Z'),
      deliveryEventPosition: undefined,
      stopPosition: undefined,
    }),
    findDeliveryEventId: async () => EVENT_ID,
    findProofIdByAttachmentKey: async () => null,
    findProofPunctuality: async () => null,
    resolveProofFieldSettings: async () => DEFAULT_DELIVERY_PROOF_SETTINGS,
    resolveProofPunctualitySettings: async () => DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
    saveProof: async () => ({ id: 'proof-1' }),
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
    readManifestXml: NOT_CALLED,
    registerDriverOccurrence: NOT_CALLED,
    renderManifestDamdfe: NOT_CALLED,
    reportArrival: NOT_CALLED,
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
    stored,
  }
}

/** O multipart serializado, com `content-length` — é o que o navegador manda de verdade. */
async function proofRequest(fileBytes: number): Promise<Request> {
  const form = new FormData()
  form.set('file', new File([new Uint8Array(fileBytes)], 'canhoto.jpg', { type: 'image/jpeg' }))
  form.set('kind', 'photo')
  const draft = new Request(`${FRONTEND_ORIGIN}${PROOF_PATH}`, { body: form, method: 'POST' })
  const contentType = draft.headers.get('content-type') ?? ''
  const body = await draft.arrayBuffer()

  return new Request(`${FRONTEND_ORIGIN}${PROOF_PATH}`, {
    body,
    headers: {
      'content-length': String(body.byteLength),
      'content-type': contentType,
      origin: FRONTEND_ORIGIN,
      'x-correlation-id': CORRELATION_ID,
    },
    method: 'POST',
  })
}

describe('a foto do canhoto pela rota HTTP (spec 212)', () => {
  it('o teto do arquivo do motorista é o do escritório (960 KiB), abaixo do corpo de 1 MiB', () => {
    expect(DELIVERY_PROOF_MAX_BYTES).toBe(OFFICE_PROOF_MAX_BYTES)
    expect(DELIVERY_PROOF_MAX_BYTES).toBe(960 * 1024)
  })

  it('o multipart de 1,1 MB volta 413 antes da rota, sem tocar no bucket', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(await proofRequest(1_100_000))

    expect(response.status).toBe(413)
    expect((await responseApiError(response)).code).toBe('PAYLOAD_TOO_LARGE')
    expect(stored).toEqual([])
  })

  it('o arquivo entre 960 KiB e o corpo de 1 MiB volta 422 TRIP_DELIVERY_PROOF_TOO_LARGE', async () => {
    const { handle, stored } = buildHandler()
    const request = await proofRequest(1000 * 1024)

    expect(Number(request.headers.get('content-length'))).toBeLessThan(1_048_576)
    const response = await handle(request)

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_DELIVERY_PROOF_TOO_LARGE')
    expect(stored).toEqual([])
  })

  it('a foto reduzida de 950 KiB volta 201 e sobe para o bucket', async () => {
    const { handle, stored } = buildHandler()

    const response = await handle(await proofRequest(950 * 1024))

    expect(response.status).toBe(201)
    expect(stored).toHaveLength(1)
  })
})

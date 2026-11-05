/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { FleetDriverAttachmentUseCase } from '../../src/fleet/application/fleet-driver-attachment.use-case.js'
import { FleetDriverAttachmentInvalidUploadError } from '../../src/fleet/domain/fleet-driver-attachment.error.js'
import { createFleetDriverAttachmentRoutes } from '../../src/fleet/presentation/fleet-driver-attachment.routes.js'
import { FLEET_DRIVER_ATTACHMENT_MAX_BYTES } from '../../src/fleet/presentation/fleet-driver-attachment.schema.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture.js'

const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000e1'
const PATH = `/fleet/drivers/${DRIVER_ID}/attachments`
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const READ_ONLY: CompanyContext['permissions'] = new Set(['fleet.read'] as const)
const MANAGE: CompanyContext['permissions'] = new Set(['fleet.read', 'fleet.manage'] as const)

function createFixture(
  input: {
    readonly permissions?: CompanyContext['permissions']
    readonly rejectUpload?: boolean
  } = {},
) {
  const calls: { readonly kind: string; readonly input: Record<string, unknown> }[] = []
  const attachments: FleetDriverAttachmentUseCase = {
    async attach(request) {
      calls.push({ input: { ...request, bytes: request.bytes.byteLength }, kind: 'attach' })
      if (input.rejectUpload === true) throw new FleetDriverAttachmentInvalidUploadError()
      return {
        createdAt: '2026-11-05T00:00:00.000Z',
        id: ATTACHMENT_ID,
        type: request.type,
        uploadedBy: request.uploadedBy,
      }
    },
    async remove(request) {
      calls.push({ input: { ...request }, kind: 'remove' })
    },
  }
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? MANAGE),
      routes: createFleetDriverAttachmentRoutes({ attachments }),
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

function uploadRequest(input: {
  readonly bytes?: Uint8Array
  readonly fields?: Readonly<Record<string, string>>
  readonly fileName?: string
  readonly fileType?: string
}): Request {
  const form = new FormData()
  for (const [name, value] of Object.entries(input.fields ?? { type: 'cnh' })) form.set(name, value)
  form.set(
    'file',
    new File([input.bytes ?? PDF_BYTES], input.fileName ?? 'cnh.pdf', {
      type: input.fileType ?? 'application/pdf',
    }),
  )
  return new Request(`${FRONTEND_ORIGIN}${PATH}`, {
    body: form,
    headers: { origin: FRONTEND_ORIGIN, 'x-correlation-id': CORRELATION_ID },
    method: 'POST',
  })
}

describe('as rotas do documento do motorista (spec 091 T010)', () => {
  test('quem só lê a frota não anexa nem remove', async () => {
    const fixture = createFixture({ permissions: READ_ONLY })

    expect((await fixture.handle(uploadRequest({}))).status).toBe(403)
    expect(
      (await fixture.handle(jsonRequest({ method: 'DELETE', path: `${PATH}/${ATTACHMENT_ID}` })))
        .status,
    ).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('anexar responde 201 só com identificador, tipo, data e quem anexou', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(uploadRequest({}))

    expect(response.status).toBe(201)
    expect(Object.keys(await responseData(response)).sort()).toEqual([
      'createdAt',
      'id',
      'type',
      'uploadedBy',
    ])
  })

  test('a empresa e o autor saem do contexto autenticado, nunca do corpo', async () => {
    const fixture = createFixture()

    await fixture.handle(
      uploadRequest({ fields: { companyId: '00000000-0000-4000-8000-00000000beef', type: 'cnh' } }),
    )

    const call = fixture.calls[0]?.input
    expect(call?.driverId).toBe(DRIVER_ID)
    expect(call?.companyId).not.toBe('00000000-0000-4000-8000-00000000beef')
    expect(call?.uploadedBy).not.toBe('00000000-0000-4000-8000-00000000beef')
    expect(call?.fileName).toBe('cnh.pdf')
  })

  test('tipo fora da lista e arquivo ausente são 400, e identificador malformado não casa rota', async () => {
    const fixture = createFixture()

    expect((await fixture.handle(uploadRequest({ fields: { type: 'crlv' } }))).status).toBe(400)
    expect((await fixture.handle(uploadRequest({ fields: {} }))).status).toBe(400)
    const withoutFile = new FormData()
    withoutFile.set('type', 'cnh')
    expect(
      (
        await fixture.handle(
          new Request(`${FRONTEND_ORIGIN}${PATH}`, {
            body: withoutFile,
            headers: { origin: FRONTEND_ORIGIN },
            method: 'POST',
          }),
        )
      ).status,
    ).toBe(400)
    expect(
      (await fixture.handle(jsonRequest({ method: 'DELETE', path: `${PATH}/nao-e-uuid` }))).status,
    ).toBe(404)
    expect(fixture.calls).toEqual([])
  })

  test('arquivo acima do teto de transporte é 413 antes de ler os bytes', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      uploadRequest({ bytes: new Uint8Array(FLEET_DRIVER_ATTACHMENT_MAX_BYTES + 1) }),
    )

    expect(response.status).toBe(413)
    expect(fixture.calls).toEqual([])
  })

  test('a recusa do arquivo vira 400 com código estável', async () => {
    const fixture = createFixture({ rejectUpload: true })

    const response = await fixture.handle(uploadRequest({}))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_ATTACHMENT_INVALID_UPLOAD')
  })

  test('remover responde 204 sem corpo', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'DELETE', path: `${PATH}/${ATTACHMENT_ID}` }),
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.calls[0]).toMatchObject({
      input: { attachmentId: ATTACHMENT_ID, driverId: DRIVER_ID },
      kind: 'remove',
    })
  })
})

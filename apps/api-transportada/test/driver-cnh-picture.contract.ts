/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295 Fase 4: o robô do worker entrega o rosto extraído da CNH do motorista. A foto da CNH só
 * entra quando a pessoa não tem foto ou a atual também veio da CNH — nunca sobrescreve `self`/`admin`.
 */
import { describe, expect, test } from 'bun:test'

import { createApplyDriverCnhPictureUseCase } from '../src/fleet/application/apply-driver-cnh-picture.use-case.js'
import { createFleetDriverCnhPictureRoutes } from '../src/fleet/presentation/fleet-driver-cnh-picture.routes.js'
import { createRequestHandler } from '../src/http/request-handler.service.js'
import { createUserPictureUseCase } from '../src/identity/application/user-picture.use-case.js'
import type { UserPictureRepositoryPort } from '../src/identity/application/user-picture.port.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  responseApiError,
} from './fixtures/freight-region-http.fixture.js'

const ATTACHMENT_ID = '00000000-0000-4000-8000-0000000000a1'
const LINKED_USER_ID = '00000000-0000-4000-8000-0000000000a2'
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
])
const SERVICE_PERMISSIONS = new Set(['driver.cnh-picture'] as const)
const NO_PERMISSIONS = new Set<never>()

type HarnessOptions = {
  /** `undefined` = anexo inexistente; `{ userId: undefined }` = motorista ainda sem usuário. */
  readonly lookup?: { readonly userId: string | undefined } | undefined
  /** Nulo = a foto atual é `self`/`admin` e a CNH não pode sobrescrever. */
  readonly saveFromCnhResult?: 'saved' | 'blocked'
  readonly permissions?: ReturnType<typeof authenticatedContext>['scope']['permissions']
}

function buildHarness(options: HarnessOptions = {}) {
  const lookups: { attachmentId: string; companyId: string }[] = []
  const cnhSaves: { companyId: string; userId: string }[] = []
  const realmCalls: unknown[] = []
  const repository = {
    async saveFromCnh(input: { companyId: string; userId: string }) {
      cnhSaves.push({ companyId: input.companyId, userId: input.userId })
      return options.saveFromCnhResult === 'blocked'
        ? null
        : {
            byteSize: 14,
            mimeType: 'image/webp',
            publicToken: 'x'.repeat(43),
            sha256: 'a'.repeat(64),
            updatedAt: new Date('2026-11-05T12:00:00.000Z'),
          }
    },
    async findIdentitySubject() {
      return 'keycloak-subject'
    },
  } as unknown as UserPictureRepositoryPort
  const userPicture = createUserPictureUseCase({
    identityGateway: {
      async setProfilePicture(input) {
        realmCalls.push(input)
      },
    },
    publicBaseUrl: 'https://api.test',
    repository,
  })
  const applyDriverCnhPicture = createApplyDriverCnhPictureUseCase({
    lookup: {
      async findDriverUser(input) {
        lookups.push(input)
        return 'lookup' in options ? options.lookup : { userId: LINKED_USER_ID }
      },
    },
    userPicture,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(options.permissions ?? SERVICE_PERMISSIONS),
      routes: createFleetDriverCnhPictureRoutes({ applyDriverCnhPicture }),
    }),
  })
  return {
    cnhSaves,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    lookups,
    realmCalls,
  }
}

function upload(
  bytes: Uint8Array = WEBP,
  path = `/fleet/driver-attachments/${ATTACHMENT_ID}/cnh-picture`,
) {
  const form = new FormData()
  form.set('file', new File([bytes], 'rosto.webp', { type: 'image/webp' }))
  return new Request(`${FRONTEND_ORIGIN}${path}`, {
    body: form,
    headers: { origin: FRONTEND_ORIGIN },
    method: 'PUT',
  })
}

describe('a foto da CNH do motorista (spec 295 fase 4)', () => {
  test('aplica a foto no usuário ligado ao anexo, com a empresa do contexto', async () => {
    const harness = buildHarness()

    const response = await harness.handle(upload())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { applied: true } })
    expect(harness.lookups).toEqual([
      { attachmentId: ATTACHMENT_ID, companyId: COMPANY_CONTEXT.companyId },
    ])
    expect(harness.cnhSaves).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, userId: LINKED_USER_ID },
    ])
    expect(harness.realmCalls).toHaveLength(1)
  })

  test('foto self ou admin já existente: não aplica, não toca o provedor e responde applied=false', async () => {
    const harness = buildHarness({ saveFromCnhResult: 'blocked' })

    const response = await harness.handle(upload())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { applied: false } })
    expect(harness.realmCalls).toHaveLength(0)
  })

  test('motorista ainda sem usuário: applied=false e nada é gravado', async () => {
    const harness = buildHarness({ lookup: { userId: undefined } })

    const response = await harness.handle(upload())

    expect(await response.json()).toEqual({ data: { applied: false } })
    expect(harness.cnhSaves).toHaveLength(0)
  })

  test('anexo inexistente, de outra empresa ou que não é CNH: 404', async () => {
    const harness = buildHarness({ lookup: undefined })

    const response = await harness.handle(upload())

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('FLEET_DRIVER_ATTACHMENT_NOT_FOUND')
    expect(harness.cnhSaves).toHaveLength(0)
  })

  test('o alvo é só o anexo: o corpo não escolhe usuário', async () => {
    const harness = buildHarness()
    const form = new FormData()
    form.set('file', new File([WEBP], 'rosto.webp', { type: 'image/webp' }))
    form.set('userId', '00000000-0000-4000-8000-0000000000ff')

    await harness.handle(
      new Request(`${FRONTEND_ORIGIN}/fleet/driver-attachments/${ATTACHMENT_ID}/cnh-picture`, {
        body: form,
        headers: { origin: FRONTEND_ORIGIN },
        method: 'PUT',
      }),
    )

    expect(harness.cnhSaves.map((save) => save.userId)).toEqual([LINKED_USER_ID])
  })

  test('arquivo que não é imagem: 400 antes de qualquer consulta', async () => {
    const harness = buildHarness()

    const response = await harness.handle(upload(new Uint8Array([0x25, 0x50, 0x44, 0x46])))

    expect(response.status).toBe(400)
    expect(harness.cnhSaves).toHaveLength(0)
  })

  test('sem a permissão do serviço: 403, nada consultado nem gravado', async () => {
    const harness = buildHarness({ permissions: NO_PERMISSIONS })

    const response = await harness.handle(upload())

    expect(response.status).toBe(403)
    expect(harness.lookups).toHaveLength(0)
    expect(harness.cnhSaves).toHaveLength(0)
  })

  test('id de anexo que não é uuid: o roteador responde 404 sem tocar na rota', async () => {
    const harness = buildHarness()

    const response = await harness.handle(upload(WEBP, '/fleet/driver-attachments/abc/cnh-picture'))

    expect(response.status).toBe(404)
    expect(harness.lookups).toHaveLength(0)
  })
})

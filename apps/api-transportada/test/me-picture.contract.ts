/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 295: a pessoa troca a **própria** foto. O alvo vem do token — a rota não tem parâmetro de id,
 * então não existe pedido capaz de apontar para outra pessoa.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../src/http/request-handler.service.js'
import { createUserPictureUseCase } from '../src/identity/application/user-picture.use-case.js'
import type { UserPictureRepositoryPort } from '../src/identity/application/user-picture.port.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  COMPANY_CONTEXT,
  createTestRouter,
  FRONTEND_ORIGIN,
  responseApiError,
} from './fixtures/freight-region-http.fixture.js'

const ROUTES_MODULE_PATH = '../src/identity/presentation/me-picture.routes.js'
const PICTURE_PATH = '/me/picture'
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000e9'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
/** Sem nenhuma permissão: só a membership ativa autoriza, como em `/me/whatsapp-phone`. */
const NO_PERMISSIONS = new Set<never>()

type StoredPicture = { readonly companyId: string; readonly userId: string }

async function buildHarness() {
  const saved: StoredPicture[] = []
  const removed: StoredPicture[] = []
  const found: StoredPicture[] = []
  const repository = {
    async find(input: StoredPicture) {
      found.push(input)
      return saved.length === 0
        ? null
        : {
            bytes: Buffer.from(PNG),
            mimeType: 'image/png' as const,
            publicToken: null,
            sha256: 'a'.repeat(64),
          }
    },
    async findByPublicToken() {
      return null
    },
    async findIdentitySubject() {
      return undefined
    },
    async remove(input: StoredPicture) {
      removed.push(input)
      return saved.length > 0
    },
    async save(
      input: StoredPicture & {
        readonly byteSize: number
        readonly mimeType: string
        readonly sha256: string
      },
    ) {
      saved.push({ companyId: input.companyId, userId: input.userId })
      return {
        byteSize: input.byteSize,
        mimeType: input.mimeType,
        publicToken: null,
        sha256: input.sha256,
        updatedAt: new Date('2026-11-05T12:00:00.000Z'),
      }
    },
  } as unknown as UserPictureRepositoryPort
  const module = (await import(ROUTES_MODULE_PATH)) as {
    createMePictureRoutes(dependencies: { readonly userPicture: unknown }): never
  }
  const routes = module.createMePictureRoutes({
    userPicture: createUserPictureUseCase({
      identityGateway: { async setProfilePicture() {} },
      repository,
    }),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({ context: authenticatedContext(NO_PERMISSIONS), routes }),
  })
  return {
    found,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    removed,
    saved,
  }
}

function upload(input: {
  readonly bytes: Uint8Array
  readonly extra?: Record<string, string>
  readonly path?: string
}) {
  const form = new FormData()
  form.set('file', new File([input.bytes], 'foto.png', { type: 'image/png' }))
  for (const [key, value] of Object.entries(input.extra ?? {})) form.set(key, value)
  return new Request(`${FRONTEND_ORIGIN}${input.path ?? PICTURE_PATH}`, {
    body: form,
    headers: { origin: FRONTEND_ORIGIN },
    method: 'PUT',
  })
}

describe('a própria foto de perfil (spec 295)', () => {
  test('PUT grava a foto da pessoa do token, com a membership ativa e sem permissão', async () => {
    const harness = await buildHarness()

    const response = await harness.handle(upload({ bytes: PNG }))

    expect(response.status).toBe(200)
    expect(harness.saved).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, userId: COMPANY_CONTEXT.userId },
    ])
  })

  test('campo de usuário no corpo é ignorado: ninguém aponta a foto de outra pessoa', async () => {
    const harness = await buildHarness()

    await harness.handle(upload({ bytes: PNG, extra: { userId: OTHER_USER_ID } }))

    expect(harness.saved.map((entry) => entry.userId)).toEqual([COMPANY_CONTEXT.userId])
  })

  test('a rota não aceita id no caminho', async () => {
    const harness = await buildHarness()

    const response = await harness.handle(
      upload({ bytes: PNG, path: `${PICTURE_PATH}/${OTHER_USER_ID}` }),
    )

    expect(response.status).toBe(404)
    expect(harness.saved).toHaveLength(0)
  })

  test('arquivo que não é imagem e arquivo vazio são recusados com código estável', async () => {
    const harness = await buildHarness()

    const notImage = await harness.handle(
      upload({ bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }),
    )
    const empty = await harness.handle(upload({ bytes: new Uint8Array() }))

    expect(notImage.status).toBe(400)
    expect((await responseApiError(notImage)).code).toBe('USER_PICTURE_UNSUPPORTED_FORMAT')
    expect(empty.status).toBe(400)
    expect(harness.saved).toHaveLength(0)
  })

  test('arquivo acima de 256 KiB é recusado antes de gravar', async () => {
    const harness = await buildHarness()
    const huge = new Uint8Array(262_145)
    huge.set(PNG)

    const response = await harness.handle(upload({ bytes: huge }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('USER_PICTURE_TOO_LARGE')
    expect(harness.saved).toHaveLength(0)
  })

  test('corpo que não é multipart é 400', async () => {
    const harness = await buildHarness()

    const response = await harness.handle(
      new Request(`${FRONTEND_ORIGIN}${PICTURE_PATH}`, {
        body: '{}',
        headers: { 'content-type': 'application/json', origin: FRONTEND_ORIGIN },
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(400)
  })

  test('GET devolve os bytes da própria foto sem cache, e 404 quando não há', async () => {
    const harness = await buildHarness()
    const request = () =>
      new Request(`${FRONTEND_ORIGIN}${PICTURE_PATH}`, { headers: { origin: FRONTEND_ORIGIN } })

    expect((await harness.handle(request())).status).toBe(404)
    await harness.handle(upload({ bytes: PNG }))
    const response = await harness.handle(request())

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(harness.found.every((entry) => entry.userId === COMPANY_CONTEXT.userId)).toBe(true)
  })

  test('DELETE remove a própria foto e responde 204', async () => {
    const harness = await buildHarness()
    await harness.handle(upload({ bytes: PNG }))

    const response = await harness.handle(
      new Request(`${FRONTEND_ORIGIN}${PICTURE_PATH}`, {
        headers: { origin: FRONTEND_ORIGIN },
        method: 'DELETE',
      }),
    )

    expect(response.status).toBe(204)
    expect(harness.removed).toEqual([
      { companyId: COMPANY_CONTEXT.companyId, userId: COMPANY_CONTEXT.userId },
    ])
  })
})

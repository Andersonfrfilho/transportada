/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { AggregateApplicationAttachmentDraft } from '../../src/fleet/application/aggregate-application-attachment.port.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { createAggregateApplicationAttachmentPublicRoutes } from '../../src/fleet/presentation/aggregate-application-attachment.routes.js'
import { PUBLIC_ATTACHMENT_MAX_BYTES } from '../../src/fleet/presentation/aggregate-application-attachment.schema.js'
import { API_PUBLIC_AGGREGATE_APPLICATION_ATTACHMENTS_PATH } from '../../src/shared/api.constant.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { healthService } from '../fixtures/digital-certificates-http-auth.fixture.js'

function neverCalled(what: string): never {
  throw new Error(`${what} não deve ser chamado numa rota anônima`)
}

const COMPANY_ID = crypto.randomUUID()
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

function buildRouter(
  overrides: Readonly<{
    turnstileSecretKey?: string
    uploadDraft?: (input: unknown) => Promise<AggregateApplicationAttachmentDraft>
    verifyTurnstileToken?: () => Promise<boolean>
  }> = {},
) {
  const calls: unknown[] = []
  const router = createRouter({
    anonymousRoutes: createAggregateApplicationAttachmentPublicRoutes({
      attachments: {
        uploadDraft: async (input) => {
          calls.push(input)
          return overrides.uploadDraft === undefined
            ? { draftId: crypto.randomUUID(), type: 'ccmei' }
            : overrides.uploadDraft(input)
        },
      },
      ...(overrides.turnstileSecretKey === undefined
        ? {}
        : { turnstileSecretKey: overrides.turnstileSecretKey }),
      ...(overrides.verifyTurnstileToken === undefined
        ? {}
        : { verifyTurnstileToken: overrides.verifyTurnstileToken }),
    }),
    // Rota anônima não autentica nem resolve empresa. Se chamar, o teste quebra em voz alta —
    // devolver `null` esconderia exatamente o defeito que importa aqui.
    authentication: { authenticate: async () => neverCalled('authenticate') },
    authorization: { authorize() {} },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: healthService(),
    routes: [],
    tenantContext: { resolveCompany: async () => neverCalled('resolveCompany') },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => '00000000-0000-4000-8000-000000000000',
    frontendOrigins: ['http://localhost:53003'],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return { calls, router: { handle: (request: Request) => handle(request, { timeout() {} }) } }
}

function buildRequest(
  fields: Readonly<{ bytes?: Uint8Array; companyId?: string; token?: string; type?: string }> = {},
): Request {
  const form = new FormData()
  form.set('companyId', fields.companyId ?? COMPANY_ID)
  form.set('type', fields.type ?? 'ccmei')
  form.set('turnstileToken', fields.token ?? 'token')
  form.set(
    'file',
    new Blob([fields.bytes ?? PDF_BYTES], { type: 'application/pdf' }),
    'documento.pdf',
  )
  return new Request(`http://localhost${API_PUBLIC_AGGREGATE_APPLICATION_ATTACHMENTS_PATH}`, {
    body: form,
    method: 'POST',
  })
}

describe('rota pública de anexo de candidatura', () => {
  test('aceita o arquivo e devolve só o identificador do rascunho', async () => {
    const { router } = buildRouter()

    const response = await router.handle(buildRequest())

    expect(response.status).toBe(201)
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(Object.keys(body.data).sort()).toEqual(['draftId', 'type'])
  })

  /**
   * Turnstile reprovado é `403` e **nada é gravado**: a verificação vem antes do caso de uso, senão
   * o bot já teria consumido bucket antes de ser recusado.
   */
  test('sem passar no desafio anti-bot, nada é enviado ao caso de uso', async () => {
    const { calls, router } = buildRouter({
      turnstileSecretKey: 'segredo',
      verifyTurnstileToken: async () => false,
    })

    const response = await router.handle(buildRequest())

    expect(response.status).toBe(403)
    expect(calls).toEqual([])
  })

  /** O teto é do transporte, e a recusa diz isso — corpo truncado em silêncio seria pior. */
  test('arquivo acima do teto é recusado com 413', async () => {
    const { calls, router } = buildRouter()
    const tooLarge = new Uint8Array(PUBLIC_ATTACHMENT_MAX_BYTES + 1)
    tooLarge.set(PDF_BYTES)

    const response = await router.handle(buildRequest({ bytes: tooLarge }))

    expect(response.status).toBe(413)
    expect(calls).toEqual([])
  })

  test('tipo fora da lista é recusado', async () => {
    const { calls, router } = buildRouter()

    const response = await router.handle(buildRequest({ type: 'passaporte' }))

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  test('empresa que não é UUID é recusada', async () => {
    const { calls, router } = buildRouter()

    const response = await router.handle(buildRequest({ companyId: 'a-empresa' }))

    expect(response.status).toBe(400)
    expect(calls).toEqual([])
  })

  /** O limite é mais duro que o do formulário: upload custa bucket, e o formulário custa uma linha. */
  test('o limite de taxa é mais duro que o do envio da candidatura', async () => {
    const { createAggregateApplicationAttachmentPublicRoutes: create } = await import(
      '../../src/fleet/presentation/aggregate-application-attachment.routes.js'
    )
    const [route] = create({
      attachments: { uploadDraft: async () => ({ draftId: 'x', type: 'ccmei' as const }) },
    })

    const perMinute =
      (route?.rateLimit?.maxRequests ?? 0) / ((route?.rateLimit?.windowMs ?? 1) / 60_000)
    const submitPerMinute = 5 / 10

    expect(perMinute).toBeLessThan(submitPerMinute)
  })
})

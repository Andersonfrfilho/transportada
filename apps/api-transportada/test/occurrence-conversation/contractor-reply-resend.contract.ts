/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF6: "Reenviar o pedido à contratante". A decisão pura (só enquanto espera a contratante, uma vez
 * por intervalo do alarme), o texto que sai (a frase fixa e o pedido original), a rota (`occurrences.resolve`,
 * `Idempotency-Key`, 202, 409 com código estável) e a leitura que diz ao painel se o botão vale agora.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createReadContractorReplyUseCase } from '../../src/occurrence-conversation/application/contractor-reply-read.use-case.js'
import {
  createResendContractorReplyRequestUseCase,
  type ContractorReplyResendContext,
} from '../../src/occurrence-conversation/application/resend-contractor-reply-request.use-case.js'
import type { SendOccurrenceMailInput } from '../../src/occurrence-conversation/application/send-occurrence-mail.use-case.js'
import {
  buildResendBodyText,
  CONTRACTOR_REPLY_RESEND_LEAD_TEXT,
  decideResend,
} from '../../src/occurrence-conversation/domain/contractor-reply-resend.policy.js'
import {
  ContractorReplyNotResendableError,
  ContractorReplyResendTooSoonError,
} from '../../src/occurrence-conversation/domain/occurrence-conversation.error.js'
import { createOccurrenceContractorReplyRoutes } from '../../src/occurrence-conversation/presentation/occurrence-contractor-reply.routes.js'
import { CONTRACTOR_REPLY_STATUSES } from '../../src/shared/occurrence-contractor-reply.constant.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  CORRELATION_ID,
  FRONTEND_ORIGIN,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const OCCURRENCE_ID = '00000000-0000-4000-8000-000000248601'
const NOW = new Date('2026-10-13T12:00:00.000Z')
const INTERVAL_MINUTES = 60
const MINUTE = 60_000

const CONTEXT: ContractorReplyResendContext = {
  contactIds: ['contact-1'],
  original: {
    bodyText: 'Favor prorrogar o boleto da NF 717795.',
    subject: 'Prorrogação do boleto — NF 717795',
    toAddresses: ['compras@alfa.example.test'],
  },
}

describe('quando o pedido pode ser reenviado (spec 248 RF6)', () => {
  const base = { alertIntervalMinutes: INTERVAL_MINUTES, lastResendAt: null, now: NOW }

  test('só enquanto espera a contratante: aguardando e atrasada', () => {
    const allowed = CONTRACTOR_REPLY_STATUSES.filter(
      (status) => decideResend({ ...base, status }).kind === 'allowed',
    )
    expect(allowed).toEqual(['awaiting_contractor', 'overdue'])
  })

  test('os outros seis estados recusam com o motivo "não espera mais"', () => {
    for (const status of CONTRACTOR_REPLY_STATUSES) {
      if (status === 'awaiting_contractor' || status === 'overdue') continue
      expect(decideResend({ ...base, status })).toEqual({
        availableAt: null,
        kind: 'blocked',
        reason: 'not_waiting',
      })
    }
  })

  test('no máximo uma vez por intervalo: um minuto antes recusa e diz quando abre, no intervalo cheio libera', () => {
    const lastResendAt = new Date(NOW.getTime() - (INTERVAL_MINUTES - 1) * MINUTE)
    expect(decideResend({ ...base, lastResendAt, status: 'overdue' })).toEqual({
      availableAt: new Date(NOW.getTime() + MINUTE),
      kind: 'blocked',
      reason: 'too_soon',
    })
    expect(
      decideResend({
        ...base,
        lastResendAt: new Date(NOW.getTime() - INTERVAL_MINUTES * MINUTE),
        status: 'overdue',
      }),
    ).toEqual({ kind: 'allowed' })
  })

  test('o estado vence o intervalo: retorno tratado nunca vira "cedo demais"', () => {
    expect(decideResend({ ...base, lastResendAt: NOW, status: 'handled' })).toMatchObject({
      reason: 'not_waiting',
    })
  })

  test('o corpo é a frase fixa, uma linha em branco e o pedido original', () => {
    expect(CONTRACTOR_REPLY_RESEND_LEAD_TEXT).toBe('Reenvio do pedido abaixo.')
    expect(buildResendBodyText('  Favor prorrogar.  ')).toBe(
      'Reenvio do pedido abaixo.\n\nFavor prorrogar.',
    )
  })
})

describe('o caso de uso do reenvio (spec 248 RF6)', () => {
  function build(context: ContractorReplyResendContext | null) {
    const sent: SendOccurrenceMailInput[] = []
    const useCase = createResendContractorReplyRequestUseCase({
      reader: { findContext: async () => context },
      sendMail: {
        send: async (input) => {
          sent.push(input)
          return {
            conversationId: 'conversation-1',
            conversationMessageId: 'message-1',
            mailMessageId: 'mail-1',
            recipientCount: 1,
            threadId: 'thread-1',
          }
        },
      },
    })
    return { sent, useCase }
  }

  const request = {
    actorUserId: COMPANY_CONTEXT.userId,
    companyId: COMPANY_CONTEXT.companyId,
    correlationId: 'correlation-1',
    idempotencyKey: 'resend-key-000001',
    occurrenceId: OCCURRENCE_ID,
  }

  test('manda pelo envio de e-mail da conversa: assunto original, frase fixa, os contatos do pedido e o marcador de reenvio', async () => {
    const { sent, useCase } = build(CONTEXT)

    const result = await useCase.resend(request)

    expect(result).toEqual({
      conversationId: 'conversation-1',
      conversationMessageId: 'message-1',
      recipientCount: 1,
    })
    expect(sent).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        bodyText: 'Reenvio do pedido abaixo.\n\nFavor prorrogar o boleto da NF 717795.',
        companyId: COMPANY_CONTEXT.companyId,
        contactIds: ['contact-1'],
        contractorReplyResend: true,
        correlationId: 'correlation-1',
        idempotencyKey: 'resend-key-000001',
        occurrenceId: OCCURRENCE_ID,
        subject: 'Prorrogação do boleto — NF 717795',
      },
    ])
  })

  /** Spec 267 RF5: a cópia é recalculada no reenvio, nunca copiada da mensagem original. */
  test('não leva excludedWatcherUserIds: o envio recalcula a lista efetiva', async () => {
    const { sent, useCase } = build(CONTEXT)

    await useCase.resend(request)

    expect('excludedWatcherUserIds' in (sent[0] ?? {})).toBe(false)
  })

  test('sem retorno é 409 do reenvio; sem o pedido original na conversa é 409 com código próprio; nada é enviado', async () => {
    const withoutReply = build(null)
    expect(
      await withoutReply.useCase.resend(request).catch((error: unknown) => error),
    ).toBeInstanceOf(ContractorReplyNotResendableError)

    const withoutOriginal = build({ contactIds: [], original: null })
    expect(
      await withoutOriginal.useCase.resend(request).catch((error: unknown) => error),
    ).toMatchObject({ code: 'CONTRACTOR_REPLY_ORIGINAL_REQUEST_MISSING', status: 409 })

    expect(withoutReply.sent).toEqual([])
    expect(withoutOriginal.sent).toEqual([])
  })
})

describe('POST /trip-occurrences/:id/contractor-reply/resend-request (spec 248 RF6)', () => {
  const PATH = `/trip-occurrences/${OCCURRENCE_ID}/contractor-reply/resend-request`

  function build(options: {
    readonly error?: Error
    readonly permissions?: CompanyContext['permissions']
  }) {
    const calls: unknown[] = []
    const context: AuthenticatedContext<CompanyContext> = {
      identity: {
        companyIdClaim: COMPANY_CONTEXT.companyId,
        externalIdentityId: crypto.randomUUID(),
        issuer: 'http://localhost:58080/realms/transportada-local',
        platformAdmin: false,
        serviceAccount: false,
        subject: 'contractor-reply-resend-contract',
        userId: COMPANY_CONTEXT.userId,
      },
      scope: {
        ...COMPANY_CONTEXT,
        permissions: options.permissions ?? new Set(['fleet.read', 'occurrences.resolve'] as const),
      },
    }
    const authorization = new AuthorizationService()
    const router = createRouter({
      authentication: { authenticate: async () => context.identity },
      authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
      companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
      healthService: new HealthService({
        database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
        identityReadiness: { checkReadiness: async () => true },
        migrationStatus: appliedMigrations(),
      }),
      rateLimitWindows: { consume: async () => ({ allowed: true }) },
      routes: createOccurrenceContractorReplyRoutes({
        deliverToDriver: { deliver: async () => ({ kind: 'already_delivered' }) },
        emailOptions: { read: async () => null },
        forwardByEmail: { forward: async () => ({}) as never },
        markHandled: { markHandled: async () => ({ kind: 'handled' }) },
        readReply: createReadContractorReplyUseCase({
          reader: { findByOccurrence: async () => null },
        }),
        resendRequest: {
          resend: async (input) => {
            calls.push(input)
            if (options.error !== undefined) throw options.error
            return { conversationId: 'c', conversationMessageId: 'm', recipientCount: 2 }
          },
        },
      }),
      tenantContext: { resolveCompany: async () => context },
      userPictureExistence: stubUserPictureExistence(),
    })
    const handleRequest = createRequestHandler({
      createCorrelationId: () => 'resend-correlation',
      frontendOrigins: [FRONTEND_ORIGIN],
      logger: { error() {}, info() {}, warn() {} },
      requestTimeoutSeconds: 10,
      router,
    })
    return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
  }

  function post(
    headers: Record<string, string> = { 'idempotency-key': 'resend-key-000001' },
    body?: unknown,
  ): Request {
    return new Request(`${FRONTEND_ORIGIN}${PATH}`, {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: {
        origin: FRONTEND_ORIGIN,
        'x-correlation-id': CORRELATION_ID,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      method: 'POST',
    })
  }

  test('com occurrences.resolve responde 202 com a empresa, o autor e a chave do contexto', async () => {
    const fixture = build({})
    const response = await fixture.handle(post())

    expect(response.status).toBe(202)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await response.json()).toEqual({
      data: { conversationId: 'c', conversationMessageId: 'm', recipientCount: 2 },
    })
    expect(fixture.calls).toEqual([
      {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        idempotencyKey: 'resend-key-000001',
        occurrenceId: OCCURRENCE_ID,
      },
    ])
  })

  test('sem Idempotency-Key, ou com ela fora do formato, é 400 e nada é enviado', async () => {
    for (const headers of [
      {},
      { 'idempotency-key': '' },
      { 'idempotency-key': 'curta' },
      { 'idempotency-key': 'chave com espaco 0001' },
    ]) {
      const fixture = build({})
      expect((await fixture.handle(post(headers))).status).toBe(400)
      expect(fixture.calls).toEqual([])
    }
  })

  test('só com fleet.read é 403: reenviar é do papel que resolve a ocorrência', async () => {
    const fixture = build({ permissions: new Set(['fleet.read'] as const) })
    expect((await fixture.handle(post())).status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('o retorno que não espera mais e o reenvio cedo demais são 409 com código estável', async () => {
    const notWaiting = build({ error: new ContractorReplyNotResendableError() })
    const first = await notWaiting.handle(post())
    expect(first.status).toBe(409)
    expect((await responseApiError(first)).code).toBe('CONTRACTOR_REPLY_NOT_RESENDABLE')

    const tooSoon = build({ error: new ContractorReplyResendTooSoonError() })
    const second = await tooSoon.handle(post())
    expect(second.status).toBe(409)
    expect((await responseApiError(second)).code).toBe('CONTRACTOR_REPLY_RESEND_TOO_SOON')
  })

  test('o corpo não é lido: a empresa, o autor e o pedido nunca vêm do cliente', async () => {
    const fixture = build({})
    const response = await fixture.handle(
      post(
        { 'idempotency-key': 'resend-key-000002' },
        { companyId: crypto.randomUUID(), subject: 'trocado' },
      ),
    )
    expect(response.status).toBe(202)
    expect(fixture.calls).toEqual([
      expect.objectContaining({ companyId: COMPANY_CONTEXT.companyId }),
    ])
  })
})

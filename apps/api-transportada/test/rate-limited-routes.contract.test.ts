/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { createAddressCorrectionRoutes } from '../src/address-correction/presentation/address-correction.routes'
import { createContractorMailSettingsRoutes } from '../src/contractor-mail/presentation/contractor-mail-settings.routes'
import { createClientOccurrenceConversationRoutes } from '../src/occurrence-conversation/presentation/client-occurrence-conversation.routes'
import { createMeOccurrenceConversationRoutes } from '../src/occurrence-conversation/presentation/me-occurrence-conversation.routes'
import { createOccurrenceConversationRoutes } from '../src/occurrence-conversation/presentation/occurrence-conversation.routes'
import { createContractorOccurrenceRoutes } from '../src/contractor-portal/presentation/contractor-occurrence.routes'
import { createLoginHintRoutes } from '../src/identity/presentation/login-hint.routes'
import { createPasswordResetRoutes } from '../src/identity/presentation/password-reset.routes'
import { createUserActivationRoutes } from '../src/identity/presentation/user-activation.routes'
import { createMeLocationRoutes } from '../src/trips/presentation/me-location.routes'
import { createMeProofReceiverRoutes } from '../src/trips/presentation/me-proof-receiver.routes'
import { createOccurrenceCaseRoutes } from '../src/trips/presentation/occurrence-case.routes'
import { createTripFieldOfficeOccurrenceRoutes } from '../src/trips/presentation/trip-field-office-occurrence.routes'
import { createTripFieldOfficeRoutes } from '../src/trips/presentation/trip-field-office.routes'
import { createTripRoutes } from '../src/trips/presentation/trip.routes'

const MAIL_RATE_LIMIT = { maxRequests: 7, windowSeconds: 900 } as const
const SOURCE_DIRECTORY = new URL('../src/', import.meta.url).pathname

/** A rota é montada com dependência falsa só para ler o teto dela — nenhum caso de uso roda aqui. */
function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

async function listSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.routes.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
}

/**
 * RF18: toda rota que dispara e-mail conta no Postgres, com o mesmo balde. A lista é por extenso de
 * propósito — rota nova que manda e-mail sem entrar aqui é a porta que o M1 do `SECURITY.md` fechou.
 */
describe('rotas com teto no Postgres (spec 150 T406)', () => {
  test('o envio de correção e o e-mail de teste dividem o escopo contractor-mail', () => {
    const unused = unusedDependencies() as never
    const routes = [
      ...createAddressCorrectionRoutes({
        findRecipients: unused,
        listRequests: unused,
        mailRateLimit: MAIL_RATE_LIMIT,
        saveDraft: unused,
        sendMail: unused,
      }),
      ...createContractorMailSettingsRoutes({
        mailRateLimit: MAIL_RATE_LIMIT,
        read: unused,
        runChecks: unused,
        save: unused,
        sendTestEmail: unused,
      }),
    ]

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    expect(limited).toEqual([
      {
        rateLimit: {
          maxRequests: 7,
          scope: 'contractor-mail',
          store: 'postgres',
          windowSeconds: 900,
        },
        signature: 'POST /address-correction-requests/mail',
      },
      {
        rateLimit: {
          maxRequests: 7,
          scope: 'contractor-mail',
          store: 'postgres',
          windowSeconds: 900,
        },
        signature: 'POST /contractor-mail-settings/test-email',
      },
    ])
  })

  /**
   * Spec 156 T15 (seg M2): as escritas do escritório em nome do motorista. O lote de ocorrências é o
   * mais duro (N notas e N avisos por chamada); a baixa de nota aguenta o maço de canhotos com
   * concorrência 3; as ações de viagem e parada ficam no meio.
   */
  test('as escritas do escritório contam no Postgres, cada grupo no seu balde', () => {
    const unused = unusedDependencies() as never
    const routes = [
      ...createTripFieldOfficeRoutes(unused),
      ...createTripFieldOfficeOccurrenceRoutes(unused),
    ]

    const limited = Object.fromEntries(
      routes
        .filter((route) => route.method === 'POST')
        .map((route) => [`${route.method} ${route.pathname}`, route.rateLimit]),
    )

    const trip = {
      maxRequests: 120,
      scope: 'trip-field-office-trip',
      store: 'postgres',
      windowSeconds: 300,
    } as const
    const documents = {
      maxRequests: 300,
      scope: 'trip-field-office-documents',
      store: 'postgres',
      windowSeconds: 300,
    } as const
    expect(limited).toEqual({
      'POST /trips/:id/confirm-load': trip,
      'POST /trips/:id/documents/:documentId/field-delivery': documents,
      'POST /trips/:id/documents/:documentId/field-proof': documents,
      'POST /trips/:id/documents/:documentId/field-return': documents,
      'POST /trips/:id/documents/field-occurrences': {
        maxRequests: 30,
        scope: 'trip-field-office-occurrences',
        store: 'postgres',
        windowSeconds: 300,
      },
      'POST /trips/:id/start-route': trip,
      'POST /trips/:id/stops/:stopId/arrive': trip,
      'POST /trips/:id/stops/:stopId/occurrences': trip,
    })
  })

  /**
   * Spec 161 T6/T7 (RF5/RF6): o registro da ocorrência de galpão e o anexo adicional viram
   * multipart, com a mesma escrita mais cara e mais rara que o lote do escritório — uma foto por
   * ocorrência, e a segunda em diante é ainda mais comum que o registro em si.
   */
  test('o registro e o anexo da ocorrência de galpão têm balde próprio', () => {
    const unused = unusedDependencies() as never
    const routes = createTripRoutes(unused)

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    expect(limited).toEqual([
      {
        rateLimit: {
          maxRequests: 60,
          scope: 'trip-separation-occurrence',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /trips/:id/documents/:documentId/occurrences',
      },
      {
        rateLimit: {
          maxRequests: 300,
          scope: 'trip-occurrence-attachment',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /trips/:id/documents/:documentId/occurrences/:occurrenceId/attachments',
      },
    ])
  })

  /** Spec 164 T7 (achado 1 da revisão: decisão em nome do contratante): as seis ações internas da
   * tratativa dividem um balde só. */
  test('as seis ações internas da tratativa dividem o balde trip-occurrence-case', () => {
    const unused = unusedDependencies() as never
    const routes = createOccurrenceCaseRoutes(unused)

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    const rateLimit = {
      maxRequests: 120,
      scope: 'trip-occurrence-case',
      store: 'postgres',
      windowSeconds: 300,
    } as const
    expect(limited).toEqual([
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/review' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/warehouse-return' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/contractor-submission' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/closure' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/cancel' },
      { rateLimit, signature: 'POST /trip-occurrences/:id/case/decision' },
    ])
  })

  /**
   * Revisão de segurança da spec 164: nenhuma rota do portal declarava teto antes desta spec —
   * são as primeiras. `GET` amplifica (até 50 ocorrências por chamada, cada uma com leitura de
   * anexo e assinatura de URL); `POST .../decision` é mais apertado porque decidir é raro e escreve
   * estado.
   */
  test('as duas rotas do portal de ocorrência têm balde próprio, cada uma no seu', () => {
    const unused = unusedDependencies() as never
    const routes = createContractorOccurrenceRoutes(unused)

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    expect(limited).toEqual([
      {
        rateLimit: {
          maxRequests: 60,
          scope: 'contractor-occurrence-list',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'GET /client/me/occurrences',
      },
      {
        rateLimit: {
          maxRequests: 20,
          scope: 'contractor-occurrence-decision',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /client/me/occurrences/:id/decision',
      },
    ])
  })

  /**
   * Spec 183 T404: a mensagem da conversa dispara e-mail (RF18 da 150), então conta no Postgres —
   * num balde próprio, porque a conversa manda mais que o e-mail de correção e dividir o balde
   * travaria um pelo outro.
   */
  test('a mensagem da conversa da ocorrência conta no Postgres, no balde dela', () => {
    const routes = createOccurrenceConversationRoutes(unusedDependencies() as never)

    expect(
      routes
        .filter((route) => route.rateLimit !== undefined)
        .map((route) => ({
          rateLimit: route.rateLimit,
          signature: `${route.method} ${route.pathname}`,
        })),
    ).toEqual([
      {
        rateLimit: {
          maxRequests: 30,
          scope: 'occurrence-conversation',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /trip-occurrences/:id/conversations/:participant/messages',
      },
      /** Spec 183 T702a: o pedido de upload do anexo, num balde próprio. */
      {
        rateLimit: {
          maxRequests: 60,
          scope: 'occurrence-conversation-upload',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /trip-occurrences/:id/conversations/:participant/uploads',
      },
    ])
  })

  /**
   * Spec 183 T702a: o motorista pede upload num balde próprio. T903 (achado S3): responder também —
   * cada resposta pode ler até 5 × 25 MB do bucket numa transação; ler segue sem teto.
   */
  test('o pedido de upload e a resposta do motorista contam no Postgres', () => {
    const routes = createMeOccurrenceConversationRoutes(unusedDependencies() as never)

    expect(
      routes
        .filter((route) => route.rateLimit !== undefined)
        .map((route) => ({
          rateLimit: route.rateLimit,
          signature: `${route.method} ${route.pathname}`,
        })),
    ).toEqual([
      {
        rateLimit: {
          maxRequests: 60,
          scope: 'driver-occurrence-conversation-upload',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /me/trips/current/occurrences/:id/uploads',
      },
      {
        rateLimit: {
          maxRequests: 30,
          scope: 'driver-occurrence-conversation-send',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /me/trips/current/occurrences/:id/messages',
      },
    ])
  })

  /**
   * Spec 183 T651: a conversa da contratante no portal. Ler e marcar como lida dividem um balde (são
   * frequentes e não gravam mensagem); escrever tem o seu, mais apertado.
   */
  test('a conversa do portal conta no Postgres, leitura e envio em baldes próprios', () => {
    const routes = createClientOccurrenceConversationRoutes(unusedDependencies() as never)
    const read = {
      maxRequests: 120,
      scope: 'contractor-occurrence-conversation-read',
      store: 'postgres',
      windowSeconds: 300,
    } as const

    expect(
      routes.map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      })),
    ).toEqual([
      { rateLimit: read, signature: 'GET /client/me/occurrence-conversations/:ref' },
      {
        rateLimit: {
          maxRequests: 30,
          scope: 'contractor-occurrence-conversation-send',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /client/me/occurrence-conversations/:ref/messages',
      },
      { rateLimit: read, signature: 'POST /client/me/occurrence-conversations/:ref/read' },
      {
        rateLimit: {
          maxRequests: 60,
          scope: 'contractor-occurrence-conversation-upload',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /client/me/occurrence-conversations/:ref/uploads',
      },
    ])
  })

  /**
   * Segurança M3 (spec 189 T9.2): as três rotas do rastro ao vivo não tinham teto — o `POST` é
   * chamado por um relógio no celular, e sem balde nada impede uma cópia maliciosa do app de
   * martelar o endpoint. O `POST` fica mais apertado que o `GET`/`PUT` porque escreve a cada
   * chamada, mesmo com o dedup da T9.2 já filtrando o replay de rede.
   */
  test('as três rotas do rastro ao vivo têm teto no Postgres, cada uma no seu balde', () => {
    const unused = unusedDependencies() as never
    const routes = createMeLocationRoutes(unused)

    const limited = routes
      .filter((route) => route.rateLimit !== undefined)
      .map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      }))

    expect(limited).toEqual([
      {
        rateLimit: {
          maxRequests: 30,
          scope: 'me-location-consent-read',
          store: 'postgres',
          windowSeconds: 60,
        },
        signature: 'GET /me/location-consent',
      },
      {
        rateLimit: {
          maxRequests: 10,
          scope: 'me-location-consent-write',
          store: 'postgres',
          windowSeconds: 60,
        },
        signature: 'PUT /me/location-consent',
      },
      {
        rateLimit: {
          maxRequests: 3,
          scope: 'me-location-report',
          store: 'postgres',
          windowSeconds: 60,
        },
        signature: 'POST /me/trips/current/location',
      },
    ])
  })

  /**
   * Spec 193 D7: o `PATCH` de quem recebeu é drenado pela fila do aparelho — um balde por motorista
   * impede que uma cópia do app martele a escrita no comprovante.
   */
  test('o PATCH de quem recebeu tem teto no Postgres', () => {
    const routes = createMeProofReceiverRoutes(unusedDependencies() as never)

    expect(
      routes.map((route) => ({
        rateLimit: route.rateLimit,
        signature: `${route.method} ${route.pathname}`,
      })),
    ).toEqual([
      {
        rateLimit: {
          maxRequests: 60,
          scope: 'me-proof-receiver',
          store: 'postgres',
          windowSeconds: 60,
        },
        signature: 'PATCH /me/trips/current/documents/:documentId/proof/receiver',
      },
    ])
  })

  test('nenhum outro arquivo da API declara teto no Postgres', async () => {
    const files = await listSourceFiles(SOURCE_DIRECTORY)
    const declaring: string[] = []
    for (const file of files) {
      const source = await readFile(file, 'utf8')
      if (source.includes("store: 'postgres'")) declaring.push(file.slice(SOURCE_DIRECTORY.length))
    }

    expect(declaring.sort()).toEqual([
      'address-correction/presentation/address-correction.routes.ts',
      'contractor-mail/presentation/contractor-mail-settings.routes.ts',
      'contractor-portal/presentation/contractor-occurrence.routes.ts',
      'identity/presentation/login-hint.routes.ts',
      'identity/presentation/password-reset.routes.ts',
      'identity/presentation/user-activation.routes.ts',
      'occurrence-conversation/presentation/client-occurrence-conversation.routes.ts',
      'occurrence-conversation/presentation/me-occurrence-conversation.routes.ts',
      'occurrence-conversation/presentation/occurrence-conversation.routes.ts',
      'trips/presentation/me-location.routes.ts',
      'trips/presentation/me-proof-receiver.routes.ts',
      'trips/presentation/occurrence-case.routes.ts',
      'trips/presentation/occurrence-settlement.routes.ts',
      'trips/presentation/redelivery-application.routes.ts',
      'trips/presentation/redelivery-proposal.routes.ts',
      'trips/presentation/trip-field-office-document.routes.ts',
      'trips/presentation/trip-field-office-occurrence.routes.ts',
      'trips/presentation/trip-field-office-trip.routes.ts',
      'trips/presentation/trip.routes.ts',
    ])
  })
})

/**
 * Spec 191 RF12, ADR-0076 §3: as rotas anônimas de identidade contam por IP no Postgres, em dois
 * estágios. Escopo e store são literais da rota; teto e janela vêm do ambiente, e os números
 * distintos abaixo provam que cada rota lê o seu.
 */
describe('rotas anônimas de identidade com teto no Postgres (spec 191 T1.3)', () => {
  function limitedAnonymous(
    routes: readonly {
      readonly method: string
      readonly pathname: string
      readonly rateLimit?: unknown
    }[],
  ) {
    return routes.map((route) => ({
      rateLimit: route.rateLimit,
      signature: `${route.method} ${route.pathname}`,
    }))
  }

  function passwordResetRoutes() {
    const unused = unusedDependencies() as never
    return createPasswordResetRoutes({
      confirmPasswordReset: unused,
      rateLimits: {
        confirmIp: { maxRequests: 23, windowSeconds: 960 },
        requestIp: { maxRequests: 13, windowSeconds: 930 },
        requestTarget: { maxRequests: 4, windowSeconds: 3_660 },
      },
      requestPasswordReset: unused,
    })
  }

  test('login-hints: só IP, sem alvo (ADR-0076 §3)', () => {
    const routes = createLoginHintRoutes({
      rateLimit: { maxRequests: 61, windowSeconds: 660 },
      resolveLoginHint: unusedDependencies() as never,
    })

    expect(limitedAnonymous(routes)).toEqual([
      {
        rateLimit: {
          maxRequests: 61,
          scope: 'login-hints-ip',
          store: 'postgres',
          windowSeconds: 660,
        },
        signature: 'POST /login-hints',
      },
    ])
  })

  test('user-activation: só IP (a entropia do código protege o alvo)', () => {
    const routes = createUserActivationRoutes({
      activateInvitation: unusedDependencies() as never,
      rateLimit: { maxRequests: 21, windowSeconds: 910 },
    })

    expect(limitedAnonymous(routes)).toEqual([
      {
        rateLimit: {
          maxRequests: 21,
          scope: 'user-activation-ip',
          store: 'postgres',
          windowSeconds: 910,
        },
        signature: 'POST /user-activation',
      },
    ])
  })

  test('password-resets: IP e alvo', () => {
    const [request] = limitedAnonymous(passwordResetRoutes())

    expect(request).toEqual({
      rateLimit: {
        maxRequests: 13,
        scope: 'password-resets-ip',
        store: 'postgres',
        target: { maxRequests: 4, scope: 'password-resets-target', windowSeconds: 3_660 },
        windowSeconds: 930,
      },
      signature: 'POST /password-resets',
    })
  })

  test('password-resets/confirm: só IP', () => {
    const [, confirm] = limitedAnonymous(passwordResetRoutes())

    expect(confirm).toEqual({
      rateLimit: {
        maxRequests: 23,
        scope: 'password-resets-confirm-ip',
        store: 'postgres',
        windowSeconds: 960,
      },
      signature: 'POST /password-resets/confirm',
    })
  })

  /**
   * O alvo é o texto digitado, normalizado como o login o lê: e-mail em minúsculas, CPF e telefone
   * sem máscara, o resto aparado e em minúsculas. Duas grafias da mesma pessoa caem no mesmo balde.
   */
  test.each([
    [' Ana@Empresa.TEST ', 'ana@empresa.test'],
    ['529.982.247-25', '52998224725'],
    ['(11) 98765-4321', '11987654321'],
    [' Joao.Silva ', 'joao.silva'],
  ])('password-resets: o alvo de %p é %p', async (typed, expected) => {
    const [request] = passwordResetRoutes()
    const targets: string[] = []

    await request!
      .execute({
        correlationId: 'rate-limited-routes',
        limitTarget: async ({ target }) => {
          targets.push(target)
          return { allowed: false, retryAfterSeconds: 1 }
        },
        pathParameters: {},
        request: new Request('http://localhost/password-resets', {
          body: JSON.stringify({ username: typed }),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      })
      .catch(() => undefined)

    expect(targets).toEqual([expected])
  })
})

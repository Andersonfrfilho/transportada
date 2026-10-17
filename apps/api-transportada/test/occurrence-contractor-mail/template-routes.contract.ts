/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.10 (ADR-0108): o gate de `settings.manage` nas escritas de modelo do módulo de notificação e as duas
 * leituras do editor do tipo (modelos escolhíveis e contatos candidatos), com a mesma política da gravação do tipo.
 */
import { describe, expect, test } from 'bun:test'
import type { NotificationModule } from '@adatechnology/notification-module'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { NOTIFICATION_ROUTES_BASE_PATH } from '../../src/notification/notification.constant.js'
import { createNotificationHttpRouter } from '../../src/notification/presentation/notification-http.router.js'
import { toContractorTemplateView } from '../../src/occurrence-conversation/domain/occurrence-contractor-template.policy.js'
import { ContractorNotFoundError } from '../../src/delivery-clients/domain/delivery-client.error.js'
import {
  createOccurrenceTypeMailRoutes,
  OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH,
  OCCURRENCE_TYPE_MAIL_TEMPLATES_PATH,
} from '../../src/trips/presentation/occurrence-type-mail.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000271501'
const USER_ID = '00000000-0000-4000-8000-000000271502'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000271503'
const TEMPLATES_URL = `http://localhost${NOTIFICATION_ROUTES_BASE_PATH}/notification-templates`

function buildRouter(scopes: readonly string[]) {
  const upserts: unknown[] = []
  const module = {
    useCases: {
      listTemplates: { execute: async () => [] },
      upsertTemplate: {
        execute: async (params: unknown) => {
          upserts.push(params)
          return { id: 'template-1' }
        },
      },
    },
  } as unknown as NotificationModule
  const router = createNotificationHttpRouter({
    authResolver: {
      resolve: async () => ({ companyId: COMPANY_ID, scopes: [...scopes], userId: USER_ID }),
    },
    module,
  })
  return { router, upserts }
}

function templateWrite(method: string): Request {
  return new Request(`${TEMPLATES_URL}${method === 'DELETE' ? '/ocorrencia.avaria' : ''}`, {
    body:
      method === 'DELETE'
        ? undefined
        : JSON.stringify({
            body: 'Texto',
            channel: 'email',
            key: 'ocorrencia.avaria',
            locale: 'pt-BR',
          }),
    headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
    method,
  })
}

describe('criar modelo de notificação exige settings.manage (spec 271 T2.10)', () => {
  test('membro sem a permissão: 403, e o módulo nem é chamado', async () => {
    const { router, upserts } = buildRouter(['trip.read'])

    const response = await router.handle(templateWrite('POST'))

    expect(response.status).toBe(403)
    expect(upserts).toEqual([])
  })

  test.each(['PUT', 'PATCH', 'DELETE'])('%s sem a permissão também é 403', async (method) => {
    const { router, upserts } = buildRouter([])

    expect((await router.handle(templateWrite(method))).status).toBe(403)
    expect(upserts).toEqual([])
  })

  test('falha ao resolver quem pede fecha: 403, e o módulo nem é chamado', async () => {
    const upserts: unknown[] = []
    const router = createNotificationHttpRouter({
      authResolver: {
        resolve: async () => {
          throw new Error('keycloak unavailable')
        },
      },
      module: {
        useCases: { upsertTemplate: { execute: async (params: unknown) => upserts.push(params) } },
      } as unknown as NotificationModule,
    })

    const response = await router.handle(templateWrite('POST'))

    expect(response.status).toBe(403)
    expect(upserts).toEqual([])
  })

  test('com settings.manage a escrita chega ao módulo', async () => {
    const { router, upserts } = buildRouter(['settings.manage'])

    const response = await router.handle(templateWrite('POST'))

    expect(response.status).toBe(201)
    expect(upserts).toHaveLength(1)
  })

  test('a leitura da lista segue como o módulo a define, e o caminho continua sendo dele', async () => {
    const { router } = buildRouter([])

    const response = await router.handle(
      new Request(TEMPLATES_URL, { headers: { authorization: 'Bearer token' }, method: 'GET' }),
    )

    expect(response.status).toBe(200)
    expect(router.match(templateWrite('POST'))).toBe(true)
  })
})

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000271504',
      permissions: new Set(['settings.manage'] as never),
      roles: ['company-admin'],
      userId: USER_ID,
    },
  }
}

function routesWith(overrides: Partial<Parameters<typeof createOccurrenceTypeMailRoutes>[0]> = {}) {
  return createOccurrenceTypeMailRoutes({
    listContractorMailRecipientCandidates: { execute: async () => [] },
    listContractorMailTemplates: { execute: async () => [] },
    ...overrides,
  })
}

function routeAt(pathname: string, routes = routesWith()) {
  const route = routes.find((candidate) => candidate.pathname === pathname)
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return route
}

describe('as leituras do editor do tipo (spec 271 T2.10)', () => {
  test('as duas rotas exigem settings.manage, como a gravação do tipo', () => {
    for (const pathname of [
      OCCURRENCE_TYPE_MAIL_TEMPLATES_PATH,
      OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH,
    ]) {
      const route = routeAt(pathname)
      expect(route.method).toBe('GET')
      expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    }
  })

  test('os modelos: chave, assunto, corpo, versão, utilizável e os problemas', async () => {
    const views = [
      toContractorTemplateView({
        body: 'Nota {{numeroNota}}',
        key: 'ocorrencia.avaria',
        subject: 'Assunto',
        version: 2,
      }),
      toContractorTemplateView({ body: '<p>{{foo}}</p>', key: 'ruim', subject: '', version: 1 }),
    ]
    const route = routeAt(
      OCCURRENCE_TYPE_MAIL_TEMPLATES_PATH,
      routesWith({ listContractorMailTemplates: { execute: async () => views } }),
    )

    const response = await route.execute({
      context: context(),
      correlationId: 'corr',
      pathParameters: {},
      request: new Request(`http://localhost${OCCURRENCE_TYPE_MAIL_TEMPLATES_PATH}`),
    })
    const { data } = (await response.json()) as { data: typeof views }

    expect(response.status).toBe(200)
    expect(data[0]).toEqual({
      body: 'Nota {{numeroNota}}',
      key: 'ocorrencia.avaria',
      problems: [],
      subject: 'Assunto',
      usable: true,
      version: 2,
    })
    expect(data[1]?.usable).toBe(false)
    expect(data[1]?.problems.map((problem) => problem.code)).toEqual([
      'html_body',
      'empty_subject',
      'unknown_variables',
    ])
  })

  test('os candidatos: repassa as contratantes pedidas e valida o parâmetro', async () => {
    const asked: (readonly string[])[] = []
    const route = routeAt(
      OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH,
      routesWith({
        listContractorMailRecipientCandidates: {
          execute: async (input) => {
            asked.push(input.contractorIds)
            return []
          },
        },
      }),
    )
    const call = (query: string) =>
      route.execute({
        context: context(),
        correlationId: 'corr',
        pathParameters: {},
        request: new Request(
          `http://localhost${OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH}${query}`,
        ),
      })

    expect((await call(`?contractorIds=${CONTRACTOR_ID},`)).status).toBe(200)
    expect(asked).toEqual([[CONTRACTOR_ID]])
    expect((await call('')).status).toBe(200)
    expect(asked[1]).toEqual([])
    await expect(call('?contractorIds=nao-e-uuid')).rejects.toMatchObject({ status: 400 })
  })

  test('contratante de outra empresa: o 404 do caso de uso sobe, sem dizer qual', async () => {
    const route = routeAt(
      OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH,
      routesWith({
        listContractorMailRecipientCandidates: {
          execute: async () => {
            throw new ContractorNotFoundError()
          },
        },
      }),
    )

    await expect(
      route.execute({
        context: context(),
        correlationId: 'corr',
        pathParameters: {},
        request: new Request(
          `http://localhost${OCCURRENCE_TYPE_MAIL_RECIPIENT_CANDIDATES_PATH}?contractorIds=${CONTRACTOR_ID}`,
        ),
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})

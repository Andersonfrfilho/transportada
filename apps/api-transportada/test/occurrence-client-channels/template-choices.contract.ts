/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T4 (RF2): a leitura dos modelos que a matriz "Retorno ao cliente" pode escolher, por canal, com a mesma
 * avaliação da gravação — o editor nunca oferece como utilizável o que o `PUT` recusaria.
 */
import { describe, expect, test } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { NOTIFICATION_TEMPLATE_KEY } from '../../src/notification/domain/notification-catalog.constant.js'
import {
  assessClientChannelTemplate,
  toClientChannelTemplateView,
} from '../../src/trips/domain/occurrence-client-channel-template.policy.js'
import {
  createOccurrenceTypeMailRoutes,
  OCCURRENCE_TYPE_CLIENT_CHANNEL_TEMPLATES_PATH,
} from '../../src/trips/presentation/occurrence-type-mail.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000286401'

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000286402',
      permissions: new Set(['settings.manage'] as never),
      roles: ['company-admin'],
      userId: '00000000-0000-4000-8000-000000286403',
    },
  }
}

describe('spec 286 T4: os modelos escolhíveis por canal', () => {
  test('a visão repete a avaliação da gravação, canal a canal', () => {
    const cases = [
      { body: 'Olá', channel: 'email', key: 'a.b', subject: 'Assunto' },
      { body: 'Olá', channel: 'email', key: 'a.b', subject: ' ' },
      { body: 'Olá', channel: 'whatsapp', key: 'a.b', subject: null },
      { body: ' ', channel: 'whatsapp', key: 'a.b', subject: null },
      {
        body: 'Olá',
        channel: 'whatsapp',
        key: NOTIFICATION_TEMPLATE_KEY.BILLING_INVOICE_DUE,
        subject: null,
      },
    ] as const
    for (const item of cases) {
      const view = toClientChannelTemplateView({ ...item, version: 3 })
      const problems = assessClientChannelTemplate({
        channel: item.channel,
        key: item.key,
        template: { body: item.body, subject: item.subject },
      })
      expect(view.problems).toEqual(problems)
      expect(view.usable).toBe(problems.length === 0)
      expect(view.version).toBe(3)
    }
  })

  test('WhatsApp é texto puro: sem assunto é utilizável; e-mail sem assunto não é', () => {
    expect(
      toClientChannelTemplateView({
        body: 'Boleto da nota {{numeroNota}}',
        channel: 'whatsapp',
        key: 'occurrence.client-reply.x',
        subject: null,
        version: 1,
      }).usable,
    ).toBe(true)
    expect(
      toClientChannelTemplateView({
        body: 'Boleto',
        channel: 'email',
        key: 'occurrence.client-reply.x',
        subject: null,
        version: 1,
      }).problems,
    ).toEqual([{ code: 'empty_subject' }])
  })

  test('a rota exige settings.manage e devolve a lista como a leitura a deu', async () => {
    const views = [
      toClientChannelTemplateView({
        body: 'Boleto',
        channel: 'whatsapp',
        key: 'occurrence.client-reply.x',
        subject: null,
        version: 2,
      }),
    ]
    const routes = createOccurrenceTypeMailRoutes({
      listClientChannelTemplates: { execute: async () => views },
      listContractorMailRecipientCandidates: { execute: async () => [] },
      listContractorMailTemplates: { execute: async () => [] },
    })
    const route = routes.find(
      (candidate) => candidate.pathname === OCCURRENCE_TYPE_CLIENT_CHANNEL_TEMPLATES_PATH,
    )
    if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
    expect(route.method).toBe('GET')
    expect(route.policy).toEqual({ permission: 'settings.manage', scope: 'company' })

    const response = await route.execute({
      context: context(),
      correlationId: 'corr',
      pathParameters: {},
      request: new Request(`http://localhost${OCCURRENCE_TYPE_CLIENT_CHANNEL_TEMPLATES_PATH}`),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(((await response.json()) as { data: unknown }).data).toEqual(views)
  })
})

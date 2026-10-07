/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T4.3, RF4, CA04): `POST /company-settings/occurrence-types/email-preview` — o e-mail do
 * tipo renderizado com dados de exemplo fixos, pela MESMA função do envio. O contrato prova a
 * permissão (sem `settings.manage` é 403, e o corpo nem é lido), o teto, o envelope, a recusa dos
 * marcadores por contexto e que a prévia sai de `renderOccurrenceTemplate`.
 */
import { describe, expect, it } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  OCCURRENCE_TEMPLATE_PREVIEW_SAMPLE,
  renderOccurrenceEmailPreview,
} from '../../src/trips/domain/occurrence-template-preview.policy.js'
import { renderOccurrenceTemplate } from '../../src/trips/domain/occurrence-template.policy.js'
import {
  createOccurrenceTypeEmailPreviewRoutes,
  OCCURRENCE_TYPE_EMAIL_PREVIEW_PATH,
} from '../../src/trips/presentation/occurrence-type-email-preview.routes.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

type Dependencies = Parameters<typeof createTripRoutes>[0]

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const SAC_SUBJECT = 'OCORRÊNCIA: {{contratante}} – NF {{numeroNotaSemSerie}} – DEVOLUÇÃO PARCIAL'
const SAC_BODY = [
  'NFD {{numeroReferencia}} – R$ {{valorDeclarado}}',
  'RAZÃO SOCIAL: {{razaoSocial}}',
  'VALOR DA ENTREGA: R$ {{valorNota}}',
  '',
  '{{linhasItens}}',
].join('\n')
const SAC_LINE = '{{codigoItem}} – {{item}} – {{quantidadeItem}}{{unidadeItem}} – R$ {{valorItem}}'

function context(permissions: readonly string[]): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000104',
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'email-preview-user',
      userId: '00000000-0000-4000-8000-000000000002',
    } as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(permissions as never),
      roles: ['company-admin'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

function tripRouteDependencies(): Dependencies {
  return new Proxy({} as Dependencies, {
    get: () => ({
      execute: (): never => {
        throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
      },
    }),
  })
}

function buildRouter(permissions: readonly string[]) {
  const scope = context(permissions)
  return createRouter({
    authentication: { authenticate: async () => scope.identity },
    authorization: {
      authorize: (routed, policy) => new AuthorizationService().authorize(routed, policy),
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
      now: () => new Date('2026-07-20T12:00:00.000Z'),
    }),
    routes: [
      ...createOccurrenceTypeEmailPreviewRoutes(),
      ...createTripRoutes(tripRouteDependencies()).filter((route) =>
        route.pathname.startsWith('/company-settings/occurrence-types'),
      ),
    ],
    tenantContext: { resolveCompany: async () => scope },
    userPictureExistence: stubUserPictureExistence(),
  })
}

function post(body: unknown): Parameters<ReturnType<typeof buildRouter>['handle']>[0] {
  return {
    correlationId: 'correlation-1',
    method: 'POST',
    pathname: OCCURRENCE_TYPE_EMAIL_PREVIEW_PATH,
    request: new Request(`http://localhost${OCCURRENCE_TYPE_EMAIL_PREVIEW_PATH}`, {
      body: JSON.stringify(body),
      headers: {
        authorization: 'Bearer header.payload.signature',
        'content-type': 'application/json',
      },
      method: 'POST',
    }),
  }
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
}

describe('a rota da prévia do e-mail do tipo (spec 247 RF4)', () => {
  it('exige settings.manage e tem teto em memória', () => {
    const route = createOccurrenceTypeEmailPreviewRoutes().find(
      (candidate) =>
        candidate.method === 'POST' && candidate.pathname === OCCURRENCE_TYPE_EMAIL_PREVIEW_PATH,
    )

    expect(route?.policy).toEqual({ permission: 'settings.manage', scope: 'company' })
    expect(route?.rateLimit).toMatchObject({ maxRequests: 60, store: 'memory' })
  })

  it('sem settings.manage é 403, mesmo com outra permissão da empresa', async () => {
    for (const permissions of [[], ['trip.manage']]) {
      const error = await rejectionOf(
        buildRouter(permissions).handle(post({ emailBody: 'x', emailSubject: 'y' })),
      )

      expect(error).toMatchObject({ code: 'FORBIDDEN', status: 403 })
    }
  })

  it('com settings.manage responde 200 no envelope { data: { subject, body } }', async () => {
    const response = await buildRouter(['settings.manage']).handle(
      post({
        emailBody: SAC_BODY,
        emailItemLineTemplate: SAC_LINE,
        emailSubject: SAC_SUBJECT,
      }),
    )

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { data: { body: string; subject: string } }
    expect(Object.keys(payload)).toEqual(['data'])
    expect(payload.data.subject).toBe(
      'OCORRÊNCIA: Contratante Exemplo – NF 123456 – DEVOLUÇÃO PARCIAL',
    )
    expect(payload.data.body).toBe(
      [
        'NFD 45029 – R$ 117,19',
        'RAZÃO SOCIAL: Supermercado Exemplo Ltda',
        'VALOR DA ENTREGA: R$ 7.840,64',
        '',
        '7000001 01 – PRODUTO EXEMPLO A 500G – 1FD – R$ 57,20',
        '7000002 02 – PRODUTO EXEMPLO B 1KG – 3CX – R$ 59,99',
      ].join('\n'),
    )
  })

  it('o endereço fixo não é lido como :occurrenceTypeId', async () => {
    const response = await buildRouter(['settings.manage']).handle(post({}))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { body: '', subject: '' } })
  })

  it('marcador desconhecido, de linha no corpo e {{linhasItens}} na linha são 400', async () => {
    const router = buildRouter(['settings.manage'])
    const invalidBodies = [
      { emailBody: '{{numeroNfd}}' },
      { emailBody: '{{somaItem}}' },
      { emailSubject: '{{linhasItens}}' },
      { emailItemLineTemplate: '{{codigoItem}} {{linhasItens}}' },
      { emailItemLineTemplate: 'x'.repeat(401) },
      { companyId: '00000000-0000-4000-8000-0000000000ff' },
    ]

    for (const body of invalidBodies) {
      expect(await rejectionOf(router.handle(post(body)))).toMatchObject({ status: 400 })
    }
  })
})

describe('a prévia é a função do envio, com dados de exemplo fixos (spec 247 RF4)', () => {
  const templates = [
    { body: '', line: '', subject: '' },
    { body: SAC_BODY, line: SAC_LINE, subject: SAC_SUBJECT },
    {
      body: '{{ numeroNota }} / {{observacao}} / {{data}} / {{motorista}} / {{parada}}',
      line: '',
      subject: '{{numeroNota}}',
    },
    { body: '{{item}} | {{codigoItem}} | {{quantidadeItem}}', line: '', subject: '' },
    {
      body: '{{linhasItens}}',
      line: '{{valorUnitarioItem}} {{somaItem}} {{valorItem}} {{somaItens}}',
      subject: '',
    },
    {
      body: 'a {{linhasItens}} b {{valorDeclarado}} {{numeroNotaSemSerie}}',
      line: '{{observacao}}',
      subject: '',
    },
  ]

  it('devolve exatamente o que renderOccurrenceTemplate devolve para os mesmos dados', () => {
    for (const template of templates) {
      const values = { ...OCCURRENCE_TEMPLATE_PREVIEW_SAMPLE, itemLineTemplate: template.line }

      expect(
        renderOccurrenceEmailPreview({
          emailBody: template.body,
          emailItemLineTemplate: template.line,
          emailSubject: template.subject,
        }),
      ).toEqual({
        body: renderOccurrenceTemplate({ template: template.body, values }),
        subject: renderOccurrenceTemplate({ template: template.subject, values }),
      })
    }
  })

  it('os dados de exemplo são fixos: a mesma entrada, o mesmo resultado, sem relógio nem empresa', () => {
    const params = {
      emailBody: SAC_BODY,
      emailItemLineTemplate: SAC_LINE,
      emailSubject: SAC_SUBJECT,
    }

    expect(renderOccurrenceEmailPreview(params)).toEqual(renderOccurrenceEmailPreview(params))
    expect(JSON.stringify(OCCURRENCE_TEMPLATE_PREVIEW_SAMPLE)).not.toContain('SPANI')
  })

  it('a linha de item é a do corpo da requisição, e vazia usa a linha padrão', () => {
    const custom = renderOccurrenceEmailPreview({
      emailBody: '{{linhasItens}}',
      emailItemLineTemplate: '[{{codigoItem}}]',
      emailSubject: '',
    })
    const fallback = renderOccurrenceEmailPreview({
      emailBody: '{{linhasItens}}',
      emailItemLineTemplate: '',
      emailSubject: '',
    })

    expect(custom.body).toBe('[7000001 01]\n[7000002 02]')
    expect(fallback.body).toBe(
      '7000001 01 – PRODUTO EXEMPLO A 500G – 1 FD – R$ 57,20\n7000002 02 – PRODUTO EXEMPLO B 1KG – 3 CX – R$ 59,99',
    )
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T005b M2 — a `MembershipAuthorizationPolicy` não pede permissão nenhuma: qualquer
 * membership ativa passa. Isso só é seguro enquanto a rota alcança dado **da própria pessoa**, e
 * nada no tipo impede alguém de pendurá-la em `/company-users/:id` amanhã.
 *
 * Duas travas. O roteador recusa subir com rota de membership fora de `/me/` — como toda rota da
 * aplicação passa por `createRouter`, é o boot inteiro que falha, e isso cobre as rotas que
 * `createApplicationRoutes` monta sem precisar de banco nem Keycloak para montá-las aqui. E a lista
 * de quem usa a política é escrita por extenso: rota nova com ela reprova até alguém acrescentá-la.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRouter, defineRoute } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { createWhatsAppPhoneRoutes } from '../../src/whatsapp-commands/presentation/whatsapp-phone.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'

const MEMBERSHIP_POLICY_ALLOWLIST = [
  'DELETE /me/whatsapp-phone',
  'GET /me/whatsapp-phone',
  'POST /me/whatsapp-phone/verification',
] as const

/** Onde o literal pode aparecer: a declaração do tipo e a única fábrica autorizada. */
const MEMBERSHIP_POLICY_SOURCES = [
  'src/identity/domain/authorization.policy.ts',
  'src/whatsapp-commands/presentation/whatsapp-phone.routes.ts',
] as const

const MEMBERSHIP_LITERAL = /membership['"]?\s*:\s*['"]active['"]/u
const APP_ROOT = new URL('../../', import.meta.url).pathname

function buildRouter(routes: readonly ReturnType<typeof defineRoute>[]) {
  return createRouter({
    authentication: {
      authenticate: async () => {
        throw new Error('não chamado')
      },
    },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes,
    tenantContext: {
      resolveCompany: async () => {
        throw new Error('não chamado')
      },
    },
  })
}

function membershipRoute(pathname: string) {
  return defineRoute({
    handle: async () => new Response(null, { status: 204 }),
    method: 'GET',
    parse: () => ({}),
    pathname,
    policy: { membership: 'active', scope: 'company' },
  })
}

describe('a política de membership fica presa a /me/ (spec 144 T005b M2)', () => {
  test('o roteador não sobe com rota de membership fora de /me/', () => {
    expect(() => buildRouter([membershipRoute('/company-users/:id/whatsapp-phone')])).toThrow(
      '/company-users/:id/whatsapp-phone',
    )
    expect(() => buildRouter([membershipRoute('/me-and-others')])).toThrow()
  })

  test('com a rota em /me/ o roteador sobe', () => {
    expect(() => buildRouter([membershipRoute('/me/qualquer-coisa')])).not.toThrow()
  })

  test('as rotas com a política são exatamente as da allowlist', () => {
    const routes = createWhatsAppPhoneRoutes({
      readState: async () => {
        throw new Error('não chamado')
      },
      requestVerification: async () => {
        throw new Error('não chamado')
      },
      unbind: {} as Parameters<typeof createWhatsAppPhoneRoutes>[0]['unbind'],
    })

    const signatures = routes
      .filter((route) => route.policy !== undefined && 'membership' in route.policy)
      .map((route) => `${route.method} ${route.pathname}`)
      .sort()

    expect(signatures).toEqual([...MEMBERSHIP_POLICY_ALLOWLIST])
  })

  test('nenhum outro arquivo de src/ declara a política', async () => {
    const offenders: string[] = []
    for await (const path of new Bun.Glob('src/**/*.ts').scan({ cwd: APP_ROOT })) {
      const source = await Bun.file(`${APP_ROOT}${path}`).text()
      if (MEMBERSHIP_LITERAL.test(source)) offenders.push(path)
    }

    expect(offenders.sort()).toEqual([...MEMBERSHIP_POLICY_SOURCES])
  })
})

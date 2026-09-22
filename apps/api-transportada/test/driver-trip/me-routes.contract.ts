/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { DriverNotRegisteredError } from '../../src/trips/domain/trip.error.js'
import { createMeTripRoutes } from '../../src/trips/presentation/me-trip.routes.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

const meRoutes = createMeTripRoutes({
  attachProof: NOT_CALLED,
  dispatchCurrentTrip: NOT_CALLED,
  registerDriverOccurrence: NOT_CALLED,
  findCurrentTrip: NOT_CALLED,
  listFieldOccurrenceTypes: NOT_CALLED,
  reportArrival: NOT_CALLED,
  reportDelivery: NOT_CALLED,
  reportOccurrence: NOT_CALLED,
  readManifestXml: NOT_CALLED,
  renderManifestDamdfe: NOT_CALLED,
  reportReturn: NOT_CALLED,
  resolveDriverId: NOT_CALLED,
  startFieldTrip: NOT_CALLED,
})

function companyContext(roles: CompanyContext['roles']): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: '00000000-0000-4000-8000-000000000002',
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'driver',
      userId: '00000000-0000-4000-8000-000000000001',
    },
    scope: {
      companyId: '00000000-0000-4000-8000-000000000002',
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions: resolveCompanyPermissions(roles),
      roles,
      userId: '00000000-0000-4000-8000-000000000001',
    },
  }
}

const officeRoutes = createTripRoutes(
  new Proxy({} as never, { get: () => ({ execute: NOT_CALLED }) }),
)

describe('as rotas do campo', () => {
  /** ADR-0045 §2: nenhuma delas leva id de viagem. Se ele não escolhe, não há o que enumerar. */
  it('não aceitam id de viagem em caminho nenhum', () => {
    for (const route of meRoutes) {
      expect(route.pathname).toStartWith('/me/trips/current')
      expect(route.pathname).not.toContain(':tripId')
      expect(route.pathname).not.toContain(':id')
    }
  })

  it('só usam as duas permissões do papel de campo', () => {
    const permissions = new Set(meRoutes.map((route) => route.policy?.permission))

    expect([...permissions].toSorted()).toEqual(['trip.read', 'trip.report'])
  })

  /**
   * O critério de aceite da spec, virado teste: com o papel `driver` **nenhuma** rota de viagem do
   * escritório abre. A checagem é sobre a política declarada, não sobre uma lista de caminhos que
   * alguém teria de lembrar de atualizar.
   */
  /**
   * Spec 156 T7 (L1): a decisão é lida pelo `authorize` real, não por `policy.permission` — cinco
   * leituras passaram a `anyPermission` (D11), e ali não existe permissão única para comparar.
   */
  it('o papel driver não alcança nenhuma rota de viagem do escritório', () => {
    const authorization = new AuthorizationService()
    const driverContext = companyContext(['driver'])

    for (const route of officeRoutes) {
      expect(route.policy).toBeDefined()
      expect(() => authorization.authorize(driverContext, route.policy)).toThrow()
    }
  })

  it('e alcança todas as do campo', () => {
    const driverPermissions = resolveCompanyPermissions(['driver'])

    for (const route of meRoutes) {
      expect(driverPermissions.has(route.policy?.permission as never)).toBe(true)
    }
  })

  /**
   * Spec 079. ⚠️ **A ocorrência do motorista mora aqui, e o caminho não tem id de viagem.** Uma
   * versão dela nasceu em `/trips/:id` pedindo `trip.report` e foi desfeita: o motorista tem essa
   * permissão para **toda a empresa**, e ali ele alcançaria qualquer viagem — foi este arquivo que
   * pegou. Se o caminho voltar a receber um id de viagem, é aqui que a decisão se reabre.
   */
  it('a ocorrência do motorista não recebe id de viagem no caminho', () => {
    const rota = meRoutes.find((route) => route.pathname.endsWith('/occurrences'))

    expect(rota).toBeDefined()
    expect(rota?.pathname).not.toInclude(':id')
    expect(rota?.pathname).toStartWith('/me/trips/current')
    expect(rota?.policy?.permission).toBe('trip.report')
  })
})

describe('os dois toques que começam a viagem (ADR-0058)', () => {
  const paths = meRoutes.map((route) => route.pathname)

  it('conferir a carga e iniciar trajeto existem sob a viagem atual', () => {
    expect(paths).toContain('/me/trips/current/confirm-load')
    expect(paths).toContain('/me/trips/current/start-route')
  })

  /* ADR-0045 §2: quem não escolhe id não enumera — vale para as duas novas como para as demais. */
  it('nenhuma das duas recebe id de viagem', () => {
    for (const pathname of ['/me/trips/current/confirm-load', '/me/trips/current/start-route']) {
      expect(pathname).not.toContain(':tripId')
      expect(pathname).not.toContain(':id')
    }
  })

  it('as duas pedem trip.report, e nenhuma pede trip.manage', () => {
    for (const route of meRoutes.filter(
      (candidate) =>
        candidate.pathname.endsWith('/confirm-load') || candidate.pathname.endsWith('/start-route'),
    )) {
      expect(route.policy).toEqual({ permission: 'trip.report', scope: 'company' })
    }
  })
})

/**
 * Spec 157 RF1: o motorista lista os tipos de rua sem `settings.manage`. A rota de configuração
 * carrega os modelos de e-mail e respondia 403 a ele — o seletor ficava vazio em silêncio.
 */
describe('os tipos de ocorrência do motorista (spec 157)', () => {
  const PATH = '/me/trips/current/occurrence-types'
  const COMPANY_ID = '00000000-0000-4000-8000-000000000002'

  function request() {
    return {
      context: companyContext(['driver']),
      correlationId: 'c-1',
      pathParameters: {},
      request: new Request(`http://localhost${PATH}`),
    }
  }

  function buildRoutes(input: { readonly driverId: string | null }) {
    const asked: string[] = []
    const routes = createMeTripRoutes({
      attachProof: NOT_CALLED,
      dispatchCurrentTrip: NOT_CALLED,
      findCurrentTrip: NOT_CALLED,
      listFieldOccurrenceTypes: async ({ companyId }) => {
        asked.push(companyId)
        return [{ id: '00000000-0000-4000-8000-0000000000e1', name: 'Cliente ausente' }]
      },
      readManifestXml: NOT_CALLED,
      registerDriverOccurrence: NOT_CALLED,
      renderManifestDamdfe: NOT_CALLED,
      reportArrival: NOT_CALLED,
      reportDelivery: NOT_CALLED,
      reportOccurrence: NOT_CALLED,
      reportReturn: NOT_CALLED,
      resolveDriverId: async () => input.driverId,
      startFieldTrip: NOT_CALLED,
    })
    const route = routes.find(
      (candidate) => candidate.method === 'GET' && candidate.pathname === PATH,
    )
    return { asked, route }
  }

  it('existe na árvore do motorista, pede trip.report, e o papel driver a alcança', () => {
    const { route } = buildRoutes({ driverId: 'driver' })

    expect(route?.policy).toEqual({ permission: 'trip.report', scope: 'company' })
    expect(() =>
      new AuthorizationService().authorize(companyContext(['driver']), route?.policy),
    ).not.toThrow()
  })

  it('devolve só id e nome, com a empresa do token', async () => {
    const { asked, route } = buildRoutes({ driverId: 'driver' })

    const response = await route?.execute(request())

    expect(response?.status).toBe(200)
    expect(await response?.json()).toEqual({
      data: [{ id: '00000000-0000-4000-8000-0000000000e1', name: 'Cliente ausente' }],
    })
    expect(asked).toEqual([COMPANY_ID])
  })

  it('conta sem cadastro de motorista recebe o mesmo erro das outras rotas /me', async () => {
    const { asked, route } = buildRoutes({ driverId: null })

    const error = await Promise.resolve(route?.execute(request())).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(DriverNotRegisteredError)
    expect(asked).toEqual([])
  })
})

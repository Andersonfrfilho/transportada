/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A exportação do que falta medir: todas as caixas pendentes da empresa do token, na ordem da fila,
 * com um teto de segurança do servidor que o cliente não afrouxa — e que diz quando cortou.
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRouter, defineRoute } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { resolveCompanyPermissions } from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createExportPendingPackageBoxes } from '../../src/nfe-documents/application/export-pending-package-boxes.use-case.js'
import type { ExportPendingPackageBoxes } from '../../src/nfe-documents/application/export-pending-package-boxes.use-case.js'
import { createListPackageBoxes } from '../../src/nfe-documents/application/list-package-boxes.use-case.js'
import type {
  PackageBoxFilters,
  PackageBoxRepositoryPort,
  PackageBoxView,
} from '../../src/nfe-documents/application/package-box.port.js'
import { PACKAGE_BOX_PENDING_EXPORT_MAX_ITEMS } from '../../src/nfe-documents/domain/package-box-measurement.constant.js'
import { createPackageBoxRoutes } from '../../src/nfe-documents/presentation/package-box.routes.js'
import { ApiError } from '../../src/shared/api.error.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000c2'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000a9'
const PENDING_EXPORT_PATH = '/nfe-package-boxes/pending-export'

type ListCall = {
  readonly companyId: string
  readonly filters: PackageBoxFilters
  readonly limit: number
}

type CompanyBox = { readonly box: PackageBoxView; readonly companyId: string }

function buildBox(
  input: Readonly<{ companyId: string; id: string; measured?: boolean; volumes: number }>,
): CompanyBox {
  return {
    box: {
      cartonGtin: null,
      commercialUnit: 'CX12',
      description: `CAIXA ${input.id}`,
      emitterTaxId: '05868574001090',
      estimate: null,
      familyKey: undefined,
      familyMeasuredCount: 0,
      familyPendingCount: 0,
      grossWeightGrams: null,
      heightMm: input.measured === true ? 100 : null,
      id: input.id,
      isEstimated: false,
      lengthMm: input.measured === true ? 300 : null,
      measuredAt: input.measured === true ? '2026-09-16T12:00:00.000Z' : null,
      measurementMarginMm: null,
      measurementSource: input.measured === true ? 'typed' : null,
      packagingSiblingCount: 0,
      packagingUnitCount: undefined,
      productCode: input.id,
      transportedVolumes: input.volumes,
      unit: null,
      unitsPerBox: 1,
      variantLabel: '',
      widthMm: input.measured === true ? 200 : null,
    },
    companyId: input.companyId,
  }
}

/**
 * Um repositório de mentira que honra os três cortes do real: empresa, situação e `LIMIT` — e na
 * ordem do SQL (volume transportado, desempate pelo id), para o corte do teto ser o mesmo da fila.
 */
function buildRepository(boxes: readonly CompanyBox[]): {
  readonly calls: ListCall[]
  readonly repository: PackageBoxRepositoryPort
} {
  const calls: ListCall[] = []
  const unused = (): never => {
    throw new Error('não chamado')
  }
  return {
    calls,
    repository: {
      getSiblings: unused,
      async list(input) {
        calls.push(input)
        return boxes
          .filter((entry) => entry.companyId === input.companyId)
          .map((entry) => entry.box)
          .filter((box) => input.filters.status !== 'pending' || box.measuredAt === null)
          .toSorted(
            (first, second) =>
              second.transportedVolumes - first.transportedVolumes ||
              first.id.localeCompare(second.id),
          )
          .slice(0, input.limit)
      },
      measure: unused,
      replicate: unused,
    },
  }
}

const BOXES = [
  buildBox({ companyId: COMPANY_ID, id: 'b-low', volumes: 5 }),
  buildBox({ companyId: COMPANY_ID, id: 'a-top', volumes: 90 }),
  buildBox({ companyId: COMPANY_ID, id: 'c-measured', measured: true, volumes: 500 }),
  buildBox({ companyId: COMPANY_ID, id: 'd-mid', volumes: 40 }),
  buildBox({ companyId: COMPANY_ID, id: 'e-tie', volumes: 40 }),
  buildBox({ companyId: OTHER_COMPANY_ID, id: 'z-other-company', volumes: 1000 }),
]

describe('exportar as caixas pendentes — caso de uso', () => {
  test('o teto do servidor é 10 000 caixas', () => {
    expect(PACKAGE_BOX_PENDING_EXPORT_MAX_ITEMS).toBe(10_000)
  })

  test('devolve só as pendentes da empresa do contexto, na mesma ordem da fila', async () => {
    const { calls, repository } = buildRepository(BOXES)
    const listPackageBoxes = createListPackageBoxes({ repository })
    const exportPending = createExportPendingPackageBoxes({ listPackageBoxes })

    const exported = await exportPending.execute({ context: { companyId: COMPANY_ID } })
    const queue = await listPackageBoxes.execute({
      context: { companyId: COMPANY_ID },
      filters: { status: 'pending' },
      limit: 200,
    })

    expect(exported.truncated).toBe(false)
    expect(exported.items.map((item) => item.id)).toEqual(queue.items.map((item) => item.id))
    expect(exported.items.map((item) => item.id)).toEqual(['a-top', 'd-mid', 'e-tie', 'b-low'])
    expect(exported.items.map((item) => item.id)).not.toContain('z-other-company')
    expect(exported.items.map((item) => item.id)).not.toContain('c-measured')
    // Os mesmos campos que a fila expõe: o cliente lê as duas com o mesmo guard.
    expect(exported.items[0]).toEqual(queue.items[0]!)

    expect(calls[0]).toEqual({
      companyId: COMPANY_ID,
      filters: { status: 'pending' },
      limit: PACKAGE_BOX_PENDING_EXPORT_MAX_ITEMS + 1,
    })
  })

  test('exatamente no teto não é corte', async () => {
    const { repository } = buildRepository(BOXES)
    const exportPending = createExportPendingPackageBoxes({
      listPackageBoxes: createListPackageBoxes({ repository }),
      maxItems: 4,
    })

    const exported = await exportPending.execute({ context: { companyId: COMPANY_ID } })

    expect(exported.truncated).toBe(false)
    expect(exported.items).toHaveLength(4)
  })

  test('uma caixa além do teto é corte: devolve o teto, na ordem da fila, e avisa', async () => {
    const { calls, repository } = buildRepository(BOXES)
    const exportPending = createExportPendingPackageBoxes({
      listPackageBoxes: createListPackageBoxes({ repository }),
      maxItems: 3,
    })

    const exported = await exportPending.execute({ context: { companyId: COMPANY_ID } })

    expect(exported.truncated).toBe(true)
    expect(exported.items.map((item) => item.id)).toEqual(['a-top', 'd-mid', 'e-tie'])
    // Busca teto + 1: é o único jeito de saber que havia mais sem contar a tabela inteira.
    expect(calls[0]?.limit).toBe(4)
  })

  test('empresa sem caixa pendente devolve lista vazia, sem corte', async () => {
    const { repository } = buildRepository(BOXES)
    const exportPending = createExportPendingPackageBoxes({
      listPackageBoxes: createListPackageBoxes({ repository }),
    })

    const exported = await exportPending.execute({
      context: { companyId: '00000000-0000-4000-8000-0000000000c9' },
    })

    expect(exported).toEqual({ items: [], truncated: false })
  })

  test('teto abaixo de 1 é erro de montagem, não uma exportação vazia', () => {
    const { repository } = buildRepository(BOXES)
    const listPackageBoxes = createListPackageBoxes({ repository })

    expect(() => createExportPendingPackageBoxes({ listPackageBoxes, maxItems: 0 })).toThrow()
    expect(() => createExportPendingPackageBoxes({ listPackageBoxes, maxItems: 1.5 })).toThrow()
    expect(() => createExportPendingPackageBoxes({ listPackageBoxes, maxItems: 1 })).not.toThrow()
  })
})

function companyContext(
  permissions: CompanyContext['permissions'],
  userId: string = USER_ID,
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-0000000000a2',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'conferente',
      userId,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-0000000000a3',
      permissions,
      roles: ['separator'],
      userId,
    },
  }
}

function unusedDependency(): never {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => {
      throw new Error('não chamado')
    },
    get: () => unusedDependency(),
  }
  return new Proxy(() => undefined, handler) as never
}

/** `session.context` é trocável entre pedidos: é assim que o teste troca de usuário. */
function buildRouter(
  input: Readonly<{
    context: AuthenticatedContext<CompanyContext>
    exportPendingPackageBoxes: ExportPendingPackageBoxes
    extraRoutes?: readonly ReturnType<typeof defineRoute>[]
  }>,
) {
  const session = { context: input.context }
  const packageBoxRoutes = createPackageBoxRoutes({
    cameraMeasurementSettings: unusedDependency(),
    exportPendingPackageBoxes: input.exportPendingPackageBoxes,
    listPackageBoxes: unusedDependency(),
    listPackageBoxSiblings: unusedDependency(),
    measurePackageBox: unusedDependency(),
    recordPackageBoxUnit: unusedDependency(),
    replicatePackageBoxMeasurement: unusedDependency(),
  })
  const router = createRouter({
    authentication: { authenticate: async () => session.context.identity },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
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
    routes: [...(input.extraRoutes ?? []), ...packageBoxRoutes],
    tenantContext: { resolveCompany: async () => session.context },
    userPictureExistence: stubUserPictureExistence(),
  })
  return { router, session }
}

async function captureRouterError(promise: Promise<Response>): Promise<ApiError> {
  const caught = await promise.then(
    () => undefined,
    (error: unknown) => error,
  )
  expect(caught).toBeInstanceOf(ApiError)
  return caught as ApiError
}

function exportRequest(pathname: string) {
  return {
    correlationId: 'package-box-pending-export',
    method: 'GET',
    pathname: new URL(`http://localhost${pathname}`).pathname,
    request: new Request(`http://localhost${pathname}`, {
      headers: { authorization: 'Bearer header.payload.signature' },
    }),
  }
}

describe('GET /nfe-package-boxes/pending-export — rota', () => {
  test('responde { data: { items, truncated } } com a empresa do token, não da URL', async () => {
    const received: unknown[] = []
    const { router } = buildRouter({
      context: companyContext(resolveCompanyPermissions(['separator'])),
      exportPendingPackageBoxes: {
        async execute(input) {
          received.push(input)
          return { items: [], truncated: true }
        },
      },
    })

    const response = await router.handle(
      exportRequest(`${PENDING_EXPORT_PATH}?limit=50000&companyId=${OTHER_COMPANY_ID}`),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: { items: [], truncated: true } })
    // Nenhum parâmetro do cliente chega ao caso de uso: nem teto, nem empresa.
    expect(received).toEqual([{ context: { companyId: COMPANY_ID } }])
  })

  test('não é engolida por um GET /nfe-package-boxes/:id registrado antes dela', async () => {
    const called: string[] = []
    const { router } = buildRouter({
      context: companyContext(resolveCompanyPermissions(['separator'])),
      exportPendingPackageBoxes: {
        async execute() {
          called.push('export')
          return { items: [], truncated: false }
        },
      },
      extraRoutes: [
        defineRoute<undefined>({
          async handle() {
            called.push('by-id')
            return new Response(null, { status: 200 })
          },
          method: 'GET',
          parse: () => undefined,
          pathname: '/nfe-package-boxes/:id',
          policy: { permission: 'cargo.measure', scope: 'company' },
        }),
      ],
    })

    const response = await router.handle(exportRequest(PENDING_EXPORT_PATH))

    expect(response.status).toBe(200)
    expect(called).toEqual(['export'])
  })

  test('sem cargo.measure é 403, e o caso de uso nem roda', async () => {
    let calls = 0
    const { router } = buildRouter({
      context: companyContext(new Set(['invoices.read'])),
      exportPendingPackageBoxes: {
        async execute() {
          calls += 1
          return { items: [], truncated: false }
        },
      },
    })

    const error = await captureRouterError(router.handle(exportRequest(PENDING_EXPORT_PATH)))

    expect(error.status).toBe(403)
    expect(calls).toBe(0)
  })

  test('dez exportações passam, a 11ª é 429 com retry-after, e outro usuário segue passando', async () => {
    let calls = 0
    const { router, session } = buildRouter({
      context: companyContext(resolveCompanyPermissions(['separator'])),
      exportPendingPackageBoxes: {
        async execute() {
          calls += 1
          return { items: [], truncated: false }
        },
      },
    })

    for (let request = 0; request < 10; request += 1) {
      const response = await router.handle(exportRequest(PENDING_EXPORT_PATH))
      expect(response.status).toBe(200)
    }

    const error = await captureRouterError(router.handle(exportRequest(PENDING_EXPORT_PATH)))
    expect(error.status).toBe(429)
    expect(Number(error.headers?.['retry-after'])).toBeGreaterThan(0)
    expect(calls).toBe(10)

    session.context = companyContext(resolveCompanyPermissions(['separator']), OTHER_USER_ID)
    const otherUser = await router.handle(exportRequest(PENDING_EXPORT_PATH))
    expect(otherUser.status).toBe(200)
    expect(calls).toBe(11)
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T13, ADR-0069 §6: o interruptor da leitura do canhoto mora na configuração geral do
 * comprovante, lida e escrita por `settings.manage`. O campo é opcional no `PUT` — o painel de hoje
 * manda só os quatro campos, e isso não pode desligar a leitura calado.
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import type {
  DeliveryProofCompanySettings,
  DeliveryProofSettingsInput,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  createDeliveryProofSettingsRoutes,
  type DeliveryProofSettingsDependencies,
} from '../../src/trips/presentation/delivery-proof-settings.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

const FIELDS = {
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
} as const

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function context(): AuthenticatedContext<CompanyContext> {
  return {
    identity: {} as AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000103',
      permissions: new Set(['settings.manage'] as never),
      roles: ['company-admin'],
      userId: '00000000-0000-4000-8000-000000000002',
    },
  }
}

function buildDependencies(stored: DeliveryProofCompanySettings): {
  readonly dependencies: DeliveryProofSettingsDependencies
  readonly saved: DeliveryProofSettingsInput[]
} {
  const saved: DeliveryProofSettingsInput[] = []
  return {
    dependencies: {
      listOverrides: NOT_CALLED,
      readSettings: async () => stored,
      replaceOverrides: NOT_CALLED,
      saveSettings: async (input) => {
        saved.push(input.settings)
        return { ...stored, ...input.settings }
      },
    },
    saved,
  }
}

function routeOf(
  dependencies: DeliveryProofSettingsDependencies,
  method: string,
): ReturnType<typeof createDeliveryProofSettingsRoutes>[number] {
  const route = createDeliveryProofSettingsRoutes(dependencies).find(
    (candidate) =>
      candidate.method === method && candidate.pathname === '/company-settings/delivery-proof',
  )
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return route
}

function putRequest(body: object): Request {
  return new Request('http://localhost/company-settings/delivery-proof', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('canhoto_ocr_enabled na configuração do comprovante (spec 156 T13, ADR-0069 §6)', () => {
  it('o GET devolve o interruptor ao lado dos quatro campos', async () => {
    const { dependencies } = buildDependencies({ ...FIELDS, canhotoOcrEnabled: true })

    const response = await routeOf(dependencies, 'GET').execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: new Request('http://localhost/company-settings/delivery-proof'),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { ...FIELDS, canhotoOcrEnabled: true } })
  })

  it('o PUT com o interruptor repassa o valor ao repositório', async () => {
    const { dependencies, saved } = buildDependencies({ ...FIELDS, canhotoOcrEnabled: false })

    const response = await routeOf(dependencies, 'PUT').execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: putRequest({ ...FIELDS, canhotoOcrEnabled: true }),
    })

    expect(response.status).toBe(200)
    expect(saved).toEqual([{ ...FIELDS, canhotoOcrEnabled: true }])
    expect(await response.json()).toEqual({ data: { ...FIELDS, canhotoOcrEnabled: true } })
  })

  it('o PUT sem o interruptor não o manda ao repositório — ausente é "não mexe"', async () => {
    const { dependencies, saved } = buildDependencies({ ...FIELDS, canhotoOcrEnabled: true })

    await routeOf(dependencies, 'PUT').execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: putRequest(FIELDS),
    })

    expect(saved).toEqual([FIELDS])
    expect(Object.hasOwn(saved[0]!, 'canhotoOcrEnabled')).toBe(false)
  })

  it('o PUT com interruptor que não é booleano é 400', async () => {
    const { dependencies } = buildDependencies({ ...FIELDS, canhotoOcrEnabled: false })

    try {
      await routeOf(dependencies, 'PUT').execute({
        context: context(),
        correlationId: 'correlation-1',
        pathParameters: {},
        request: putRequest({ ...FIELDS, canhotoOcrEnabled: 'true' }),
      })
      throw new Error('EXPECTED_API_ERROR')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(400)
    }
  })

  it('as rotas da configuração continuam em settings.manage', () => {
    const { dependencies } = buildDependencies({ ...FIELDS, canhotoOcrEnabled: false })

    for (const method of ['GET', 'PUT']) {
      expect(routeOf(dependencies, method).policy).toEqual({
        permission: 'settings.manage',
        scope: 'company',
      })
    }
  })
})

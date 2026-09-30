/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 (RF-C1-C4, RF-D1): a exceção de comprovante por contratante convive com a exceção por
 * destinatário, com o destinatário vencendo (P4 do spec.md). Escrito antes da implementação — as
 * duas seções abaixo ainda não existem em `delivery-proof-settings.policy.ts` nem
 * `delivery-proof-settings.routes.ts`.
 */
import { describe, expect, it } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  resolveDeliveryProofSettings,
  resolveProofSettingsForRecipient,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import {
  createDeliveryProofSettingsRoutes,
  type DeliveryProofSettingsDependencies,
} from '../../src/trips/presentation/delivery-proof-settings.routes.js'
import type {
  DeliveryProofSettingsContractorOverride,
  DeliveryProofSettingsContractorOverrideInput,
} from '../../src/trips/infrastructure/drizzle-delivery-proof-settings.repository.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000010'
const OTHER_CONTRACTOR_ID = '00000000-0000-4000-8000-000000000011'
const CONTRACTOR_OVERRIDES_PATH = '/company-settings/delivery-proof-contractor-overrides'

const GENERAL: DeliveryProofFieldSettings = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'optional',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}
const CONTRACTOR_OVERRIDE: DeliveryProofFieldSettings = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'off',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}
const RECIPIENT_OVERRIDE: DeliveryProofFieldSettings = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'required',
  receivedBy: 'optional',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
}

describe('a resolução do comprovante em 3 camadas (spec 218 RF-C3, RF-D1)', () => {
  it('nenhum override: vale a geral', () => {
    expect(
      resolveDeliveryProofSettings({
        contractorOverride: null,
        general: GENERAL,
        recipientOverride: null,
      }),
    ).toEqual(GENERAL)
  })

  it('só contratante: ele vence a geral', () => {
    expect(
      resolveDeliveryProofSettings({
        contractorOverride: CONTRACTOR_OVERRIDE,
        general: GENERAL,
        recipientOverride: null,
      }),
    ).toEqual(CONTRACTOR_OVERRIDE)
  })

  it('só destinatário: ele vence a geral', () => {
    expect(
      resolveDeliveryProofSettings({
        contractorOverride: null,
        general: GENERAL,
        recipientOverride: RECIPIENT_OVERRIDE,
      }),
    ).toEqual(RECIPIENT_OVERRIDE)
  })

  it('P4 do spec.md: os dois presentes, o destinatário vence o contratante', () => {
    expect(
      resolveDeliveryProofSettings({
        contractorOverride: CONTRACTOR_OVERRIDE,
        general: GENERAL,
        recipientOverride: RECIPIENT_OVERRIDE,
      }),
    ).toEqual(RECIPIENT_OVERRIDE)
  })
})

describe('resolveProofSettingsForRecipient com o contratante (spec 218)', () => {
  it('resolve pelo contratante quando não há exceção do destinatário', () => {
    const lookup = {
      general: GENERAL,
      overridesByContractorId: new Map([['contractor-alfa', CONTRACTOR_OVERRIDE]]),
      overridesByTaxId: new Map<string, DeliveryProofFieldSettings>(),
    }

    expect(
      resolveProofSettingsForRecipient({
        contractorId: 'contractor-alfa',
        lookup,
        recipientTaxId: '',
      }),
    ).toEqual(CONTRACTOR_OVERRIDE)
  })

  it('P4: o destinatário vence o contratante quando as duas exceções se aplicam', () => {
    const lookup = {
      general: GENERAL,
      overridesByContractorId: new Map([['contractor-alfa', CONTRACTOR_OVERRIDE]]),
      overridesByTaxId: new Map([['mercado-central', RECIPIENT_OVERRIDE]]),
    }

    expect(
      resolveProofSettingsForRecipient({
        contractorId: 'contractor-alfa',
        lookup,
        recipientTaxId: 'mercado-central',
      }),
    ).toEqual(RECIPIENT_OVERRIDE)
  })
})

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

const NOT_CALLED = () => {
  throw new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')
}

function baseDependencies(): DeliveryProofSettingsDependencies {
  return {
    listContractorOverrides: NOT_CALLED,
    listOverrides: NOT_CALLED,
    readSettings: NOT_CALLED,
    replaceContractorOverrides: NOT_CALLED,
    replaceOverrides: NOT_CALLED,
    saveSettings: NOT_CALLED,
  }
}

function routeOf(
  dependencies: DeliveryProofSettingsDependencies,
  method: string,
): ReturnType<typeof createDeliveryProofSettingsRoutes>[number] {
  const route = createDeliveryProofSettingsRoutes(dependencies).find(
    (candidate) => candidate.method === method && candidate.pathname === CONTRACTOR_OVERRIDES_PATH,
  )
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  return route
}

function putRequest(body: object): Request {
  return new Request(`http://localhost${CONTRACTOR_OVERRIDES_PATH}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('rotas de exceção por contratante (spec 218 RF-C1, RF-C4)', () => {
  it('GET devolve as exceções gravadas', async () => {
    const overrides: readonly DeliveryProofSettingsContractorOverride[] = [
      { ...CONTRACTOR_OVERRIDE, contractorId: CONTRACTOR_ID },
    ]
    const dependencies = {
      ...baseDependencies(),
      listContractorOverrides: async () => overrides,
    }

    const response = await routeOf(dependencies, 'GET').execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: new Request(`http://localhost${CONTRACTOR_OVERRIDES_PATH}`),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { overrides } })
  })

  it('PUT feliz repassa o corpo inteiro ao repositório e devolve o resultado', async () => {
    const saved: DeliveryProofSettingsContractorOverrideInput[][] = []
    const overrides: readonly DeliveryProofSettingsContractorOverride[] = [
      { ...CONTRACTOR_OVERRIDE, contractorId: CONTRACTOR_ID },
    ]
    const dependencies = {
      ...baseDependencies(),
      listContractorOverrides: async () => overrides,
      replaceContractorOverrides: async (input: {
        readonly overrides: readonly DeliveryProofSettingsContractorOverrideInput[]
      }) => {
        saved.push([...input.overrides])
      },
    }

    const response = await routeOf(dependencies, 'PUT').execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: putRequest({ overrides: [{ ...CONTRACTOR_OVERRIDE, contractorId: CONTRACTOR_ID }] }),
    })

    expect(response.status).toBe(200)
    expect(saved).toEqual([[{ ...CONTRACTOR_OVERRIDE, contractorId: CONTRACTOR_ID }]])
    expect(await response.json()).toEqual({ data: { overrides } })
  })

  it('PUT com contratante fora do tenant responde 404, nunca 500 cru de FK', async () => {
    const dependencies = {
      ...baseDependencies(),
      replaceContractorOverrides: async () => {
        throw new ApiError({
          code: 'CONTRACTOR_NOT_FOUND',
          message: 'Contractor was not found',
          status: 404,
        })
      },
    }

    try {
      await routeOf(dependencies, 'PUT').execute({
        context: context(),
        correlationId: 'correlation-1',
        pathParameters: {},
        request: putRequest({
          overrides: [{ ...CONTRACTOR_OVERRIDE, contractorId: OTHER_CONTRACTOR_ID }],
        }),
      })
      throw new Error('EXPECTED_API_ERROR')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(404)
    }
  })

  it('as duas rotas exigem settings.manage, como as irmãs de destinatário', () => {
    const dependencies = baseDependencies()

    for (const method of ['GET', 'PUT']) {
      expect(routeOf(dependencies, method).policy).toEqual({
        permission: 'settings.manage',
        scope: 'company',
      })
    }
  })
})

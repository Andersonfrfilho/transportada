/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 242 (spec 164 RF1/T21): o cadastro do tipo de ocorrência lê e grava `redeliveryPolicy`.
 * Ausente é "não mexa" — o schema não pode fabricar valor, ou o UPDATE zeraria a política.
 */
import { describe, expect, test } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

type Dependencies = Parameters<typeof createTripRoutes>[0]

const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'

function baseBody(): Record<string, unknown> {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    name: 'Recusa total',
    notifies: false,
    occurrenceTypeId: OCCURRENCE_TYPE_ID,
    stage: 'delivery',
  }
}

function putRequest(body: unknown): Request {
  return new Request(`http://localhost${OCCURRENCE_TYPES_PATH}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  })
}

describe('o cadastro do tipo aceita "redeliveryPolicy" (spec 242)', () => {
  test.each(['allowed', 'blocked', 'unset'] as const)(
    '%s é aceito e chega ao resultado',
    async (policy) => {
      const parsed = await parseOccurrenceTypeRequest(
        putRequest({ ...baseBody(), redeliveryPolicy: policy }),
      )
      expect(parsed.redeliveryPolicy).toBe(policy)
    },
  )

  test('ausente é aceito e fica ausente — nunca vira "unset"', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(baseBody()))
    expect('redeliveryPolicy' in parsed).toBe(false)
    expect(parsed.redeliveryPolicy).toBeUndefined()
  })

  test('valor fora do vocabulário é recusado', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ ...baseBody(), redeliveryPolicy: 'authorized' })),
    ).rejects.toThrow()
  })

  test('chave desconhecida continua recusada (o schema segue estrito)', async () => {
    await expect(
      parseOccurrenceTypeRequest(putRequest({ ...baseBody(), redeliveryPolicyX: 'allowed' })),
    ).rejects.toThrow()
  })
})

describe('PUT /company-settings/occurrence-types com o corpo do painel (spec 242)', () => {
  function context(): AuthenticatedContext<CompanyContext> {
    return {
      identity: {} as AuthenticatedIdentity,
      scope: {
        companyId: '00000000-0000-4000-8000-000000000001',
        kind: 'company',
        membershipId: '00000000-0000-4000-8000-000000000103',
        permissions: new Set(['settings.manage'] as never),
        roles: ['company-admin'],
        userId: '00000000-0000-4000-8000-000000000002',
      },
    }
  }

  async function putThroughRoute(
    body: unknown,
  ): Promise<{ saved: Record<string, unknown>; status: number }> {
    let saved: Record<string, unknown> = {}
    const dependencies = new Proxy({} as Dependencies, {
      get: (_target, property) =>
        property === 'saveOccurrenceType'
          ? {
              execute: async (input: Record<string, unknown>) => {
                saved = input
                return { id: OCCURRENCE_TYPE_ID }
              },
            }
          : { execute: () => Promise.reject(new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')) },
    })
    const route = createTripRoutes(dependencies).find(
      (candidate) => candidate.method === 'PUT' && candidate.pathname === OCCURRENCE_TYPES_PATH,
    )
    if (route === undefined) throw new Error('ROUTE_NOT_FOUND')

    const response = await route.execute({
      context: context(),
      correlationId: 'correlation-1',
      pathParameters: {},
      request: putRequest(body),
    })
    return { saved, status: response.status }
  }

  test('200 e o campo chega ao caso de uso', async () => {
    const { saved, status } = await putThroughRoute({ ...baseBody(), redeliveryPolicy: 'blocked' })
    expect(status).toBe(200)
    expect(saved.redeliveryPolicy).toBe('blocked')
  })

  test('200 sem o campo, e o caso de uso o recebe ausente', async () => {
    const { saved, status } = await putThroughRoute(baseBody())
    expect(status).toBe(200)
    expect(saved.redeliveryPolicy).toBeUndefined()
  })
})

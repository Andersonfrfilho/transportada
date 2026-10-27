/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T3b (RF9): o cadastro do tipo grava `clientEmailType` (`off` ou um tipo de e-mail do cliente), ausente é
 * "não mexa" e o vocabulário fora da lista é 400; `off` é o padrão e o envio ao cliente é recusado com 409. Spec 279 T3c
 * (RF10): o mesmo para `clientEmailSendMode` (`manual` padrão, `automatic`).
 */
import { describe, expect, test } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import {
  CLIENT_EMAIL_SEND_MODE_DEFAULT,
  CLIENT_EMAIL_SEND_MODES,
  CLIENT_EMAIL_TYPE_DEFAULT,
  CLIENT_EMAIL_TYPES,
  DELIVERY_CLIENT_EMAIL_PURPOSES,
} from '../../src/shared/delivery-client-email.constant.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { OccurrenceClientEmailOffError } from '../../src/trips/domain/occurrence-client-email.error.js'
import { resolveClientEmailPurpose } from '../../src/trips/domain/occurrence-client-email.policy.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

type Dependencies = Parameters<typeof createTripRoutes>[0]

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'

function baseBody(): Record<string, unknown> {
  return {
    active: true,
    emailTemplateKey: null,
    flow: 'document',
    name: 'Cliente pediu prorrogação do boleto',
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

async function putThroughRoute(body: unknown): Promise<SaveOccurrenceTypeValues[]> {
  const savedValues: SaveOccurrenceTypeValues[] = []
  const dependencies = new Proxy({} as Dependencies, {
    get: (_target, property) =>
      property === 'saveOccurrenceType'
        ? {
            execute: (input: SaveOccurrenceTypeValues & { readonly context: CompanyContext }) =>
              saveOccurrenceTypeWithTemplate({
                companyId: input.context.companyId,
                findCurrentType: async () => null,
                save: async (values) => {
                  savedValues.push(values)
                  return {
                    active: true,
                    allowsMultipleItems: true,
                    emailTemplateKey: null,
                    id: OCCURRENCE_TYPE_ID,
                    itemsMode: 'optional',
                    name: values.name,
                    notifies: false,
                    redeliveryPolicy: 'unset',
                    stage: values.stage,
                  } satisfies OccurrenceTypeRecord
                },
                templates: {
                  findContractorTemplate: async () => null,
                  hasActiveEmailTemplate: async () => true,
                },
                values: input,
              }),
          }
        : { execute: () => Promise.reject(new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')) },
  })
  const route = createTripRoutes(dependencies).find(
    (candidate) => candidate.method === 'PUT' && candidate.pathname === OCCURRENCE_TYPES_PATH,
  )
  if (route === undefined) throw new Error('ROUTE_NOT_FOUND')
  await route.execute({
    context: context(),
    correlationId: 'correlation-1',
    pathParameters: {},
    request: putRequest(body),
  })
  return savedValues
}

describe('o cadastro do tipo aceita "clientEmailType" (spec 279 RF9)', () => {
  test('o vocabulário é "off" mais os tipos de e-mail do cliente, e o padrão é "off"', () => {
    expect(CLIENT_EMAIL_TYPES).toEqual(['off', ...DELIVERY_CLIENT_EMAIL_PURPOSES])
    expect(CLIENT_EMAIL_TYPE_DEFAULT).toBe('off')
  })

  test.each([...CLIENT_EMAIL_TYPES])('%s é aceito e chega ao caso de uso', async (type) => {
    const [saved] = await putThroughRoute({ ...baseBody(), clientEmailType: type })
    expect(saved?.clientEmailType).toBe(type)
  })

  test('ausente fica ausente — nunca vira "off" nem liga o botão', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(baseBody()))
    expect('clientEmailType' in parsed).toBe(false)
    const [saved] = await putThroughRoute(baseBody())
    expect(saved?.clientEmailType).toBeUndefined()
  })

  test('valor fora da lista é 400', async () => {
    const error = await parseOccurrenceTypeRequest(
      putRequest({ ...baseBody(), clientEmailType: 'newsletter' }),
    ).then(
      () => undefined,
      (reason: unknown) => reason as Error & { status: number },
    )
    expect(error?.status).toBe(400)
  })
})

describe('o tipo "off" recusa o envio ao cliente com 409 (spec 279 RF9)', () => {
  test.each([...DELIVERY_CLIENT_EMAIL_PURPOSES])(
    '%s devolve o tipo de e-mail a usar',
    (purpose) => {
      expect(resolveClientEmailPurpose(purpose)).toBe(purpose)
    },
  )

  test('off lança OCCURRENCE_CLIENT_EMAIL_OFF', () => {
    let thrown: unknown
    try {
      resolveClientEmailPurpose('off')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(OccurrenceClientEmailOffError)
    expect((thrown as OccurrenceClientEmailOffError).status).toBe(409)
    expect((thrown as OccurrenceClientEmailOffError).code).toBe('OCCURRENCE_CLIENT_EMAIL_OFF')
  })
})

describe('o cadastro do tipo aceita "clientEmailSendMode" (spec 279 RF10)', () => {
  test('o vocabulário é "manual" e "automatic", e o padrão é "manual"', () => {
    expect(CLIENT_EMAIL_SEND_MODES).toEqual(['manual', 'automatic'])
    expect(CLIENT_EMAIL_SEND_MODE_DEFAULT).toBe('manual')
  })

  test.each([...CLIENT_EMAIL_SEND_MODES])('%s é aceito e chega ao caso de uso', async (mode) => {
    const [saved] = await putThroughRoute({
      ...baseBody(),
      clientEmailSendMode: mode,
      clientEmailType: 'boleto',
    })
    expect(saved?.clientEmailSendMode).toBe(mode)
  })

  test('ausente fica ausente — nunca liga o envio automático', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(baseBody()))
    expect('clientEmailSendMode' in parsed).toBe(false)
    const [saved] = await putThroughRoute(baseBody())
    expect(saved?.clientEmailSendMode).toBeUndefined()
  })

  test('valor fora da lista é 400', async () => {
    const error = await parseOccurrenceTypeRequest(
      putRequest({ ...baseBody(), clientEmailSendMode: 'sometimes' }),
    ).then(
      () => undefined,
      (reason: unknown) => reason as Error & { status: number },
    )
    expect(error?.status).toBe(400)
  })
})

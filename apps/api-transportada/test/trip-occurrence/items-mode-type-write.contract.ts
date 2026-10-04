/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (RF4, RF11, CA07, CA09, CA10): o cadastro do tipo grava `itemsMode`, ausente é "não
 * mexa", `required` é recusado até a 239, e tipo sem produto (`off`) nunca abre tratativa — o
 * estado RESULTANTE é validado, lendo o valor gravado quando o campo vem ausente.
 */
import { describe, expect, test } from 'bun:test'

import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { OccurrenceTypeRecord } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import {
  saveOccurrenceTypeWithTemplate,
  type SaveOccurrenceTypeValues,
} from '../../src/trips/application/save-occurrence-type.use-case.js'
import { OccurrenceTypeItemsOffRedeliveryPolicyError } from '../../src/trips/domain/trip.error.js'
import { parseOccurrenceTypeRequest } from '../../src/trips/presentation/occurrence.schema.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'

type Dependencies = Parameters<typeof createTripRoutes>[0]
type StoredShape = Pick<OccurrenceTypeRecord, 'itemsMode' | 'redeliveryPolicy'>

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OCCURRENCE_TYPE_ID = '00000000-0000-4000-8000-0000000000e1'
const OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'
const OFF_REDELIVERY_CODE = 'OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY'

function baseBody(): Record<string, unknown> {
  return {
    active: true,
    emailBody: '',
    emailSubject: '',
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

function buildRecord(values: SaveOccurrenceTypeValues, stored?: StoredShape): OccurrenceTypeRecord {
  return {
    active: true,
    allowsMultipleItems: true,
    emailBody: '',
    emailSubject: '',
    emailTemplateKey: null,
    id: OCCURRENCE_TYPE_ID,
    itemsMode: values.itemsMode ?? stored?.itemsMode ?? 'optional',
    name: values.name,
    notifies: false,
    redeliveryPolicy: values.redeliveryPolicy ?? stored?.redeliveryPolicy ?? 'unset',
    stage: values.stage,
  }
}

/** O mesmo encadeamento de `main.ts`: o caso de uso real, com o tipo gravado e a base falsa. */
function createSaveDependency(stored: StoredShape | null): {
  readonly dependencies: Dependencies
  readonly savedValues: SaveOccurrenceTypeValues[]
} {
  const savedValues: SaveOccurrenceTypeValues[] = []
  const dependencies = new Proxy({} as Dependencies, {
    get: (_target, property) =>
      property === 'saveOccurrenceType'
        ? {
            execute: (input: SaveOccurrenceTypeValues & { readonly context: CompanyContext }) =>
              saveOccurrenceTypeWithTemplate({
                companyId: input.context.companyId,
                findCurrentType: async () => stored,
                save: async (values) => {
                  savedValues.push(values)
                  return buildRecord(values, stored ?? undefined)
                },
                templates: { hasActiveEmailTemplate: async () => true },
                values: input,
              }),
          }
        : { execute: () => Promise.reject(new Error('ROUTE_DEPENDENCY_NOT_EXPECTED')) },
  })
  return { dependencies, savedValues }
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

async function putThroughRoute(
  stored: StoredShape | null,
  body: unknown,
): Promise<{ savedValues: SaveOccurrenceTypeValues[]; status: number }> {
  const { dependencies, savedValues } = createSaveDependency(stored)
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
  return { savedValues, status: response.status }
}

async function expectRejection(
  promise: Promise<unknown>,
): Promise<{ readonly code: string; readonly status: number }> {
  const error: unknown = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
  if (!(error instanceof Error)) throw new Error('A rejeição era esperada')
  return error as Error & { code: string; status: number }
}

describe('o cadastro do tipo aceita "itemsMode" (spec 241 RF4, CA07)', () => {
  test.each(['off', 'optional'] as const)('%s é aceito e chega ao resultado', async (mode) => {
    const parsed = await parseOccurrenceTypeRequest(putRequest({ ...baseBody(), itemsMode: mode }))
    expect(parsed.itemsMode).toBe(mode)
  })

  test('ausente fica ausente — nunca vira "optional" nem "off"', async () => {
    const parsed = await parseOccurrenceTypeRequest(putRequest(baseBody()))
    expect('itemsMode' in parsed).toBe(false)
  })

  test('"required" volta 400 até a 239, e o vocabulário fora da escrita também', async () => {
    for (const mode of ['required', 'always']) {
      const error = await expectRejection(
        parseOccurrenceTypeRequest(putRequest({ ...baseBody(), itemsMode: mode })),
      )
      expect(error.status).toBe(400)
    }
  })
})

describe('o estado resultante "off" exige política "unset" (spec 241 RF11, CA09)', () => {
  const cases: {
    body: Record<string, unknown>
    label: string
    stored: null | StoredShape
  }[] = [
    {
      body: { itemsMode: 'off', redeliveryPolicy: 'blocked' },
      label: 'off com política blocked no corpo',
      stored: null,
    },
    {
      body: { itemsMode: 'off', redeliveryPolicy: 'allowed' },
      label: 'off com política allowed no corpo',
      stored: { itemsMode: 'optional', redeliveryPolicy: 'unset' },
    },
    {
      body: { itemsMode: 'off' },
      label: 'off no corpo e política gravada blocked (campo ausente lê o gravado)',
      stored: { itemsMode: 'optional', redeliveryPolicy: 'blocked' },
    },
    {
      body: { redeliveryPolicy: 'allowed' },
      label: 'política allowed no corpo e tipo gravado off (itemsMode ausente lê o gravado)',
      stored: { itemsMode: 'off', redeliveryPolicy: 'unset' },
    },
  ]

  test.each(cases)('$label: 422 com código estável e nada gravado', async (testCase) => {
    const { dependencies, savedValues } = createSaveDependency(testCase.stored)
    const route = createTripRoutes(dependencies).find(
      (candidate) => candidate.method === 'PUT' && candidate.pathname === OCCURRENCE_TYPES_PATH,
    )
    if (route === undefined) throw new Error('ROUTE_NOT_FOUND')

    const error = await expectRejection(
      route.execute({
        context: context(),
        correlationId: 'correlation-1',
        pathParameters: {},
        request: putRequest({ ...baseBody(), ...testCase.body }),
      }),
    )

    expect(error).toBeInstanceOf(OccurrenceTypeItemsOffRedeliveryPolicyError)
    expect(error.status).toBe(422)
    expect(error.code).toBe(OFF_REDELIVERY_CODE)
    expect(savedValues).toHaveLength(0)
  })

  test('off com unset grava; optional com política de reentrega grava', async () => {
    const off = await putThroughRoute(null, {
      ...baseBody(),
      itemsMode: 'off',
      redeliveryPolicy: 'unset',
    })
    const optional = await putThroughRoute(null, {
      ...baseBody(),
      itemsMode: 'optional',
      redeliveryPolicy: 'blocked',
    })

    expect(off.status).toBe(200)
    expect(off.savedValues).toHaveLength(1)
    expect(optional.status).toBe(200)
    expect(optional.savedValues).toHaveLength(1)
  })

  test('campos ausentes com tipo gravado conforme gravam sem tocar nos dois', async () => {
    const { savedValues, status } = await putThroughRoute(
      { itemsMode: 'off', redeliveryPolicy: 'unset' },
      baseBody(),
    )

    expect(status).toBe(200)
    expect(savedValues).toHaveLength(1)
    expect(savedValues[0]?.itemsMode).toBeUndefined()
    expect(savedValues[0]?.redeliveryPolicy).toBeUndefined()
  })
})

describe('o PUT que cria a prorrogação do boleto (spec 241 CA10)', () => {
  test('off, sem foto, sem soltar a nota e sem política: grava com o corpo da 208', async () => {
    const { savedValues, status } = await putThroughRoute(null, {
      ...baseBody(),
      attachmentMode: 'off',
      itemsMode: 'off',
      leavesDocumentBehind: false,
      occurrenceTypeId: null,
      redeliveryPolicy: 'unset',
    })

    expect(status).toBe(200)
    expect(savedValues).toHaveLength(1)
    expect(savedValues[0]?.itemsMode).toBe('off')
    expect(savedValues[0]?.attachmentMode).toBe('off')
    expect(savedValues[0]?.leavesDocumentBehind).toBe(false)
    expect(savedValues[0]?.redeliveryPolicy).toBe('unset')
    expect(savedValues[0]?.flow).toBe('document')
    expect(savedValues[0]?.stage).toBe('delivery')
  })

  test('o código do erro é estável e o status é 422', () => {
    const error = new OccurrenceTypeItemsOffRedeliveryPolicyError()

    expect(error.code).toBe(OFF_REDELIVERY_CODE)
    expect(error.status).toBe(422)
  })
})

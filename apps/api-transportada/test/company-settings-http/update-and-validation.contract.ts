/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_SETTINGS,
  OTHER_COMPANY_ID,
} from '../fixtures/company-settings-application.fixture'
import {
  createCompanySettingsHttpFixture,
  GENERATED_CORRELATION_ID,
  patchSettingsRequest,
  responseApiError,
} from '../fixtures/company-settings-http.fixture'
import {
  EXPECTED_HTTP_SETTINGS_DATA,
  settingsBodyWith,
  VALID_HTTP_SETTINGS_BODY,
  VALID_IDEMPOTENCY_KEY,
} from '../fixtures/company-settings-http-payload.fixture'

describe('PATCH /company-settings HTTP contract', () => {
  test('parses one strict DTO and passes generated correlation plus authenticated context', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const request = patchSettingsRequest({
      query: `?companyId=${OTHER_COMPANY_ID}`,
    })
    request.headers.set('x-company-id', OTHER_COMPANY_ID)

    const response = await fixture.handle(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: EXPECTED_HTTP_SETTINGS_DATA })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(request.headers.has('x-correlation-id')).toBe(false)
    expect(fixture.updateCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: GENERATED_CORRELATION_ID,
        idempotencyKey: VALID_IDEMPOTENCY_KEY,
        settings: COMPANY_SETTINGS,
      },
    ])
  })

  test('parses an optimistic version only from a canonical decimal string', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(
      patchSettingsRequest({
        body: settingsBodyWith({ path: 'expectedVersion', value: '42' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.expectedVersion).toBe(42n)
  })

  test('propagates one valid client correlation ID to response and audit input', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const correlationId = 'client-settings-request_123'

    const response = await fixture.handle(patchSettingsRequest({ correlationId }))

    expect(response.status).toBe(200)
    expect(response.headers.get('x-correlation-id')).toBe(correlationId)
    expect(fixture.updateCalls[0]?.correlationId).toBe(correlationId)
  })

  test.each([
    ['companyId', { ...VALID_HTTP_SETTINGS_BODY, companyId: OTHER_COMPANY_ID }],
    ['top-level secret', { ...VALID_HTTP_SETTINGS_BODY, password: 'must-not-pass' }],
    ['profile property', settingsBodyWith({ path: 'profile.unknown', value: 'value' })],
    ['cte property', settingsBodyWith({ path: 'cte.model', value: 'cte' })],
    ['cteRetry property', settingsBodyWith({ path: 'cteRetry.jitter', value: true })],
    ['mdfe property', settingsBodyWith({ path: 'mdfe.insurerAddress', value: 'value' })],
  ])('rejects unknown %s before the use case', async (_name, body) => {
    const fixture = await createCompanySettingsHttpFixture()
    const response = await fixture.handle(patchSettingsRequest({ body }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  // O manifesto MDF-e copia o RNTRC do perfil e a coluna só aceita 8 dígitos — recusar aqui evita
  // um 500 lá na frente, na criação do manifesto.
  test.each([
    ['an RNTRC with letters', settingsBodyWith({ path: 'profile.rntrc', value: 'RNTRC123' })],
    [
      'an RNTRC shorter than eight digits',
      settingsBodyWith({ path: 'profile.rntrc', value: '5815104' }),
    ],
    [
      'an RNTRC longer than eight digits',
      settingsBodyWith({ path: 'profile.rntrc', value: '581510441' }),
    ],
  ])('rejects %s before the use case', async (_name, body) => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(patchSettingsRequest({ body }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
  })
})

describe('PATCH /company-settings CT-e retry policy contract', () => {
  test('forwards the parsed retry policy to the use case instead of the domain default', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(patchSettingsRequest())

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.cteRetry).toEqual(COMPANY_SETTINGS.cteRetry)
    expect(await response.json()).toEqual({ data: EXPECTED_HTTP_SETTINGS_DATA })
  })

  test.each([
    ['a missing retry block', bodyWithoutCteRetry()],
    [
      'maxAttempts below the domain floor',
      settingsBodyWith({ path: 'cteRetry.maxAttempts', value: 0 }),
    ],
    [
      'maxAttempts above the domain ceiling',
      settingsBodyWith({ path: 'cteRetry.maxAttempts', value: 11 }),
    ],
    ['a fractional maxAttempts', settingsBodyWith({ path: 'cteRetry.maxAttempts', value: 2.5 })],
    [
      'a decimal string maxAttempts',
      settingsBodyWith({ path: 'cteRetry.maxAttempts', value: '3' }),
    ],
    ['an empty backoff curve', settingsBodyWith({ path: 'cteRetry.backoffSeconds', value: [] })],
    [
      'a backoff curve above the step ceiling',
      settingsBodyWith({
        path: 'cteRetry.backoffSeconds',
        value: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      }),
    ],
    [
      'a non-positive backoff step',
      settingsBodyWith({ path: 'cteRetry.backoffSeconds', value: [5, 0, 300] }),
    ],
    [
      'a fractional backoff step',
      settingsBodyWith({ path: 'cteRetry.backoffSeconds', value: [5, 1.5] }),
    ],
    [
      'a decimal string backoff step',
      settingsBodyWith({ path: 'cteRetry.backoffSeconds', value: ['5', '30'] }),
    ],
  ])('rejects %s before the use case', async (_name, body) => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(patchSettingsRequest({ body }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
  })
})

// Sem seguradora e sem banco o MDF-e do prestador de serviço é rejeitado pela SEFAZ (698, 580)
describe('PATCH /company-settings MDF-e defaults contract', () => {
  test('forwards the insurer and the bank the manifest payload needs', async () => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(patchSettingsRequest())

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.mdfe).toEqual(COMPANY_SETTINGS.mdfe)
    expect(await response.json()).toEqual({ data: EXPECTED_HTTP_SETTINGS_DATA })
  })

  test('accepts an unconfigured MDF-e block so the CT-e only tenant keeps saving', async () => {
    const fixture = await createCompanySettingsHttpFixture()
    const body = settingsBodyWith({
      path: 'mdfe',
      value: {
        bankBranch: '',
        bankCode: '',
        insurancePolicy: '',
        insuranceResponsibility: '',
        insurerName: '',
        insurerTaxId: '',
        pixKey: '',
      },
    })

    const response = await fixture.handle(patchSettingsRequest({ body }))

    expect(response.status).toBe(200)
    expect(fixture.updateCalls[0]?.settings.mdfe.insuranceResponsibility).toBe('')
  })

  test.each([
    ['a missing MDF-e block', bodyWithoutMdfe()],
    [
      'a responsibility outside respSeg',
      settingsBodyWith({ path: 'mdfe.insuranceResponsibility', value: '3' }),
    ],
    [
      'an insurer tax id that is not CPF or CNPJ',
      settingsBodyWith({ path: 'mdfe.insurerTaxId', value: '1122233' }),
    ],
    [
      'a bank code that is not three digits',
      settingsBodyWith({ path: 'mdfe.bankCode', value: '3411' }),
    ],
    ['a non-numeric bank branch', settingsBodyWith({ path: 'mdfe.bankBranch', value: '12A4' })],
  ])('rejects %s before the use case', async (_name, body) => {
    const fixture = await createCompanySettingsHttpFixture()

    const response = await fixture.handle(patchSettingsRequest({ body }))

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).error.code).toBe('INVALID_REQUEST')
    expect(fixture.updateCalls).toHaveLength(0)
  })
})

function bodyWithoutMdfe(): unknown {
  const body: Record<string, unknown> = { ...VALID_HTTP_SETTINGS_BODY }
  delete body.mdfe
  return body
}

function bodyWithoutCteRetry(): unknown {
  const body: Record<string, unknown> = { ...VALID_HTTP_SETTINGS_BODY }
  delete body.cteRetry
  return body
}

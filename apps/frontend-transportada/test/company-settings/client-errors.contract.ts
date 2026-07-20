/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_RESPONSE,
  COMPANY_SETTINGS_UPDATE,
  SAFE_CERTIFICATE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  type CompanySettingsUpdateContract,
  loadFutureModule,
} from './company-settings.fixture'

describe('company settings client error boundary contract', () => {
  test('reduces server details to a stable client error', async () => {
    const client = await createClient(() =>
      Promise.resolve(
        Response.json(
          { error: { message: 'synthetic internal provider detail' } },
          { status: 500 },
        ),
      ),
    )

    const error = await client.getSettings().catch((caught: unknown) => caught)
    expect(error).toEqual(expect.objectContaining({ message: 'COMPANY_SETTINGS_REQUEST_FAILED' }))
    expect(JSON.stringify(error)).not.toContain('synthetic internal provider detail')
  })

  test('reduces network failures to the same stable client error', async () => {
    const client = await createClient(() =>
      Promise.reject(new Error('synthetic network implementation detail')),
    )
    const error = await client.getSettings().catch(identity)
    expect(error).toEqual(expect.objectContaining({ message: 'COMPANY_SETTINGS_REQUEST_FAILED' }))
    expect(JSON.stringify(error)).not.toContain('synthetic network implementation detail')
  })

  test('enforces the exact safe certificate metadata allowlist', async () => {
    const forbiddenFields = [
      'ciphertext',
      'companyId',
      'cpf',
      'fingerprint',
      'issuer',
      'keyId',
      'nonce',
      'providerMessage',
      'subject',
      'tag',
      'unexpected',
    ] as const
    for (const field of forbiddenFields) {
      const client = await createClient(() =>
        Promise.resolve(
          Response.json({
            data: [{ ...SAFE_CERTIFICATE, [field]: 'synthetic-secret' }],
            page: { nextCursor: null },
          }),
        ),
      )
      const error = await client.listCertificates({ limit: 25 }).catch(identity)
      expect(error).toEqual(
        expect.objectContaining({ message: 'COMPANY_SETTINGS_RESPONSE_INVALID' }),
      )
      expect(JSON.stringify(error)).not.toContain('synthetic-secret')
    }
  })

  test('rejects non-canonical certificate identifiers, dates and versions', async () => {
    const unsafeCertificates = [
      { ...SAFE_CERTIFICATE, expiresAt: '2030-01-01' },
      { ...SAFE_CERTIFICATE, id: 'not-a-uuid' },
      { ...SAFE_CERTIFICATE, validFrom: '2026-01-01' },
      { ...SAFE_CERTIFICATE, version: '01' },
    ]
    for (const certificate of unsafeCertificates) {
      const client = await createClient(() =>
        Promise.resolve(Response.json({ data: [certificate], page: { nextCursor: null } })),
      )
      const error = await client.listCertificates({ limit: 25 }).catch(identity)
      expect(error).toEqual(
        expect.objectContaining({ message: 'COMPANY_SETTINGS_RESPONSE_INVALID' }),
      )
    }
  })

  test('rejects tenant identity and extra fields in settings responses', async () => {
    const client = await createClient(() =>
      Promise.resolve(
        Response.json({
          data: { ...COMPANY_SETTINGS_RESPONSE.data, companyId: 'synthetic-tenant' },
        }),
      ),
    )
    const error = await client.getSettings().catch(identity)
    expect(error).toEqual(expect.objectContaining({ message: 'COMPANY_SETTINGS_RESPONSE_INVALID' }))
    expect(JSON.stringify(error)).not.toContain('synthetic-tenant')
  })

  test('validates exact nested CT-e and profile response DTOs', async () => {
    const unsafeResponses = [
      {
        data: {
          ...COMPANY_SETTINGS_RESPONSE.data,
          cte: { ...COMPANY_SETTINGS_RESPONSE.data.cte, unexpected: 'unsafe' },
        },
      },
      {
        data: {
          ...COMPANY_SETTINGS_RESPONSE.data,
          profile: { ...COMPANY_SETTINGS_RESPONSE.data.profile, legalName: 123 },
        },
      },
    ]
    for (const response of unsafeResponses) {
      const client = await createClient(() => Promise.resolve(Response.json(response)))
      const error = await client.getSettings().catch(identity)
      expect(error).toEqual(
        expect.objectContaining({ message: 'COMPANY_SETTINGS_RESPONSE_INVALID' }),
      )
    }
  })

  test('never forwards a caller-supplied companyId in a settings update', async () => {
    let forwardedBody: unknown
    const client = await createClient(async (request) => {
      forwardedBody = await request.json()
      return Response.json(COMPANY_SETTINGS_RESPONSE)
    })
    const unsafeInput = {
      ...COMPANY_SETTINGS_UPDATE,
      companyId: 'synthetic-tenant',
    } as CompanySettingsUpdateContract

    const result = await client.updateSettings(unsafeInput).catch(identity)
    if (forwardedBody === undefined)
      expect(result).toEqual(
        expect.objectContaining({ message: 'COMPANY_SETTINGS_REQUEST_INVALID' }),
      )
    else expect(forwardedBody).toEqual(COMPANY_SETTINGS_UPDATE)
    expect(JSON.stringify(result)).not.toContain('synthetic-tenant')
  })
})

type Client = {
  readonly getSettings: () => Promise<unknown>
  readonly listCertificates: (input: {
    readonly cursor?: string
    readonly limit: number
  }) => Promise<unknown>
  readonly updateSettings: (input: CompanySettingsUpdateContract) => Promise<unknown>
}

function identity(value: unknown): unknown {
  return value
}

async function createClient(fetch: (request: Request) => Promise<Response>): Promise<Client> {
  const module = await loadFutureModule<ClientModule>(
    '../../src/modules/company-settings/shared/companySettingsClient.service',
  )
  return module.createCompanySettingsClient({
    apiBaseUrl: 'https://transportada.test',
    fetch,
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
  })
}

type ClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => Client
}

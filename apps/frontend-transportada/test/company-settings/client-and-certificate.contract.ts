/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  COMPANY_SETTINGS_RESPONSE,
  COMPANY_SETTINGS_UPDATE,
  DIGITAL_CERTIFICATES_RESPONSE,
  SAFE_CERTIFICATE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
  type CompanySettingsUpdateContract,
  type DigitalCertificatesResponseContract,
  loadFutureModule,
  syntheticCertificateFile,
} from './company-settings.fixture'

describe('company settings client and certificate contract', () => {
  test('uses relative endpoint paths, memory bearer, no-store and safe request payloads', async () => {
    const { createCompanySettingsClient } = await loadFutureModule<CompanySettingsClientModule>(
      '../../src/modules/company-settings/shared/companySettingsClient.service',
    )
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe('https://transportada.test/company-settings')
      expect(request.method).toBe('PATCH')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.cache).toBe('no-store')
      expect(request.headers.get('content-type')).toBe('application/json')
      expect(request.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
      expect(await request.json()).toEqual(COMPANY_SETTINGS_UPDATE)
      return Response.json(COMPANY_SETTINGS_RESPONSE)
    })
    const client = createCompanySettingsClient({
      apiBaseUrl: 'https://transportada.test',
      fetch,
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
    })

    await client.updateSettings(COMPANY_SETTINGS_UPDATE)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('posts certificate multipart with the exact safe headers and path', async () => {
    const { createCompanySettingsClient } = await loadFutureModule<CompanySettingsClientModule>(
      '../../src/modules/company-settings/shared/companySettingsClient.service',
    )
    const fetch = mock(async (request: Request) => {
      expect(request.url).toBe('https://transportada.test/digital-certificates')
      expect(request.method).toBe('POST')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
      expect(request.cache).toBe('no-store')
      expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=.+$/)
      const body = await request.formData()
      expect([...body.keys()]).toEqual(['certificate', 'password', 'purpose'])
      expect(body.get('purpose')).toBe('cte')
      return Response.json({ data: SAFE_CERTIFICATE })
    })
    const client = createCompanySettingsClient({
      apiBaseUrl: 'https://transportada.test',
      fetch,
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
    })
    const formData = new FormData()
    formData.set('certificate', syntheticCertificateFile())
    formData.set('password', 'synthetic-password')
    formData.set('purpose', 'cte')

    await client.replaceCertificate(formData)
  })

  test('reads settings and follows the opaque certificate cursor with no-store GETs', async () => {
    const { createCompanySettingsClient } = await loadFutureModule<CompanySettingsClientModule>(
      '../../src/modules/company-settings/shared/companySettingsClient.service',
    )
    const fetch = mock((request: Request) => {
      expect(request.method).toBe('GET')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.cache).toBe('no-store')
      if (request.url === 'https://transportada.test/company-settings')
        return Promise.resolve(Response.json(COMPANY_SETTINGS_RESPONSE))
      if (request.url === 'https://transportada.test/digital-certificates?limit=25')
        return Promise.resolve(
          Response.json({
            ...DIGITAL_CERTIFICATES_RESPONSE,
            page: { nextCursor: SYNTHETIC_CURSOR },
          }),
        )
      expect(request.url).toBe(
        `https://transportada.test/digital-certificates?limit=25&cursor=${SYNTHETIC_CURSOR}`,
      )
      return Promise.resolve(Response.json(DIGITAL_CERTIFICATES_RESPONSE))
    })
    const client = createCompanySettingsClient({
      apiBaseUrl: 'https://transportada.test',
      fetch,
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
    })

    await client.getSettings()
    const firstPage = await client.listCertificates({ limit: 25 })
    expect(firstPage.page.nextCursor).toBe(SYNTHETIC_CURSOR)
    if (firstPage.page.nextCursor === null) throw new Error('CERTIFICATE_CURSOR_EXPECTED')
    await client.listCertificates({ cursor: firstPage.page.nextCursor, limit: 25 })
  })

  test('builds exact multipart only on submit and clears mutable input state in finally', async () => {
    const { createCertificateUploadController } = await loadFutureModule<CertificateUploadModule>(
      '../../src/modules/company-settings/hooks/useCertificateUpload.hook',
    )
    const clearFileInput = mock(() => undefined)
    const clearPasswordInput = mock(() => undefined)
    let submittedBody: FormData | undefined
    const replaceCertificate = mock((body: FormData) => {
      submittedBody = body
      expect([...body.keys()]).toEqual(['certificate', 'password', 'purpose'])
      expect(body.get('purpose')).toBe('cte')
      expect(body.get('certificate')).toBeInstanceOf(File)
      expect(body.get('password')).toBe('synthetic-password')
      return Promise.resolve()
    })
    const controller = createCertificateUploadController({
      clearFileInput,
      clearPasswordInput,
      replaceCertificate,
    })

    controller.selectCertificate(syntheticCertificateFile())
    controller.setPassword('synthetic-password')
    expect(replaceCertificate).not.toHaveBeenCalled()
    await controller.submit()

    expect(clearFileInput).toHaveBeenCalledTimes(1)
    expect(clearPasswordInput).toHaveBeenCalledTimes(1)
    expect(controller.hasSensitiveDraft).toBe(false)
    expect([...(submittedBody?.keys() ?? [])]).toEqual([])
  })

  test('clears file and password after a rejected upload without exposing server detail', async () => {
    const { createCertificateUploadController } = await loadFutureModule<CertificateUploadModule>(
      '../../src/modules/company-settings/hooks/useCertificateUpload.hook',
    )
    const clearFileInput = mock(() => undefined)
    const clearPasswordInput = mock(() => undefined)
    let submittedBody: FormData | undefined
    const controller = createCertificateUploadController({
      clearFileInput,
      clearPasswordInput,
      replaceCertificate: (body) => {
        submittedBody = body
        return Promise.reject(new Error('provider internal detail'))
      },
    })

    controller.selectCertificate(syntheticCertificateFile())
    controller.setPassword('synthetic-password')
    const error = await controller.submit().catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('CERTIFICATE_UPLOAD_FAILED')
    expect(clearFileInput).toHaveBeenCalledTimes(1)
    expect(clearPasswordInput).toHaveBeenCalledTimes(1)
    expect(controller.hasSensitiveDraft).toBe(false)
    expect([...(submittedBody?.keys() ?? [])]).toEqual([])
  })
})

type CompanySettingsClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => {
    readonly getSettings: () => Promise<typeof COMPANY_SETTINGS_RESPONSE>
    readonly listCertificates: (input: {
      readonly cursor?: string
      readonly limit: number
    }) => Promise<DigitalCertificatesResponseContract>
    readonly replaceCertificate: (input: FormData) => Promise<unknown>
    readonly updateSettings: (input: CompanySettingsUpdateContract) => Promise<unknown>
  }
}

type CertificateUploadModule = {
  readonly createCertificateUploadController: (input: {
    readonly clearFileInput: () => void
    readonly clearPasswordInput: () => void
    readonly replaceCertificate: (body: FormData) => Promise<void>
  }) => {
    readonly hasSensitiveDraft: boolean
    readonly selectCertificate: (file: File) => void
    readonly setPassword: (password: string) => void
    readonly submit: () => Promise<void>
  }
}

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from './company-settings.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/company-settings/shared/companySettingsClient.service'
const POLICY_MODULE = '../../src/modules/company-settings/shared/companyLogo.validation'
const LOGO_URL = 'https://transportada.test/company-settings/logo'

const LOGO_LABEL_KEYS = [
  'logoTitle',
  'logoHint',
  'chooseLogoFile',
  'noLogoSelected',
  'logoPreviewAlt',
  'logoEmpty',
  'removeLogo',
  'removeLogoConfirmation',
  'cancelRemoveLogo',
  'confirmRemoveLogo',
  'logoSaved',
  'logoRemoved',
  'logoError',
  'logoErrorNetwork',
  'logoErrorTooLarge',
  'logoErrorUnsupported',
] as const

/** PNG de 1x1: menor arquivo que ainda carrega a assinatura real do formato. */
const PNG_BYTES: Uint8Array<ArrayBuffer> = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
)

type CompanyLogoImage = Readonly<{ dataUrl: string; mimeType: string }>

type CompanyLogoMetadataContract = Readonly<{
  byteSize: number
  mimeType: string
  sha256: string
  updatedAt: string
}>

type CompanySettingsClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => {
    readonly getLogo: () => Promise<CompanyLogoImage | null>
    readonly removeLogo: () => Promise<void>
    readonly replaceLogo: (file: File) => Promise<CompanyLogoMetadataContract>
  }
}

type CompanyLogoPolicyModule = {
  readonly COMPANY_LOGO_ACCEPT: string
  readonly COMPANY_LOGO_MAX_BYTES: number
  readonly resolveLogoRejection: (file: File) => string | null
}

const LOGO_METADATA = {
  byteSize: PNG_BYTES.byteLength,
  mimeType: 'image/png',
  sha256: 'f'.repeat(64),
  updatedAt: '2026-08-01T04:30:00.000Z',
} as const satisfies CompanyLogoMetadataContract

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readModule(filePath)) as Record<string, unknown>
}

async function logoClient(fetch: (request: Request) => Promise<Response>) {
  const { createCompanySettingsClient } =
    await loadFutureModule<CompanySettingsClientModule>(CLIENT_MODULE)
  return createCompanySettingsClient({
    apiBaseUrl: 'https://transportada.test',
    fetch,
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
  })
}

function logoFile(input: Readonly<{ bytes: Uint8Array<ArrayBuffer>; type?: string }>): File {
  return new File([input.bytes], 'logo.png', { type: input.type ?? 'image/png' })
}

describe('company logo selection policy contract', () => {
  test('aceita apenas os formatos que o PDF da fatura sabe desenhar', async () => {
    const policy = await loadFutureModule<CompanyLogoPolicyModule>(POLICY_MODULE)

    expect(policy.resolveLogoRejection(logoFile({ bytes: PNG_BYTES }))).toBeNull()
    expect(
      policy.resolveLogoRejection(logoFile({ bytes: PNG_BYTES, type: 'image/jpeg' })),
    ).toBeNull()
    expect(policy.resolveLogoRejection(logoFile({ bytes: PNG_BYTES, type: 'image/gif' }))).toBe(
      'COMPANY_LOGO_UNSUPPORTED_FORMAT',
    )
    expect(policy.COMPANY_LOGO_ACCEPT).toContain('image/png')
    expect(policy.COMPANY_LOGO_ACCEPT).toContain('image/jpeg')
  })

  test('recusa no navegador o arquivo que a API recusaria com 413', async () => {
    const policy = await loadFutureModule<CompanyLogoPolicyModule>(POLICY_MODULE)
    const oversized = logoFile({ bytes: new Uint8Array(policy.COMPANY_LOGO_MAX_BYTES + 1) })

    expect(policy.resolveLogoRejection(oversized)).toBe('COMPANY_LOGO_TOO_LARGE')
  })
})

describe('company logo client contract', () => {
  test('envia o logo como multipart no campo file, sem chave de idempotência', async () => {
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.url).toBe(LOGO_URL)
      expect(request.method).toBe('PUT')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.headers.get('idempotency-key')).toBeNull()
      expect(request.cache).toBe('no-store')
      expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=.+$/)
      expect([...(await request.formData()).keys()]).toEqual(['file'])
      return Response.json({ data: LOGO_METADATA })
    })

    const metadata = await (await logoClient(fetch)).replaceLogo(logoFile({ bytes: PNG_BYTES }))

    expect(metadata).toEqual(LOGO_METADATA)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('devolve o logo salvo como data URL pronta para o preview', async () => {
    const fetch = mock(() =>
      Promise.resolve(
        new Response(PNG_BYTES, { headers: { 'content-type': 'image/png' }, status: 200 }),
      ),
    )

    const logo = await (await logoClient(fetch)).getLogo()

    expect(logo?.mimeType).toBe('image/png')
    expect(logo?.dataUrl).toBe(`data:image/png;base64,${btoa(String.fromCharCode(...PNG_BYTES))}`)
  })

  test('empresa sem logo cadastrado não é erro de tela', async () => {
    const fetch = mock(() =>
      Promise.resolve(
        Response.json({ error: { code: 'COMPANY_LOGO_NOT_FOUND' } }, { status: 404 }),
      ),
    )

    expect(await (await logoClient(fetch)).getLogo()).toBeNull()
  })

  test('propaga o código de erro da API quando a leitura falha', async () => {
    const fetch = mock(() =>
      Promise.resolve(Response.json({ error: { code: 'INTERNAL_ERROR' } }, { status: 500 })),
    )

    expect((await logoClient(fetch)).getLogo()).rejects.toThrow('INTERNAL_ERROR')
  })

  test('remove o logo aceitando a resposta 204 sem corpo', async () => {
    const fetch = mock((request: Request): Promise<Response> => {
      expect(request.url).toBe(LOGO_URL)
      expect(request.method).toBe('DELETE')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      return Promise.resolve(new Response(null, { status: 204 }))
    })

    await (await logoClient(fetch)).removeLogo()

    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('company logo presentation contract', () => {
  test('liga o upload de logo à tela de configurações sem cor solta', async () => {
    const [component, page, hook] = await Promise.all([
      readModule('src/modules/company-settings/components/CompanyLogoUpload.component.tsx'),
      readModule('src/modules/company-settings/pages/CompanySettings.page.tsx'),
      readModule('src/modules/company-settings/hooks/useCompanySettings.hook.ts'),
    ])

    expect(page).toContain('<CompanyLogoUpload')
    expect(component).toContain('COMPANY_LOGO_ACCEPT')
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const method of ['getLogo', 'removeLogo', 'replaceLogo']) {
      expect(hook).toContain(method)
    }
  })

  test('traduz cada rótulo do logo nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/company-settings/locales/companySettings.locale.json'),
      readLocale('src/modules/company-settings/locales/companySettings.en.locale.json'),
    ])

    for (const key of LOGO_LABEL_KEYS) {
      expect(portuguese[key]).toBeString()
      expect(english[key]).toBeString()
    }
  })
})

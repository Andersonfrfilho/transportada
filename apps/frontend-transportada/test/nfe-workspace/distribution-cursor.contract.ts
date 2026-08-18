/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from '../company-settings/company-settings.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/company-settings/shared/companySettingsClient.service'
const DISTRIBUTION_CURSOR_URL = 'https://transportada.test/company-settings/distribution-cursor'

const PANEL_LABEL_KEYS = [
  'distributionCursorTitle',
  'distributionCursorHint',
  'distributionCursorPosition',
  'distributionCursorMax',
  'distributionCursorUpdatedAt',
  'distributionCursorNextWindow',
  'distributionCursorRefusals',
  'distributionCursorLastSkipped',
  'distributionCursorNeverSkipped',
  'distributionCursorFieldLabel',
  'distributionCursorFieldHint',
  'distributionCursorSubmit',
  'distributionCursorConfirm',
  'distributionCursorCancel',
  'distributionCursorAdjusted',
  'distributionCursorError',
  'distributionCursorLoadError',
] as const

type DistributionCursorContract = Readonly<{
  consecutiveRateLimits: number
  environment: string
  lastSkipped: Readonly<{ at: string; fromNsu: string; toNsu: string }> | null
  maxNsu: string
  nextAllowedAt: string | null
  ultNsu: string
  updatedAt: string
}>

type CompanySettingsClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => {
    readonly adjustDistributionCursor: (ultNsu: string) => Promise<DistributionCursorContract>
    readonly getDistributionCursor: () => Promise<DistributionCursorContract>
  }
}

const CURSOR = {
  consecutiveRateLimits: 2,
  environment: 'production',
  lastSkipped: {
    at: '2026-08-11T13:10:00.000Z',
    fromNsu: '000000000037702',
    toNsu: '000000000045636',
  },
  maxNsu: '000000000045700',
  nextAllowedAt: '2026-08-11T15:10:00.000Z',
  ultNsu: '000000000045636',
  updatedAt: '2026-08-11T14:10:00.000Z',
} as const satisfies DistributionCursorContract

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readModule(filePath)) as Record<string, unknown>
}

async function cursorClient(fetch: (request: Request) => Promise<Response>) {
  const { createCompanySettingsClient } =
    await loadFutureModule<CompanySettingsClientModule>(CLIENT_MODULE)
  return createCompanySettingsClient({
    apiBaseUrl: 'https://transportada.test',
    fetch,
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
  })
}

describe('distribution cursor client contract', () => {
  test('lê o cursor da distribuição na rota de configurações', async () => {
    const fetch = mock((request: Request): Promise<Response> => {
      expect(request.url).toBe(DISTRIBUTION_CURSOR_URL)
      expect(request.method).toBe('GET')
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.cache).toBe('no-store')
      return Promise.resolve(Response.json({ data: CURSOR }))
    })

    expect(await (await cursorClient(fetch)).getDistributionCursor()).toEqual(CURSOR)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('ajusta enviando só o NSU — a empresa vem do token, nunca do corpo', async () => {
    const fetch = mock(async (request: Request): Promise<Response> => {
      expect(request.method).toBe('PUT')
      expect(await request.json()).toEqual({ ultNsu: '000000000045700' })
      return Response.json({ data: { ...CURSOR, ultNsu: '000000000045700' } })
    })

    const adjusted = await (await cursorClient(fetch)).adjustDistributionCursor('000000000045700')

    expect(adjusted.ultNsu).toBe('000000000045700')
  })

  test('recusa um corpo que não descreve o cursor inteiro', async () => {
    const fetch = mock(() => Promise.resolve(Response.json({ data: { ultNsu: '1' } })))

    expect((await cursorClient(fetch)).getDistributionCursor()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  test('propaga o 422 da API sem inventar mensagem', async () => {
    const fetch = mock(() =>
      Promise.resolve(
        Response.json({ error: { code: 'DISTRIBUTION_CURSOR_ABOVE_MAX_NSU' } }, { status: 422 }),
      ),
    )

    expect((await cursorClient(fetch)).adjustDistributionCursor('999999999999999')).rejects.toThrow(
      'DISTRIBUTION_CURSOR_ABOVE_MAX_NSU',
    )
  })
})

describe('distribution cursor presentation contract', () => {
  test('traduz cada rótulo do painel nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'),
      readLocale('src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'),
    ])

    for (const key of PANEL_LABEL_KEYS) {
      expect(portuguese[key]).toBeString()
      expect(english[key]).toBeString()
    }
  })

  test('o painel mostra o intervalo abandonado e as recusas seguidas', async () => {
    const component = await readModule(
      'src/modules/nfe-workspace/components/DistributionCursorPanel.component.tsx',
    )

    expect(component).toContain('lastSkipped')
    expect(component).toContain('consecutiveRateLimits')
    expect(component).toContain('distributionCursorNeverSkipped')
  })

  test('o ajuste exige confirmação antes de saltar o cursor', async () => {
    const component = await readModule(
      'src/modules/nfe-workspace/components/DistributionCursorPanel.component.tsx',
    )

    expect(component).toContain('distributionCursorConfirm')
    expect(component).toContain('distributionCursorCancel')
  })

  test('o painel entra na aba de importações da tela de notas com esqueleto e sem cor solta', async () => {
    const [component, hook, page] = await Promise.all([
      readModule('src/modules/nfe-workspace/components/DistributionCursorPanel.component.tsx'),
      readModule('src/modules/nfe-workspace/hooks/useDistributionCursor.hook.ts'),
      readModule('src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx'),
    ])

    expect(page).toContain('<DistributionCursorPanel')
    expect(component).toContain('Skeleton')
    expect(component).toContain('Icon')
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(component).not.toContain('<select')
    expect(component).not.toContain('type="checkbox"')
    for (const method of ['adjustDistributionCursor', 'getDistributionCursor']) {
      expect(hook).toContain(method)
    }
  })
})

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, mock, test } from 'bun:test'

import {
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from './company-settings.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CLIENT_MODULE = '../../src/modules/company-settings/shared/companySettingsClient.service'
const CONSTANT_MODULE = '../../src/modules/company-settings/shared/scheduledDistribution.constant'
const SCHEDULED_DISTRIBUTION_URL =
  'https://transportada.test/company-settings/scheduled-distribution'

const PANEL_LABEL_KEYS = [
  'scheduledDistributionTitle',
  'scheduledDistributionHint',
  'scheduledDistributionOn',
  'scheduledDistributionOff',
  'scheduledDistributionEnable',
  'scheduledDistributionDisable',
  'scheduledDistributionReady',
  'scheduledDistributionBlocked',
  'scheduledDistributionNextWindow',
  'scheduledDistributionNextRun',
  'scheduledDistributionLastRun',
  'scheduledDistributionLastRunFailed',
  'scheduledDistributionNeverRan',
  'scheduledDistributionCertificateExpires',
  'scheduledDistributionError',
  'scheduledDistributionToggleError',
] as const

/** O mesmo vocabulário fechado da policy da API — a tela nomeia cada bloqueio. */
const INELIGIBILITY_REASONS = [
  'company_disabled',
  'not_opted_in',
  'missing_synthetic_membership',
  'certificate_missing',
  'certificate_not_yet_valid',
  'certificate_expired',
  'cooldown_active',
] as const

type ScheduledDistributionStatusContract = Readonly<{
  certificateExpiresAt: string | null
  eligible: boolean
  enabled: boolean
  ineligibilityReason: string | null
  lastAutomationImport: Readonly<{
    finishedAt: string | null
    receivedCount: number
    startedAt: string
    status: string
  }> | null
  nextAllowedAt: string | null
  nextScheduledRunAt: string
}>

type CompanySettingsClientModule = {
  readonly createCompanySettingsClient: (input: {
    readonly apiBaseUrl: string
    readonly fetch: (request: Request) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => {
    readonly disableScheduledDistribution: () => Promise<ScheduledDistributionStatusContract>
    readonly enableScheduledDistribution: () => Promise<ScheduledDistributionStatusContract>
    readonly getScheduledDistribution: () => Promise<ScheduledDistributionStatusContract>
  }
}

type ScheduledDistributionConstantModule = {
  readonly SCHEDULED_DISTRIBUTION_REASON_LABEL_KEYS: Readonly<Record<string, string>>
}

const ENABLED_STATUS = {
  certificateExpiresAt: '2030-01-01T00:00:00.000Z',
  eligible: true,
  enabled: true,
  ineligibilityReason: null,
  lastAutomationImport: {
    finishedAt: '2026-08-01T04:31:00.000Z',
    receivedCount: 7,
    startedAt: '2026-08-01T04:30:00.000Z',
    status: 'completed',
  },
  nextAllowedAt: null,
  nextScheduledRunAt: '2026-08-01T05:00:00.000Z',
} as const satisfies ScheduledDistributionStatusContract

const DISABLED_STATUS = {
  certificateExpiresAt: null,
  eligible: false,
  enabled: false,
  ineligibilityReason: 'not_opted_in',
  lastAutomationImport: null,
  nextAllowedAt: null,
  nextScheduledRunAt: '2026-08-01T05:00:00.000Z',
} as const satisfies ScheduledDistributionStatusContract

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readModule(filePath)) as Record<string, unknown>
}

async function scheduledClient(fetch: (request: Request) => Promise<Response>) {
  const { createCompanySettingsClient } =
    await loadFutureModule<CompanySettingsClientModule>(CLIENT_MODULE)
  return createCompanySettingsClient({
    apiBaseUrl: 'https://transportada.test',
    fetch,
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
  })
}

function statusResponder(
  input: Readonly<{ method: string; status?: ScheduledDistributionStatusContract }>,
) {
  return mock((request: Request): Promise<Response> => {
    expect(request.url).toBe(SCHEDULED_DISTRIBUTION_URL)
    expect(request.method).toBe(input.method)
    expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(request.cache).toBe('no-store')
    return Promise.resolve(Response.json({ data: input.status ?? ENABLED_STATUS }))
  })
}

describe('scheduled distribution client contract', () => {
  test('lê o estado da busca automática na rota de configurações', async () => {
    const fetch = statusResponder({ method: 'GET' })

    const status = await (await scheduledClient(fetch)).getScheduledDistribution()

    expect(status).toEqual(ENABLED_STATUS)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('liga com PUT e desliga com DELETE, devolvendo o estado já recalculado', async () => {
    const enableFetch = statusResponder({ method: 'PUT' })
    const disableFetch = statusResponder({ method: 'DELETE', status: DISABLED_STATUS })

    expect(await (await scheduledClient(enableFetch)).enableScheduledDistribution()).toEqual(
      ENABLED_STATUS,
    )
    expect(await (await scheduledClient(disableFetch)).disableScheduledDistribution()).toEqual(
      DISABLED_STATUS,
    )
  })

  test('recusa um corpo que não descreve o estado inteiro', async () => {
    const fetch = mock(() =>
      Promise.resolve(Response.json({ data: { enabled: true, eligible: true } })),
    )

    expect((await scheduledClient(fetch)).getScheduledDistribution()).rejects.toThrow(
      'COMPANY_SETTINGS_RESPONSE_INVALID',
    )
  })

  test('propaga o código de erro da API sem inventar mensagem', async () => {
    const fetch = mock(() =>
      Promise.resolve(Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 })),
    )

    expect((await scheduledClient(fetch)).enableScheduledDistribution()).rejects.toThrow(
      'FORBIDDEN',
    )
  })
})

describe('scheduled distribution presentation contract', () => {
  test('cada razão de bloqueio da API tem rótulo próprio nos dois catálogos', async () => {
    const { SCHEDULED_DISTRIBUTION_REASON_LABEL_KEYS } =
      await loadFutureModule<ScheduledDistributionConstantModule>(CONSTANT_MODULE)
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/company-settings/locales/companySettings.locale.json'),
      readLocale('src/modules/company-settings/locales/companySettings.en.locale.json'),
    ])

    expect(Object.keys(SCHEDULED_DISTRIBUTION_REASON_LABEL_KEYS).sort()).toEqual(
      [...INELIGIBILITY_REASONS].sort(),
    )
    for (const reason of INELIGIBILITY_REASONS) {
      const key = SCHEDULED_DISTRIBUTION_REASON_LABEL_KEYS[reason] ?? ''
      expect(portuguese[key]).toBeString()
      expect(english[key]).toBeString()
    }
  })

  test('traduz cada rótulo do painel nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/company-settings/locales/companySettings.locale.json'),
      readLocale('src/modules/company-settings/locales/companySettings.en.locale.json'),
    ])

    for (const key of PANEL_LABEL_KEYS) {
      expect(portuguese[key]).toBeString()
      expect(english[key]).toBeString()
    }
  })

  test('o painel anuncia o próximo ciclo do cron, e não só a janela da SEFAZ', async () => {
    const component = await readModule(
      'src/modules/company-settings/components/ScheduledDistributionPanel.component.tsx',
    )

    expect(component).toContain('nextScheduledRunAt')
    expect(component).toContain('scheduledDistributionNextRun')
  })

  test('o painel entra na tela de configurações com esqueleto e sem cor solta', async () => {
    const [component, hook, page] = await Promise.all([
      readModule(
        'src/modules/company-settings/components/ScheduledDistributionPanel.component.tsx',
      ),
      readModule('src/modules/company-settings/hooks/useScheduledDistribution.hook.ts'),
      readModule('src/modules/company-settings/pages/CompanySettings.page.tsx'),
    ])

    expect(page).toContain('<ScheduledDistributionPanel')
    expect(component).toContain('Skeleton')
    expect(component).toContain('Icon')
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(component).not.toContain('<input')
    for (const method of [
      'disableScheduledDistribution',
      'enableScheduledDistribution',
      'getScheduledDistribution',
    ]) {
      expect(hook).toContain(method)
    }
  })
})

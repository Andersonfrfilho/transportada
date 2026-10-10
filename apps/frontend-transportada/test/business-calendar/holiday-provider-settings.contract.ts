/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.1 (ADR-0102 D2, RF3–RF6): o painel fala o contrato real de `/holiday-imports/provider-settings` e de
 * `/company-settings/holiday-import` — guardas de chaves exatas (a chave e o envelope nunca entram), cliente, e as
 * recusas 400, 403, 409 e 429 ditas por extenso. Dados fictícios.
 */
import { describe, expect, test } from 'bun:test'

import english from '@/modules/company-settings/locales/businessCalendar.en.locale.json'
import portuguese from '@/modules/company-settings/locales/businessCalendar.locale.json'
import { BUSINESS_CALENDAR_REFUSAL_CODES } from '@/modules/company-settings/shared/businessCalendar.constant'
import { describeBusinessCalendarRefusal } from '@/modules/company-settings/shared/businessCalendarRefusal.service'
import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'
import {
  createHolidayProviderSettingsClient,
  type HolidayProviderSettingsClient,
} from '@/modules/company-settings/shared/holidayProviderSettingsClient.service'
import {
  isHolidayImportEnablement,
  isHolidayProviderSettings,
} from '@/modules/company-settings/shared/holidayProviderSettingsGuards.validation'

import { envelope } from '../fixtures/businessCalendar.fixture'
import {
  buildEmptyProviderSettings,
  buildEnablement,
  buildProviderSettings,
  FAKE_PROVIDER_TOKEN,
  SETTINGS_VERSION,
} from '../fixtures/holidayProviderSettings.fixture'

type Recorded = { body: string; method: string; url: string }

function setup(response: () => Response): {
  calls: Recorded[]
  client: HolidayProviderSettingsClient
} {
  const calls: Recorded[] = []
  const client = createHolidayProviderSettingsClient({
    apiBaseUrl: 'http://api.test',
    fetch: async (request) => {
      calls.push({ body: await request.clone().text(), method: request.method, url: request.url })
      return response()
    },
    getAccessToken: () => Promise.resolve('token-123'),
  })
  return { calls, client }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  })
}

async function failureOf(run: () => Promise<unknown>): Promise<BusinessCalendarRequestError> {
  try {
    await run()
  } catch (error) {
    if (error instanceof BusinessCalendarRequestError) return error
    throw error
  }
  throw new Error('NOT_REJECTED')
}

describe('guardas da configuração da FeriadosAPI (chaves exatas)', () => {
  test('a instalação sem linha e a com chave são aceitas', () => {
    expect(isHolidayProviderSettings(buildEmptyProviderSettings())).toBe(true)
    expect(isHolidayProviderSettings(buildProviderSettings())).toBe(true)
    expect(
      isHolidayProviderSettings(
        buildProviderSettings({ budgetOrigin: 'installation', monthlyRequestBudget: 2500 }),
      ),
    ).toBe(true)
  })

  test('recusa qualquer chave a mais: a chave, o envelope e quem alterou nunca entram', () => {
    const settings = buildProviderSettings()

    for (const extra of ['token', 'tokenEnvelope', 'updatedByUserId', 'companyId', 'provider']) {
      expect(isHolidayProviderSettings({ ...settings, [extra]: 'x' })).toBe(false)
    }
  })

  test('recusa a chave que falta e o tipo errado em cada campo', () => {
    const settings = buildProviderSettings()
    const { tokenHint: omitted, ...withoutHint } = settings

    expect(omitted).toBe('1234')
    expect(isHolidayProviderSettings(withoutHint)).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, tokenConfigured: 'true' })).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, tokenHint: 1234 })).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, monthlyRequestBudget: '4500' })).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, monthlyRequestBudget: null })).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, version: 3 })).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, updatedAt: 0 })).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, tokenUpdatedAt: false })).toBe(false)
  })

  test('a origem do orçamento é `default` ou `installation`, e nada mais', () => {
    const settings = buildProviderSettings()

    expect(isHolidayProviderSettings({ ...settings, budgetOrigin: 'company' })).toBe(false)
    expect(isHolidayProviderSettings({ ...settings, budgetOrigin: 'DEFAULT' })).toBe(false)
  })

  test('o interruptor da empresa tem `isEnabled` e `origin`, e nada mais', () => {
    expect(isHolidayImportEnablement(buildEnablement())).toBe(true)
    expect(
      isHolidayImportEnablement(buildEnablement({ isEnabled: false, origin: 'company' })),
    ).toBe(true)
    expect(isHolidayImportEnablement({ ...buildEnablement(), companyId: 'c-1' })).toBe(false)
    expect(isHolidayImportEnablement({ ...buildEnablement(), origin: 'installation' })).toBe(false)
    expect(isHolidayImportEnablement({ ...buildEnablement(), isEnabled: 'true' })).toBe(false)
    expect(isHolidayImportEnablement({ isEnabled: true })).toBe(false)
  })
})

describe('cliente da configuração da FeriadosAPI', () => {
  test('GET /holiday-imports/provider-settings lê a configuração e a devolve intacta', async () => {
    const settings = buildProviderSettings({
      budgetOrigin: 'installation',
      monthlyRequestBudget: 900,
    })
    const { calls, client } = setup(() => json(envelope(settings)))

    expect(await client.getSettings()).toEqual(settings)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('http://api.test/holiday-imports/provider-settings')
  })

  test('resposta com a chave ou o envelope é descartada como inválida, nunca entregue à tela', async () => {
    const { client } = setup(() =>
      json(envelope({ ...buildProviderSettings(), token: FAKE_PROVIDER_TOKEN })),
    )

    const failure = await failureOf(() => client.getSettings())

    expect(failure.code).toBe('BUSINESS_CALENDAR_RESPONSE_INVALID')
    expect(failure.message).not.toContain(FAKE_PROVIDER_TOKEN)
  })

  test('PUT leva só o que o chamador pediu, com `expectedVersion`, e lê a configuração gravada', async () => {
    const saved = buildProviderSettings({ version: '4' })
    const { calls, client } = setup(() => json(envelope(saved)))

    const result = await client.saveSettings({
      expectedVersion: SETTINGS_VERSION,
      monthlyRequestBudget: 2500,
      token: FAKE_PROVIDER_TOKEN,
    })

    expect(result).toEqual(saved)
    expect(calls[0]?.method).toBe('PUT')
    expect(calls[0]?.url).toBe('http://api.test/holiday-imports/provider-settings')
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({
      expectedVersion: SETTINGS_VERSION,
      monthlyRequestBudget: 2500,
      token: FAKE_PROVIDER_TOKEN,
    })
  })

  test('PUT sem chave não manda a chave: só o orçamento', async () => {
    const { calls, client } = setup(() => json(envelope(buildProviderSettings())))

    await client.saveSettings({ expectedVersion: SETTINGS_VERSION, monthlyRequestBudget: 2500 })

    expect(Object.keys(JSON.parse(calls[0]?.body ?? '') as object).sort()).toEqual([
      'expectedVersion',
      'monthlyRequestBudget',
    ])
  })

  test('PUT com orçamento `null` volta ao padrão: o `null` chega ao corpo', async () => {
    const { calls, client } = setup(() => json(envelope(buildProviderSettings())))

    await client.saveSettings({ expectedVersion: SETTINGS_VERSION, monthlyRequestBudget: null })

    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({
      expectedVersion: SETTINGS_VERSION,
      monthlyRequestBudget: null,
    })
  })

  test('PUT sem `expectedVersion` (criar) não manda a versão', async () => {
    const { calls, client } = setup(() => json(envelope(buildProviderSettings())))

    await client.saveSettings({ token: FAKE_PROVIDER_TOKEN })

    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ token: FAKE_PROVIDER_TOKEN })
  })

  test('DELETE /holiday-imports/provider-settings/token remove a chave (204 sem corpo, sem corpo no pedido)', async () => {
    const { calls, client } = setup(() => new Response(null, { status: 204 }))

    await client.removeToken()

    expect(calls[0]?.method).toBe('DELETE')
    expect(calls[0]?.url).toBe('http://api.test/holiday-imports/provider-settings/token')
    expect(calls[0]?.body).toBe('')
  })

  test('GET /company-settings/holiday-import lê o interruptor da empresa', async () => {
    const enablement = buildEnablement({ isEnabled: false, origin: 'company' })
    const { calls, client } = setup(() => json(envelope(enablement)))

    expect(await client.getEnablement()).toEqual(enablement)
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe('http://api.test/company-settings/holiday-import')
  })

  test('PUT /company-settings/holiday-import manda só `isEnabled`', async () => {
    const enablement = buildEnablement({ isEnabled: false, origin: 'company' })
    const { calls, client } = setup(() => json(envelope(enablement)))

    expect(await client.saveEnablement(false)).toEqual(enablement)
    expect(calls[0]?.method).toBe('PUT')
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ isEnabled: false })
  })

  test('interruptor com formato inesperado é recusado como resposta inválida', async () => {
    const { client } = setup(() => json(envelope({ isEnabled: true, origin: 'default', extra: 1 })))

    const failure = await failureOf(() => client.getEnablement())

    expect(failure.code).toBe('BUSINESS_CALENDAR_RESPONSE_INVALID')
  })
})

describe('recusas da configuração da FeriadosAPI', () => {
  test('400 sobe com o código e o campo recusado, sem a chave', async () => {
    const { client } = setup(() =>
      json(
        {
          error: {
            code: 'INVALID_REQUEST',
            details: [{ field: 'token', message: 'Must be 16 to 512 visible ASCII characters' }],
            message: 'x',
          },
        },
        400,
      ),
    )

    const failure = await failureOf(() => client.saveSettings({ token: 'curta' }))
    const refusal = describeBusinessCalendarRefusal(failure)

    expect(failure.status).toBe(400)
    expect(refusal.messageKey).toBe('errors.INVALID_REQUEST')
    expect(refusal.fields).toEqual([{ field: 'token', labelKey: 'fields.token' }])
  })

  test('o orçamento fora da faixa é nomeado pelo rótulo impresso, não pelo caminho do corpo', async () => {
    const { client } = setup(() =>
      json(
        {
          error: {
            code: 'INVALID_REQUEST',
            details: [{ field: 'monthlyRequestBudget', message: 'x' }],
            message: 'x',
          },
        },
        400,
      ),
    )

    const refusal = describeBusinessCalendarRefusal(
      await failureOf(() => client.saveSettings({ monthlyRequestBudget: 0 })),
    )

    expect(refusal.fields).toEqual([
      { field: 'monthlyRequestBudget', labelKey: 'fields.monthlyRequestBudget' },
    ])
  })

  test.each([
    ['HOLIDAY_PROVIDER_TOKEN_INVALID', 400],
    ['HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT', 409],
    ['HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE', 500],
    ['FORBIDDEN', 403],
  ])('%s (%i) é código conhecido com texto próprio nos dois idiomas', async (code, status) => {
    const { client } = setup(() => json({ error: { code, message: 'x' } }, status))

    const failure = await failureOf(() => client.saveSettings({ token: FAKE_PROVIDER_TOKEN }))
    const refusal = describeBusinessCalendarRefusal(failure)

    const knownCodes: readonly string[] = BUSINESS_CALENDAR_REFUSAL_CODES

    expect(knownCodes).toContain(code)
    expect(refusal.messageKey).toBe(`errors.${code}`)
    expect(Object.keys(portuguese.errors)).toContain(code)
    expect(Object.keys(english.errors)).toContain(code)
  })

  test('o 409 de versão manda recarregar, e o texto não promete que a chave foi gravada', () => {
    const errors = portuguese.errors as Record<string, string>
    const text = errors.HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT ?? ''

    expect(text).toContain('Outra pessoa alterou')
    expect(text).toContain('recarreg')
  })

  test('o 429 com `Retry-After` traz os segundos do cabeçalho e a tela diz os minutos', async () => {
    const { client } = setup(() =>
      json({ error: { code: 'TOO_MANY_REQUESTS', message: 'x' } }, 429, { 'retry-after': '150' }),
    )

    const failure = await failureOf(() => client.saveSettings({ token: FAKE_PROVIDER_TOKEN }))
    const refusal = describeBusinessCalendarRefusal(failure)

    expect(failure.retryAfterSeconds).toBe(150)
    expect(refusal.messageKey).toBe('errors.TOO_MANY_REQUESTS_AFTER')
    expect(refusal.retryAfterMinutes).toBe(3)
    expect((portuguese.errors as Record<string, string>).TOO_MANY_REQUESTS_AFTER).toContain(
      '{{minutes}}',
    )
    expect((english.errors as Record<string, string>).TOO_MANY_REQUESTS_AFTER).toContain(
      '{{minutes}}',
    )
  })

  test('o 429 sem `Retry-After` cai no texto de antes, sem minutos inventados', async () => {
    const { client } = setup(() =>
      json({ error: { code: 'TOO_MANY_REQUESTS', message: 'x' } }, 429),
    )

    const failure = await failureOf(() => client.removeToken())
    const refusal = describeBusinessCalendarRefusal(failure)

    expect(failure.retryAfterSeconds).toBeUndefined()
    expect(refusal.messageKey).toBe('errors.TOO_MANY_REQUESTS')
    expect(refusal.retryAfterMinutes).toBeUndefined()
  })

  test('o 429 nunca é "0 min": menos de um minuto arredonda para 1', () => {
    const refusal = describeBusinessCalendarRefusal(
      new BusinessCalendarRequestError({
        code: 'TOO_MANY_REQUESTS',
        retryAfterSeconds: 5,
        status: 429,
      }),
    )

    expect(refusal.retryAfterMinutes).toBe(1)
  })

  test('nenhuma recusa carrega a chave que se tentou enviar', async () => {
    const { client } = setup(() =>
      json({ error: { code: 'HOLIDAY_PROVIDER_TOKEN_INVALID', message: 'x' } }, 400),
    )

    const failure = await failureOf(() => client.saveSettings({ token: FAKE_PROVIDER_TOKEN }))

    expect(JSON.stringify(describeBusinessCalendarRefusal(failure))).not.toContain(
      FAKE_PROVIDER_TOKEN,
    )
    expect(failure.message).not.toContain(FAKE_PROVIDER_TOKEN)
  })
})

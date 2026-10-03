/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import { DriverCrewSettingsPanel } from '@/modules/fleet/components/DriverCrewSettingsPanel.component'
import enLocale from '@/modules/fleet/locales/fleet.en.locale.json'
import ptLocale from '@/modules/fleet/locales/fleet.locale.json'
import {
  CrewSettingsRequestError,
  createCrewSettingsClient,
} from '@/modules/fleet/shared/crewSettingsClient.service'
import {
  toHelperDailyRateBody,
  toHelperDailyRateDraft,
} from '@/modules/fleet/shared/crewSettingsForm.service'
import { isCrewSettingsResponse } from '@/modules/fleet/shared/crewSettings.validation'

const NOOP = (): void => undefined
const PANEL_LABEL_KEYS = [
  'title',
  'hint',
  'label',
  'save',
  'saved',
  'error',
  'loadError',
  'retry',
] as const

type FetchCall = Readonly<{ body: string; method: string; url: string }>

function createFakeClient(response: Response): {
  calls: FetchCall[]
  client: ReturnType<typeof createCrewSettingsClient>
} {
  const calls: FetchCall[] = []
  const client = createCrewSettingsClient({
    apiBaseUrl: 'https://api.example.test',
    fetch: async (request) => {
      calls.push({ body: await request.text(), method: request.method, url: request.url })
      return response
    },
    getAccessToken: () => Promise.resolve('token'),
  })

  return { calls, client }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

function renderPanel(overrides: Partial<Parameters<typeof DriverCrewSettingsPanel>[0]>): string {
  return renderToStaticMarkup(
    <DriverCrewSettingsPanel
      canManage
      isSaving={false}
      loading={false}
      saved={false}
      settings={{ helperDailyRate: '180.0000' }}
      onSave={NOOP}
      {...overrides}
    />,
  )
}

describe('diária geral do ajudante (spec 243 T3)', () => {
  it('traduz cada rótulo do painel nos dois catálogos', () => {
    for (const locale of [ptLocale, enLocale]) {
      const crewSettings = (locale as Record<string, unknown>)['crewSettings'] as Record<
        string,
        unknown
      >
      for (const key of PANEL_LABEL_KEYS) expect(crewSettings[key]).toBeString()
    }
    expect(ptLocale.crewSettings.title).toBe('Diária do ajudante')
  })

  it('o cliente lê e grava em /company-crew-settings com o corpo estrito', async () => {
    const reader = createFakeClient(json({ data: { helperDailyRate: null } }))
    expect(await reader.client.get()).toEqual({ helperDailyRate: null })
    expect(reader.calls[0]).toEqual({
      body: '',
      method: 'GET',
      url: 'https://api.example.test/company-crew-settings',
    })

    const writer = createFakeClient(json({ data: { helperDailyRate: '180.0000' } }))
    expect(await writer.client.save('180.0000')).toEqual({ helperDailyRate: '180.0000' })
    expect(writer.calls[0]).toEqual({
      body: '{"helperDailyRate":"180.0000"}',
      method: 'PUT',
      url: 'https://api.example.test/company-crew-settings',
    })

    const clearer = createFakeClient(json({ data: { helperDailyRate: null } }))
    await clearer.client.save(null)
    expect(clearer.calls[0]?.body).toBe('{"helperDailyRate":null}')
  })

  it('a recusa da API chega como código e a resposta fora do formato é recusada', async () => {
    const refused = createFakeClient(json({ error: { code: 'CREW_SETTINGS_FORBIDDEN' } }, 403))
    const error = await refused.client.save('1.0000').catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(CrewSettingsRequestError)
    expect((error as Error).message).toBe('CREW_SETTINGS_FORBIDDEN')

    const malformed = createFakeClient(json({ data: { helperDailyRate: 180 } }))
    const invalid = await malformed.client.get().catch((caught: unknown) => caught)
    expect((invalid as Error).message).toBe('CREW_SETTINGS_RESPONSE_INVALID')
  })

  it('a validação confere chaves exatas', () => {
    expect(isCrewSettingsResponse({ data: { helperDailyRate: '1.0000' } })).toBe(true)
    expect(isCrewSettingsResponse({ data: { helperDailyRate: null } })).toBe(true)
    expect(isCrewSettingsResponse({ data: { helperDailyRate: 1 } })).toBe(false)
    expect(isCrewSettingsResponse({ data: { extra: 1, helperDailyRate: null } })).toBe(false)
    expect(isCrewSettingsResponse({ helperDailyRate: null })).toBe(false)
  })

  it('o campo converte `180,00` para `180.0000` e vazio para null, e volta', () => {
    expect(toHelperDailyRateBody('180,00')).toBe('180.0000')
    expect(toHelperDailyRateBody('1.250,50')).toBe('1250.5000')
    expect(toHelperDailyRateBody('')).toBeNull()
    expect(toHelperDailyRateDraft('180.0000')).toBe('180,00')
    expect(toHelperDailyRateDraft(null)).toBe('')
  })

  it('o painel mostra o valor gravado, a dica e o botão de salvar', () => {
    const html = renderPanel({})

    expect(html).toContain(ptLocale.crewSettings.title)
    expect(html).toContain('value="180,00"')
    expect(html).toContain(ptLocale.crewSettings.hint)
    expect(html).toContain(ptLocale.crewSettings.save)
  })

  it('vazio mostra o campo vazio com a mesma dica', () => {
    const html = renderPanel({ settings: { helperDailyRate: null } })

    expect(html).toContain('value=""')
    expect(html).toContain(ptLocale.crewSettings.hint)
  })

  it('sem fleet.manage o campo é só leitura e não há botão de salvar', () => {
    const html = renderPanel({ canManage: false })

    expect(html).toContain('disabled=""')
    expect(html).not.toContain(ptLocale.crewSettings.save)
  })

  it('carregando mostra esqueleto, falha de leitura diz o motivo, erro de gravação traz o código', () => {
    expect(renderPanel({ loading: true, settings: undefined })).not.toContain('<input')
    expect(renderPanel({ settings: undefined })).toContain(ptLocale.crewSettings.loadError)
    expect(renderPanel({ errorCode: 'CREW_SETTINGS_X' })).toContain('CREW_SETTINGS_X')
    expect(renderPanel({ saved: true })).toContain(ptLocale.crewSettings.saved)
  })
  it('o painel traz "Tentar de novo" na falha de leitura só quando recebe como tentar', () => {
    expect(renderPanel({ onRetry: NOOP, settings: undefined })).toContain(
      ptLocale.crewSettings.retry,
    )
    expect(renderPanel({ settings: undefined })).not.toContain(ptLocale.crewSettings.retry)
    expect(enLocale.crewSettings.retry).toBe('Try again')
  })
})

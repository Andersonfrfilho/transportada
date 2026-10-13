/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 264 T5.2 (RF15, RF17, D9): o interruptor "Transcrever áudios das conversas" nas Configurações.
 * Prende o cliente (`GET/PUT /company-settings/audio-transcription`, chaves exatas), o texto do limite
 * (número vindo de `maxDurationMs`), a aba (`settings.manage`) e os locales pt-BR e en.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  COMPANY_SETTINGS_TAB_IDS,
  resolveSettingsDataScope,
  resolveVisibleCompanySettingsTabs,
  SETTINGS_PANEL_PLACEMENT,
} from '@/modules/company-settings/shared/companySettingsTabs.service'
import {
  createAudioTranscriptionSettingsClient,
  resolveAudioTranscriptionLimit,
} from '@/modules/occurrence-conversation/shared/audioTranscriptionSettings.service'

const API_URL = 'https://api.example.test'
const SRC = '../../src/modules'
const SETTINGS = { enabled: true, maxDurationMs: 600000, updatedAt: null }

function createClient(response: Response, requests: Request[] = []) {
  return createAudioTranscriptionSettingsClient({
    apiUrl: API_URL,
    fetch: (request) => {
      requests.push(request)
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

describe('cliente da configuração de transcrição (spec 264 T5.2)', () => {
  test('GET lê a forma exata; sem decisão gravada updatedAt é null', async () => {
    const requests: Request[] = []
    const client = createClient(Response.json({ data: SETTINGS }), requests)

    expect(await client.get()).toEqual(SETTINGS)
    expect(requests[0]?.url).toBe(`${API_URL}/company-settings/audio-transcription`)
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer synthetic-token')
  })

  test('PUT leva só { enabled } e devolve o valor gravado', async () => {
    const requests: Request[] = []
    const saved = { ...SETTINGS, enabled: false, updatedAt: '2026-10-13T12:00:00.000Z' }
    const client = createClient(Response.json({ data: saved }), requests)

    expect(await client.save(false)).toEqual(saved)
    expect(requests[0]?.method).toBe('PUT')
    expect(await requests[0]?.json()).toEqual({ enabled: false })
  })

  test('resposta fora da forma exata é resposta inválida, pelo código', async () => {
    const invalid = [
      { ...SETTINGS, campoNovo: 1 },
      { enabled: 'sim', maxDurationMs: 600000, updatedAt: null },
      { enabled: true, maxDurationMs: 0, updatedAt: null },
      { enabled: true, maxDurationMs: 600000 },
      { enabled: true, maxDurationMs: 600000, updatedAt: 42 },
    ]
    for (const data of invalid) {
      const failure = await createClient(Response.json({ data }))
        .get()
        .catch((error: unknown) => error)
      expect(failure).toMatchObject({ code: 'OCCURRENCE_CONVERSATION_RESPONSE_INVALID' })
    }
  })

  test('403 chega pelo código da API', async () => {
    const client = createClient(
      Response.json({ error: { code: 'FORBIDDEN', message: 'x' } }, { status: 403 }),
    )
    const failure = await client.get().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(Error)
  })
})

describe('a frase do limite vem do número da API (RF15)', () => {
  test('minutos inteiros; o que não fecha minuto sai em segundos', () => {
    expect(resolveAudioTranscriptionLimit(600000)).toEqual({ unit: 'minutes', value: 10 })
    expect(resolveAudioTranscriptionLimit(120000)).toEqual({ unit: 'minutes', value: 2 })
    expect(resolveAudioTranscriptionLimit(90000)).toEqual({ unit: 'seconds', value: 90 })
    expect(resolveAudioTranscriptionLimit(1000)).toEqual({ unit: 'seconds', value: 1 })
  })
})

describe('a aba mora em Configurações, só com settings.manage (spec 264 T5.2)', () => {
  test('painel e aba registrados, com consulta ligada só nela', () => {
    expect(SETTINGS_PANEL_PLACEMENT.audioTranscription).toEqual({
      module: 'company-settings',
      source: 'audioTranscriptionSettings',
      tab: 'audioTranscription',
    })
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('audioTranscription')
    expect(
      resolveSettingsDataScope('company-settings', 'audioTranscription').audioTranscriptionSettings,
    ).toBe(true)
    expect(resolveSettingsDataScope('company-settings', 'company').audioTranscriptionSettings).toBe(
      false,
    )
  })

  test('sem settings.manage nenhuma aba, esta incluída', () => {
    expect(resolveVisibleCompanySettingsTabs({ canManage: false })).toEqual([])
    expect(resolveVisibleCompanySettingsTabs({ canManage: true })).toContain('audioTranscription')
  })

  test('a página renderiza o painel só com settings.manage', async () => {
    const page = await readFile(
      new URL(`${SRC}/company-settings/pages/CompanySettings.page.tsx`, import.meta.url),
      'utf8',
    )
    expect(page).toMatch(
      /tab === 'audioTranscription'\)?[\s\S]{0,80}<AudioTranscriptionSettingsPanel enabled=\{props\.canManageSettings\}/u,
    )
  })
})

describe('o painel (spec 264 T5.2)', () => {
  test('usa o Checkbox do design system com rótulo, nunca o input cru, e a frase do limite', async () => {
    const source = await readFile(
      new URL(
        `${SRC}/occurrence-conversation/components/AudioTranscriptionSettingsPanel.component.tsx`,
        import.meta.url,
      ),
      'utf8',
    )
    expect(source).toContain("from '@/components/ui/checkbox'")
    expect(source).not.toMatch(/<input/u)
    expect(source).toContain("t('audioTranscription.label')")
    expect(source).toContain('audioTranscription.limit.')
    expect(source).toContain("t('audioTranscription.offNotice')")
    expect(source).toMatch(/role="status"/u)
    expect(source).toMatch(/role="alert"/u)
  })
})

describe('locales pt-BR e en (spec 264 T5.2)', () => {
  const KEYS = {
    description: [],
    error: [],
    label: [],
    'limit.minutes': ['{minutes}'],
    'limit.seconds': ['{seconds}'],
    loadError: [],
    loading: [],
    offNotice: [],
    saved: [],
    saving: [],
    title: [],
  } as const satisfies Readonly<Record<string, readonly string[]>>
  const FILES = {
    en: 'occurrenceConversation.en.locale.json',
    'pt-BR': 'occurrenceConversation.locale.json',
  } as const

  for (const locale of Object.keys(FILES) as (keyof typeof FILES)[]) {
    test(`${locale}: todas as chaves, com os marcadores`, async () => {
      const catalog = JSON.parse(
        await readFile(
          new URL(`${SRC}/occurrence-conversation/locales/${FILES[locale]}`, import.meta.url),
          'utf8',
        ),
      ) as { audioTranscription: Record<string, unknown> }
      const flat = new Map<string, string>()
      for (const [key, value] of Object.entries(catalog.audioTranscription)) {
        if (typeof value === 'string') flat.set(key, value)
        else if (typeof value === 'object' && value !== null) {
          for (const [inner, text] of Object.entries(value))
            flat.set(`${key}.${inner}`, String(text))
        }
      }
      for (const [key, placeholders] of Object.entries(KEYS)) {
        const value = flat.get(key)
        expect(typeof value === 'string' && value.trim() !== '').toBe(true)
        for (const placeholder of placeholders) expect(value).toContain(placeholder)
      }
    })
  }

  test('a aba tem nome nos dois locales de Configurações', async () => {
    for (const file of ['companySettings.locale.json', 'companySettings.en.locale.json']) {
      const catalog = JSON.parse(
        await readFile(new URL(`${SRC}/company-settings/locales/${file}`, import.meta.url), 'utf8'),
      ) as { tabs: Record<string, string> }
      expect(catalog.tabs.audioTranscription?.trim()).toBeTruthy()
    }
  })
})

/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 264 T5.2 (RF15/RF17): a configuração "Transcrever áudios das conversas" — o cliente HTTP, os minutos do
 * limite, os rótulos nos dois idiomas e o endereço da seção em Configurações. A tela montada está em
 * `test/trip-hooks/audio-transcription-panel.contract.ts`.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  resolveCompanySettingsDataScope,
  resolveVisibleCompanySettingsTabs,
  SETTINGS_PANEL_PLACEMENT,
} from '@/modules/company-settings/shared/companySettingsTabs.service'
import {
  minutesOfAudioTranscriptionLimit,
  toAudioTranscriptionSettings,
} from '@/modules/occurrence-conversation/shared/audioTranscription.service'
import { createAudioTranscriptionClient } from '@/modules/occurrence-conversation/shared/audioTranscriptionClient.service'

const API_URL = 'https://api.transportada.test'
const PANEL_SOURCE =
  'src/modules/occurrence-conversation/components/AudioTranscriptionSettingsPanel.component.tsx'

const SETTINGS_BODY = { data: { enabled: true, maxDurationMs: 600_000, updatedAt: null } }

function createClient(response: Response, requests: Request[]) {
  return createAudioTranscriptionClient({
    apiUrl: API_URL,
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
}

async function failureOf(status: number): Promise<unknown> {
  const client = createClient(new Response(null, { status }), [])
  return client.get().then(
    () => 'resolved',
    (error: { failure?: string }) => error.failure,
  )
}

describe('o cliente da configuração de transcrição (spec 264 RF17)', () => {
  test('lê pelo caminho sem prefixo de versão, com o token e sem corpo', async () => {
    const requests: Request[] = []
    const settings = await createClient(Response.json(SETTINGS_BODY), requests).get()
    expect(settings).toEqual({ enabled: true, maxDurationMs: 600_000, updatedAt: undefined })
    const [request] = requests
    expect(request?.method).toBe('GET')
    expect(request?.url).toBe(`${API_URL}/company-settings/audio-transcription`)
    expect(request?.headers.get('authorization')).toBe('Bearer synthetic-token')
    expect(request?.body).toBeNull()
  })

  test('grava com o corpo estrito { enabled } e devolve a resposta lida', async () => {
    const requests: Request[] = []
    const body = {
      data: { enabled: false, maxDurationMs: 300_000, updatedAt: '2026-10-12T10:00:00.000Z' },
    }
    const settings = await createClient(Response.json(body), requests).save(false)
    expect(settings.updatedAt).toBe('2026-10-12T10:00:00.000Z')
    const [request] = requests
    expect(request?.method).toBe('PUT')
    expect(request?.headers.get('content-type')).toBe('application/json')
    expect(await request?.json()).toEqual({ enabled: false })
  })

  test('400, 401, 403 e o resto têm cada um a sua falha, e resposta fora do contrato falha', async () => {
    expect(await failureOf(400)).toBe('invalid')
    expect(await failureOf(401)).toBe('unauthenticated')
    expect(await failureOf(403)).toBe('forbidden')
    expect(await failureOf(500)).toBe('failed')
    const broken = createClient(Response.json({ data: { enabled: 'yes' } }), [])
    expect(await broken.get().catch((error: { failure?: string }) => error.failure)).toBe('failed')
  })

  test('falha de rede também é falha, não exceção solta', async () => {
    const client = createAudioTranscriptionClient({
      apiUrl: API_URL,
      fetch: () => Promise.reject(new Error('offline')),
      getAccessToken: () => Promise.resolve('synthetic-token'),
    })
    expect(await client.save(true).catch((error: { failure?: string }) => error.failure)).toBe(
      'failed',
    )
  })
})

describe('os minutos do limite (spec 264 RF15)', () => {
  test('saem do teto em milissegundos, arredondados para baixo', () => {
    expect(minutesOfAudioTranscriptionLimit(600_000)).toBe(10)
    expect(minutesOfAudioTranscriptionLimit(300_000)).toBe(5)
    expect(minutesOfAudioTranscriptionLimit(90_000)).toBe(1)
  })

  test('o leitor recusa teto ausente, zero ou não numérico', () => {
    expect(toAudioTranscriptionSettings({ data: { enabled: true } })).toBeNull()
    expect(toAudioTranscriptionSettings({ data: { enabled: true, maxDurationMs: 0 } })).toBeNull()
    expect(
      toAudioTranscriptionSettings({ data: { enabled: true, maxDurationMs: '600' } }),
    ).toBeNull()
  })

  test('o componente não carrega o número nem a frase fixos no JSX', () => {
    const source = readFileSync(PANEL_SOURCE, 'utf8')
    expect(source).toContain('minutesOfAudioTranscriptionLimit(settings.maxDurationMs)')
    expect(source).not.toMatch(/\b10\b|600_?000/u)
    expect(source).not.toMatch(/Só áudios|Only audio|Transcrever|Transcribe/u)
  })
})

function flatten(value: unknown, prefix = ''): readonly string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

function readLocale(file: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(`src/modules/occurrence-conversation/locales/${file}`, 'utf8'),
  ) as Record<string, unknown>
}

describe('os rótulos da transcrição (spec 264 RF19)', () => {
  const portuguese = readLocale('occurrenceConversation.locale.json').audioTranscription
  const english = readLocale('occurrenceConversation.en.locale.json').audioTranscription

  test('os dois idiomas têm exatamente as mesmas chaves', () => {
    expect(portuguese).toBeDefined()
    expect([...flatten(english)].sort()).toEqual([...flatten(portuguese)].sort())
  })

  test('o limite leva {{minutes}} nas duas formas do plural, em pt-BR e en', () => {
    for (const locale of [portuguese, english] as const) {
      const labels = locale as Record<string, string>
      expect(labels.limit_one).toContain('{{minutes}}')
      expect(labels.limit_other).toContain('{{minutes}}')
    }
  })

  test('a frase do que acontece ao desligar diz guardadas, escondidas e sem transcrição depois', () => {
    const pt = (portuguese as Record<string, string>).effectOfTurningOff?.toLowerCase() ?? ''
    expect(pt).toContain('guardadas')
    expect(pt).toContain('escondidas')
    expect(pt).toContain('não são transcritos depois')
    const en = (english as Record<string, string>).effectOfTurningOff?.toLowerCase() ?? ''
    expect(en).toContain('kept but hidden')
    expect(en).toContain('not transcribed later')
  })

  test('a explicação diz que é de máquina e que nenhuma voz sai para serviço externo', () => {
    expect((portuguese as Record<string, string>).machine).toContain('por máquina')
    expect((portuguese as Record<string, string>).machine).toContain('nenhuma voz sai')
    expect((english as Record<string, string>).machine).toContain('by a machine')
    expect((english as Record<string, string>).machine).toContain('no voice leaves')
  })
})

describe('o endereço da seção em Configurações (spec 264 RF17)', () => {
  test('mora na própria aba da empresa, com a própria consulta ligada só nela', () => {
    expect(SETTINGS_PANEL_PLACEMENT.audioTranscription).toEqual({
      module: 'company-settings',
      source: 'audioTranscription',
      tab: 'audioTranscription',
    })
    expect(resolveCompanySettingsDataScope('audioTranscription').audioTranscription).toBe(true)
    expect(resolveCompanySettingsDataScope('company').audioTranscription).toBe(false)
  })

  test('a aba só aparece com settings.manage', () => {
    expect(resolveVisibleCompanySettingsTabs({ canManage: true })).toContain('audioTranscription')
    expect(resolveVisibleCompanySettingsTabs({ canManage: false })).toEqual([])
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239 T3.1/T3.3: as regras puras do painel da retenção da posição, o cliente HTTP e a linha do
 * tempo sem "90 dias". O painel montado está em `test/trip-hooks/location-retention-panel.contract.ts`.
 */
import { describe, expect, it } from 'bun:test'

import { i18n } from '../../src/modules/shared/i18n/i18n.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import tripEn from '../../src/modules/trip/locales/trip.en.locale.json'
import {
  formatLocationRetentionMoment,
  isLocationRetentionDays,
  parseLocationRetentionDays,
  resolveLocationRetentionConfirmation,
  resolveLocationRetentionStatus,
  summarizeLocationRetentionImpact,
} from '../../src/modules/trip/shared/locationRetention.service'
import {
  isLocationRetentionImpact,
  isLocationRetentionSettings,
  type LocationRetentionSettings,
} from '../../src/modules/trip/shared/locationRetention.validation'
import { createLocationRetentionClient } from '../../src/modules/trip/shared/locationRetentionClient.service'

const NOW_MS = Date.parse('2026-10-03T15:00:00.000Z')
const HOUR_MS = 3_600_000

function settingsOf(overrides: Partial<LocationRetentionSettings>): LocationRetentionSettings {
  return {
    origin: 'company',
    purgeEffectiveAt: null,
    purgeEnabled: false,
    retentionDays: 90,
    updatedAt: null,
    ...overrides,
  }
}

describe('o prazo de retenção (spec 239 D6)', () => {
  it('só inteiro de 30 a 90 vale; nada é arredondado nem aparado', () => {
    for (const valid of [30, 31, 60, 89, 90]) expect(isLocationRetentionDays(valid)).toBe(true)
    for (const invalid of [29, 91, 0, -30, 45.5, Number.NaN]) {
      expect(isLocationRetentionDays(invalid)).toBe(false)
    }
    expect(parseLocationRetentionDays('30')).toBe(30)
    expect(parseLocationRetentionDays('90')).toBe(90)
    for (const raw of ['29', '91', '', '45.5', '-40', '4e1', ' 40', '0x28']) {
      expect(parseLocationRetentionDays(raw)).toBeUndefined()
    }
  })
})

describe('o estado do painel e a carência (D5)', () => {
  it('desligado é desligado, mesmo com data de carência gravada', () => {
    const future = new Date(NOW_MS + HOUR_MS).toISOString()
    expect(
      resolveLocationRetentionStatus({
        nowMs: NOW_MS,
        settings: settingsOf({ purgeEffectiveAt: future }),
      }),
    ).toBe('off')
  })

  it('ligado com a data no futuro aguarda; no passado, e exatamente agora, já vale', () => {
    const at = (offsetMs: number) =>
      settingsOf({
        purgeEffectiveAt: new Date(NOW_MS + offsetMs).toISOString(),
        purgeEnabled: true,
      })
    expect(resolveLocationRetentionStatus({ nowMs: NOW_MS, settings: at(HOUR_MS) })).toBe('waiting')
    expect(resolveLocationRetentionStatus({ nowMs: NOW_MS, settings: at(1) })).toBe('waiting')
    expect(resolveLocationRetentionStatus({ nowMs: NOW_MS, settings: at(0) })).toBe('active')
    expect(resolveLocationRetentionStatus({ nowMs: NOW_MS, settings: at(-HOUR_MS) })).toBe('active')
    expect(
      resolveLocationRetentionStatus({
        nowMs: NOW_MS,
        settings: settingsOf({ purgeEnabled: true }),
      }),
    ).toBe('active')
  })
})

describe('quando a confirmação aparece (RF9)', () => {
  const stored = (purgeEnabled: boolean, retentionDays: number) =>
    settingsOf({ purgeEnabled, retentionDays })

  it('ligar e encurtar com o expurgo ligado pedem; o resto salva direto', () => {
    const cases = [
      {
        expected: 'enable',
        next: { purgeEnabled: true, retentionDays: 90 },
        stored: stored(false, 90),
      },
      {
        expected: 'enable',
        next: { purgeEnabled: true, retentionDays: 30 },
        stored: stored(false, 30),
      },
      {
        expected: 'shorten',
        next: { purgeEnabled: true, retentionDays: 30 },
        stored: stored(true, 90),
      },
      {
        expected: 'shorten',
        next: { purgeEnabled: true, retentionDays: 59 },
        stored: stored(true, 60),
      },
      {
        expected: undefined,
        next: { purgeEnabled: true, retentionDays: 90 },
        stored: stored(true, 30),
      },
      {
        expected: undefined,
        next: { purgeEnabled: true, retentionDays: 60 },
        stored: stored(true, 60),
      },
      {
        expected: undefined,
        next: { purgeEnabled: false, retentionDays: 30 },
        stored: stored(true, 90),
      },
      {
        expected: undefined,
        next: { purgeEnabled: false, retentionDays: 30 },
        stored: stored(false, 90),
      },
    ] as const
    for (const { expected, next, stored: current } of cases) {
      expect(resolveLocationRetentionConfirmation({ next, stored: current })).toBe(expected)
    }
  })
})

describe('a contagem do impacto, em linguagem de tela (D5)', () => {
  it('soma as duas tabelas de ocorrência numa linha e marca o teto por grupo', () => {
    const summary = summarizeLocationRetentionImpact({
      byTable: [
        { capped: false, count: 10, kind: 'stop_event' },
        { capped: false, count: 20, kind: 'delivery_proof' },
        { capped: false, count: 30, kind: 'status_event' },
        { capped: false, count: 4, kind: 'stop_occurrence' },
        { capped: true, count: 100_000, kind: 'document_occurrence' },
      ],
    })

    expect(summary.groups).toEqual([
      { count: 10, id: 'arrival', isCapped: false },
      { count: 20, id: 'canhotoPhoto', isCapped: false },
      { count: 30, id: 'statusChange', isCapped: false },
      { count: 100_004, id: 'occurrence', isCapped: true },
    ])
    expect(summary.total).toBe(100_064)
    expect(summary.isCapped).toBe(true)
  })

  it('sem nada a apagar, o total é zero e nada está no teto', () => {
    const summary = summarizeLocationRetentionImpact({ byTable: [] })
    expect(summary.total).toBe(0)
    expect(summary.isCapped).toBe(false)
  })

  it('a carência é mostrada como DD/MM HH:mm', () => {
    const moment = new Date(2026, 9, 4, 9, 5)
    expect(formatLocationRetentionMoment(moment.toISOString())).toBe('04/10 09:05')
  })
})

describe('a resposta da API (validação manual, como a diária)', () => {
  const VALID = {
    origin: 'default',
    purgeEffectiveAt: null,
    purgeEnabled: false,
    retentionDays: 90,
    updatedAt: null,
  }

  it('aceita o padrão sem linha e tolera campo novo', () => {
    expect(isLocationRetentionSettings(VALID)).toBe(true)
    expect(isLocationRetentionSettings({ ...VALID, campoFuturo: 1 })).toBe(true)
    expect(isLocationRetentionImpact({ byTable: [], campoFuturo: 1 })).toBe(true)
  })

  it('recusa o que não é do contrato', () => {
    expect(isLocationRetentionSettings({ ...VALID, origin: 'driver' })).toBe(false)
    expect(isLocationRetentionSettings({ ...VALID, purgeEnabled: 'false' })).toBe(false)
    expect(isLocationRetentionSettings({ ...VALID, retentionDays: '90' })).toBe(false)
    expect(isLocationRetentionSettings({ ...VALID, purgeEffectiveAt: undefined })).toBe(false)
    expect(isLocationRetentionSettings(null)).toBe(false)
  })

  it('um tipo de evento desconhecido recusa a contagem inteira: subestimar o que cai é pior', () => {
    expect(
      isLocationRetentionImpact({ byTable: [{ capped: false, count: 1, kind: 'driver_ping' }] }),
    ).toBe(false)
    expect(
      isLocationRetentionImpact({ byTable: [{ capped: false, count: '1', kind: 'stop_event' }] }),
    ).toBe(false)
  })
})

describe('o cliente HTTP', () => {
  type Seen = { body: string; headers: Headers; method: string; url: string }

  function clientWith(respond: (request: Request) => Response | Promise<Response>) {
    const seen: Seen[] = []
    const client = createLocationRetentionClient({
      apiBaseUrl: 'http://api.test',
      fetch: async (request) => {
        seen.push({
          body: await request.clone().text(),
          headers: request.headers,
          method: request.method,
          url: request.url,
        })
        return respond(request)
      },
      getAccessToken: () => Promise.resolve('token-sintetico'),
    })
    return { client, seen }
  }

  const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status })

  it('lê, grava e apaga nos caminhos e verbos da API, com o token no cabeçalho', async () => {
    const saved = settingsOf({ purgeEnabled: true, retentionDays: 45 })
    const { client, seen } = clientWith((request) =>
      request.method === 'DELETE' ? new Response(null, { status: 204 }) : json(saved),
    )

    expect(await client.get()).toEqual(saved)
    expect(await client.save({ purgeEnabled: true, retentionDays: 45 })).toEqual(saved)
    await client.clear()

    expect(seen.map((call) => `${call.method} ${call.url}`)).toEqual([
      'GET http://api.test/company-settings/location-retention',
      'PUT http://api.test/company-settings/location-retention',
      'DELETE http://api.test/company-settings/location-retention',
    ])
    expect(JSON.parse(seen[1]?.body ?? '')).toEqual({ purgeEnabled: true, retentionDays: 45 })
    expect(seen[1]?.headers.get('content-type')).toBe('application/json')
    expect(
      seen.every((call) => call.headers.get('authorization') === 'Bearer token-sintetico'),
    ).toBe(true)
  })

  it('a contagem vai por query string só com o prazo', async () => {
    const { client, seen } = clientWith(() =>
      json({ byTable: [{ capped: false, count: 7, kind: 'stop_event' }] }),
    )

    expect(await client.readImpact(45)).toEqual({
      byTable: [{ capped: false, count: 7, kind: 'stop_event' }],
    })
    expect(seen[0]?.url).toBe(
      'http://api.test/company-settings/location-retention/impact?retentionDays=45',
    )
  })

  async function rejectionOf(promise: Promise<unknown>): Promise<string> {
    try {
      await promise
    } catch (error) {
      return error instanceof Error ? error.message : 'NOT_AN_ERROR'
    }
    return 'RESOLVED'
  }

  it('a recusa da API chega com o código; rede e corpo inválido têm código próprio', async () => {
    const refused = clientWith(
      () =>
        new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'x' } }), {
          status: 403,
        }),
    )
    expect(await rejectionOf(refused.client.get())).toBe('FORBIDDEN')

    const invalid = clientWith(() => json({ purgeEnabled: 'sim' }))
    expect(await rejectionOf(invalid.client.get())).toBe('LOCATION_RETENTION_RESPONSE_INVALID')

    const offline = clientWith(() => {
      throw new TypeError('fetch failed')
    })
    expect(await rejectionOf(offline.client.get())).toBe('LOCATION_RETENTION_NETWORK_ERROR')

    const failedClear = clientWith(() => new Response(null, { status: 500 }))
    expect(await rejectionOf(failedClear.client.clear())).toBe('LOCATION_RETENTION_REQUEST_FAILED')
  })
})

describe('a linha do tempo no estado expirado não cita o prazo (D8, CA11)', () => {
  const FIXED_NUMBER = /\b\d+\s*(?:dias|days)\b/iu

  it('as frases do estado expired não trazem número de dias nos dois idiomas', () => {
    for (const locale of [trip, tripEn]) {
      const { eventTimeline } = locale as unknown as {
        eventTimeline: {
          location: { expired: string }
          map: Record<string, string>
        }
      }
      const phrases = [
        eventTimeline.location.expired,
        eventTimeline.map.missingExpired_one,
        eventTimeline.map.missingExpired_other,
      ]
      for (const phrase of phrases) {
        expect(typeof phrase).toBe('string')
        expect(phrase).not.toMatch(FIXED_NUMBER)
      }
    }
  })

  it('renderizadas pelo i18n, dizem "prazo de retenção" em pt-BR e "retention period" em en', () => {
    const portuguese = i18n.getFixedT('pt-BR', 'trip')
    const english = i18n.getFixedT('en', 'trip')

    expect(portuguese('eventTimeline.location.expired')).toBe(
      'A coordenada é apagada pelo prazo de retenção; o evento permanece.',
    )
    expect(portuguese('eventTimeline.map.missingExpired', { count: 2 })).toBe(
      '2 eventos com posição apagada pelo prazo de retenção.',
    )
    expect(english('eventTimeline.location.expired')).toContain('retention period')
    expect(english('eventTimeline.map.missingExpired', { count: 1 })).toContain('retention period')
  })
})

/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  COMPANY_SETTINGS_TAB_IDS,
  resolveCompanySettingsDataScope,
} from '../../src/modules/company-settings/shared/companySettingsTabs.service'
import {
  buildWhatsAppEvolutionSubmission,
  startWhatsAppEvolutionDraft,
  WHATSAPP_EVOLUTION_DEFAULT_DRAFT,
} from '../../src/modules/company-settings/shared/whatsappEvolutionForm.service'
import { createWhatsAppEvolutionClient } from '../../src/modules/company-settings/shared/whatsappEvolutionClient.service'
import { decodeWhatsAppQrPng } from '../../src/modules/company-settings/shared/whatsappEvolutionQrImage.service'
import {
  isWhatsAppEvolutionQrResponse,
  isWhatsAppEvolutionResponse,
  WHATSAPP_DEFAULT_PROVIDERS,
  WHATSAPP_EVOLUTION_CONNECTION_STATES,
  WHATSAPP_EVOLUTION_DAILY_CAP_RANGE,
  WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE,
  WHATSAPP_EVOLUTION_STATUSES,
  type WhatsAppEvolutionSettings,
} from '../../src/modules/company-settings/shared/whatsappEvolution.validation'

import en from '../../src/modules/company-settings/locales/companySettings.en.locale.json'
import pt from '../../src/modules/company-settings/locales/companySettings.locale.json'

const API_SCHEMA = '../../../api-transportada/src/database/whatsapp-evolution.schema.ts'

const STORED: WhatsAppEvolutionSettings = {
  apiKeyConfigured: true,
  baseUrl: 'https://evolution.exemplo.com',
  connectionCheckedAt: null,
  connectionState: 'unknown',
  createdAt: '2026-10-27T12:00:00.000Z',
  dailyCap: 50,
  defaultProvider: 'meta',
  id: 'id',
  instanceName: 'transportada',
  minIntervalSeconds: 15,
  riskAcknowledgedAt: null,
  status: 'disabled',
  updatedAt: '2026-10-27T12:00:00.000Z',
  version: '1',
}

function apiList(name: string): string[] {
  const source = readFileSync(new URL(API_SCHEMA, import.meta.url), 'utf8')
  const start = source.indexOf(`export const ${name} = [`)
  const body = source.slice(source.indexOf('[', start), source.indexOf(']', start))
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1] ?? '')
}

describe('WhatsApp (Evolution) settings panel (spec 281 T4)', () => {
  test('the vocabularies and ranges are copies by value of the API ones', () => {
    expect([...WHATSAPP_EVOLUTION_STATUSES].map(String)).toEqual(
      apiList('WHATSAPP_EVOLUTION_STATUSES'),
    )
    expect([...WHATSAPP_DEFAULT_PROVIDERS].map(String)).toEqual(
      apiList('WHATSAPP_DEFAULT_PROVIDERS'),
    )
    expect([...WHATSAPP_EVOLUTION_CONNECTION_STATES].map(String)).toEqual(
      apiList('WHATSAPP_EVOLUTION_CONNECTION_STATES'),
    )
    const source = readFileSync(new URL(API_SCHEMA, import.meta.url), 'utf8')
    expect(source).toContain(
      `WHATSAPP_EVOLUTION_DAILY_CAP_RANGE = { max: ${WHATSAPP_EVOLUTION_DAILY_CAP_RANGE.max}, min: ${WHATSAPP_EVOLUTION_DAILY_CAP_RANGE.min} }`,
    )
    expect(source).toContain(
      `WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE = { max: ${WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE.max}, min: ${WHATSAPP_EVOLUTION_MIN_INTERVAL_RANGE.min} }`,
    )
  })

  test('the WhatsApp tab exists and turns on only its own query', () => {
    expect(COMPANY_SETTINGS_TAB_IDS).toContain('whatsapp')
    expect(resolveCompanySettingsDataScope('whatsapp').whatsappEvolution).toBe(true)
    expect(resolveCompanySettingsDataScope('taxes').whatsappEvolution).toBe(false)
  })

  test('a new setup needs the key, the risk notice and valid limits', () => {
    const filled = {
      ...WHATSAPP_EVOLUTION_DEFAULT_DRAFT,
      apiKey: 'chave',
      baseUrl: 'https://evolution.exemplo.com',
      instanceName: 'transportada',
    }

    expect(buildWhatsAppEvolutionSubmission(filled, null)).toMatchObject({
      apiKey: 'chave',
      status: 'disabled',
    })
    expect(buildWhatsAppEvolutionSubmission({ ...filled, apiKey: '' }, null)).toBeNull()
    expect(buildWhatsAppEvolutionSubmission({ ...filled, enabled: true }, null)).toBeNull()
    expect(
      buildWhatsAppEvolutionSubmission({ ...filled, acknowledgeRisk: true, enabled: true }, null),
    ).toMatchObject({ acknowledgeRisk: true, status: 'active' })
    for (const dailyCap of ['0', '1001', 'abc', '']) {
      expect(buildWhatsAppEvolutionSubmission({ ...filled, dailyCap }, null)).toBeNull()
    }
    expect(
      buildWhatsAppEvolutionSubmission({ ...filled, instanceName: 'com espaço' }, null),
    ).toBeNull()
  })

  test('an update opens with the stored values, an empty key, and omits the key when empty', () => {
    const draft = startWhatsAppEvolutionDraft(STORED)

    expect(draft.apiKey).toBe('')
    expect(draft.baseUrl).toBe(STORED.baseUrl)
    const submission = buildWhatsAppEvolutionSubmission(draft, STORED)
    expect(submission).not.toBeNull()
    expect(submission).not.toHaveProperty('apiKey')
  })

  test('the default provider is chosen on the screen and Evolution needs the channel on (P3)', () => {
    const filled = {
      ...WHATSAPP_EVOLUTION_DEFAULT_DRAFT,
      acknowledgeRisk: true,
      apiKey: 'chave',
      baseUrl: 'https://evolution.exemplo.com',
      instanceName: 'transportada',
    }

    expect(buildWhatsAppEvolutionSubmission(filled, null)).toMatchObject({
      defaultProvider: 'meta',
    })
    expect(
      buildWhatsAppEvolutionSubmission({ ...filled, defaultProvider: 'evolution' }, null),
    ).toBeNull()
    expect(
      buildWhatsAppEvolutionSubmission(
        { ...filled, defaultProvider: 'evolution', enabled: true },
        null,
      ),
    ).toMatchObject({ defaultProvider: 'evolution', status: 'active' })
    expect(
      startWhatsAppEvolutionDraft({ ...STORED, defaultProvider: 'evolution' }).defaultProvider,
    ).toBe('evolution')
    for (const provider of WHATSAPP_DEFAULT_PROVIDERS) {
      expect(Object.keys(pt.whatsappEvolution.provider)).toContain(provider)
    }
  })

  test('the response guards accept null settings and refuse a payload carrying a wrong state', () => {
    expect(isWhatsAppEvolutionResponse({ data: null })).toBe(true)
    expect(isWhatsAppEvolutionResponse({ data: STORED })).toBe(true)
    expect(isWhatsAppEvolutionResponse({ data: { ...STORED, status: 'on' } })).toBe(false)
    expect(
      isWhatsAppEvolutionQrResponse({
        data: {
          pairingCode: null,
          qrCode: 'data:image/png;base64,AA',
          refreshAfterSeconds: 20,
          state: 'connecting',
        },
      }),
    ).toBe(true)
    expect(isWhatsAppEvolutionQrResponse({ data: { qrCode: 1 } })).toBe(false)
  })

  test('both locales carry the same WhatsApp keys, and the panel never reads the key back', () => {
    expect(Object.keys(en.whatsappEvolution).sort()).toEqual(
      Object.keys(pt.whatsappEvolution).sort(),
    )
    expect(en.tabs.whatsapp).toBeDefined()
    const panel = readFileSync(
      new URL(
        '../../src/modules/company-settings/components/WhatsAppEvolutionPanel.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    expect(panel).not.toMatch(/stored\??\.apiKey(?!Configured)/u)
    expect(panel).toContain('type="password"')
  })

  test('create and connect sends only the risk notice and reads the availability flag', async () => {
    const requests: { body: string; method: string; url: string }[] = []
    const client = createWhatsAppEvolutionClient({
      apiBaseUrl: 'https://api.example',
      fetch: async (request) => {
        requests.push({ body: await request.text(), method: request.method, url: request.url })
        return new Response(
          JSON.stringify(
            request.method === 'GET'
              ? { data: null, provisioningAvailable: true }
              : { data: STORED },
          ),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    expect(await client.get()).toEqual({ provisioningAvailable: true, settings: null })
    expect(await client.provision(true)).toEqual(STORED)
    expect(requests[1]).toEqual({
      body: '{"acknowledgeRisk":true}',
      method: 'POST',
      url: 'https://api.example/company-settings/whatsapp-evolution/provision',
    })
  })

  test('disconnect posts to the API and reads the masked number of the connection', async () => {
    const requests: { method: string; url: string }[] = []
    const client = createWhatsAppEvolutionClient({
      apiBaseUrl: 'https://api.example',
      fetch: (request) => {
        requests.push({ method: request.method, url: request.url })
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: request.url.endsWith('/connection')
                ? {
                    checkedAt: '2026-10-31T12:00:00.000Z',
                    ownerMasked: '+55 ••••6772',
                    state: 'open',
                  }
                : { checkedAt: '2026-10-31T12:00:01.000Z', state: 'close' },
            }),
          ),
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })

    expect((await client.connection()).ownerMasked).toBe('+55 ••••6772')
    expect((await client.disconnect()).state).toBe('close')
    expect(requests[1]).toEqual({
      method: 'POST',
      url: 'https://api.example/company-settings/whatsapp-evolution/disconnect',
    })
  })

  test('the disconnect texts exist in pt and en', () => {
    for (const locale of [pt, en]) {
      const connection = (
        locale as unknown as { whatsappEvolution: { connection: Record<string, string> } }
      ).whatsappEvolution.connection
      for (const key of [
        'connectedNumber',
        'disconnect',
        'disconnectConfirm',
        'disconnectConfirmAction',
        'disconnectCancel',
      ]) {
        expect(connection[key]).toBeTruthy()
      }
    }
  })
})

describe('imagem do QR (img-src não admite data:)', () => {
  test('converte o PNG em base64 para bytes', () => {
    const bytes = decodeWhatsAppQrPng('data:image/png;base64,iVBORw0KGgo=')
    expect(bytes).not.toBeNull()
    expect(Array.from(bytes ?? [])).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  })

  test('recusa o que não é PNG em base64', () => {
    expect(decodeWhatsAppQrPng('https://exemplo.test/qr.png')).toBeNull()
    expect(decodeWhatsAppQrPng('data:image/svg+xml;base64,AAAA')).toBeNull()
    expect(decodeWhatsAppQrPng('data:image/png;base64,@@@')).toBeNull()
  })
})

describe('validade do QR na tela', () => {
  test('os dois idiomas dizem quanto resta, que venceu e oferecem gerar outro', () => {
    for (const locale of [pt, en]) {
      const connection = locale.whatsappEvolution.connection
      expect(connection.qrValidity).toContain('{{seconds}}')
      expect(connection.qrExpired.length).toBeGreaterThan(0)
      expect(connection.refreshQr.length).toBeGreaterThan(0)
    }
  })
})

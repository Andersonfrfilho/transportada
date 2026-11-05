/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

// Efeito colateral: inicializa o i18next real com os dicionários de produção.
import '@/modules/shared/i18n/i18n.service'
import enLocale from '@/modules/fleet/locales/fleet.en.locale.json'
import ptLocale from '@/modules/fleet/locales/fleet.locale.json'
import {
  createDriverAttachmentClient,
  DriverAttachmentRequestError,
} from '@/modules/fleet/shared/driverAttachmentClient.service'
import {
  DRIVER_ATTACHMENT_TYPES,
  isDriverAttachmentListResponse,
} from '@/modules/fleet/shared/driverAttachment.validation'
import { FLEET_REVEAL_PERMISSION } from '@/modules/fleet/shared/fleet.constant'

const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const ATTACHMENT = {
  createdAt: '2026-11-05T12:00:00.000Z',
  hasSuggestion: true,
  id: '00000000-0000-4000-8000-0000000000e1',
  type: 'cnh',
  uploadedBy: { id: '00000000-0000-4000-8000-0000000000a1', name: 'Ana Operadora' },
} as const

type Call = Readonly<{ method: string; url: string }>

function createFixture(response: Response) {
  const calls: Call[] = []
  const client = createDriverAttachmentClient({
    apiBaseUrl: 'https://api.example.test',
    fetch: (request) => {
      calls.push({ method: request.method, url: request.url })
      return Promise.resolve(response)
    },
    getAccessToken: () => Promise.resolve('token'),
  })
  return { calls, client }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe('documentos na ficha do motorista (spec 091 T016)', () => {
  it('lista pelo caminho da ficha, e o que volta é só tipo, data, autor e o aviso de sugestão', async () => {
    const fixture = createFixture(json({ data: [ATTACHMENT] }))

    expect(await fixture.client.list(DRIVER_ID)).toEqual([ATTACHMENT])
    expect(fixture.calls[0]).toEqual({
      method: 'GET',
      url: `https://api.example.test/fleet/drivers/${DRIVER_ID}/attachments`,
    })
  })

  it('recusa resposta com forma estranha e leva o código da API na exceção', async () => {
    const invalid = await createFixture(json({ data: [{ id: 1 }] }))
      .client.list(DRIVER_ID)
      .catch((caught: unknown) => caught)
    expect(invalid).toBeInstanceOf(DriverAttachmentRequestError)
    expect((invalid as Error).message).toBe('DRIVER_ATTACHMENT_RESPONSE_INVALID')

    const forbidden = await createFixture(json({ error: { code: 'FORBIDDEN' } }, 403))
      .client.list(DRIVER_ID)
      .catch((caught: unknown) => caught)
    expect((forbidden as Error).message).toBe('FORBIDDEN')
    expect(isDriverAttachmentListResponse({ data: [ATTACHMENT] })).toBe(true)
    expect(isDriverAttachmentListResponse({ data: [{ ...ATTACHMENT, type: 'crlv' }] })).toBe(false)
  })

  it('a permissão de abrir o arquivo é a própria, e não a de anexar', () => {
    expect(FLEET_REVEAL_PERMISSION).toBe('fleet.reveal')
  })

  it('todo tipo tem rótulo nos dois idiomas', () => {
    for (const locale of [ptLocale, enLocale]) {
      const types = (locale as unknown as { driverAttachments: { types: Record<string, string> } })
        .driverAttachments.types
      for (const type of DRIVER_ATTACHMENT_TYPES) expect(types[type]).toBeString()
    }
  })
})

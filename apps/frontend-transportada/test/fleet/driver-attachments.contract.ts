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
import { DRIVER_ATTACHMENT_MAX_BYTES } from '@/modules/fleet/shared/driverAttachment.validation'
import { FLEET_REVEAL_PERMISSION } from '@/modules/fleet/shared/fleet.constant'

const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const ATTACHMENT = {
  createdAt: '2026-11-05T12:00:00.000Z',
  hasSuggestion: true,
  id: '00000000-0000-4000-8000-0000000000e1',
  type: 'cnh',
  uploadedBy: { id: '00000000-0000-4000-8000-0000000000a1', name: 'Ana Operadora' },
} as const

type Call = Readonly<{ body: FormData | null; method: string; url: string }>

function createFixture(response: Response) {
  const calls: Call[] = []
  const client = createDriverAttachmentClient({
    apiBaseUrl: 'https://api.example.test',
    fetch: async (request) => {
      const body = request.method === 'POST' ? await request.formData() : null
      calls.push({ body, method: request.method, url: request.url })
      return response
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
    expect(fixture.calls[0]).toMatchObject({
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

  it('anexa por multipart com só o tipo e o arquivo, sem content-type escrito à mão', async () => {
    const fixture = createFixture(json({ data: ATTACHMENT }, 201))
    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'cnh.pdf', {
      type: 'application/pdf',
    })

    expect(await fixture.client.upload({ driverId: DRIVER_ID, file, type: 'cnh' })).toEqual(
      ATTACHMENT,
    )

    const form = fixture.calls[0]?.body
    expect(fixture.calls[0]?.method).toBe('POST')
    expect([...(form?.keys() ?? [])].sort()).toEqual(['file', 'type'])
    expect(form?.get('type')).toBe('cnh')
    expect((form?.get('file') as File).name).toBe('cnh.pdf')
  })

  it('remove com DELETE e entende o 204 sem corpo', async () => {
    const fixture = createFixture(new Response(null, { status: 204 }))

    await fixture.client.remove({ attachmentId: ATTACHMENT.id, driverId: DRIVER_ID })

    expect(fixture.calls[0]).toMatchObject({
      method: 'DELETE',
      url: `https://api.example.test/fleet/drivers/${DRIVER_ID}/attachments/${ATTACHMENT.id}`,
    })
  })

  it('abrir devolve só o link assinado, pelo caminho do conteúdo', async () => {
    const fixture = createFixture(json({ data: { url: 'https://bucket.example.test/signed' } }))

    expect(await fixture.client.reveal({ attachmentId: ATTACHMENT.id, driverId: DRIVER_ID })).toBe(
      'https://bucket.example.test/signed',
    )
    expect(fixture.calls[0]?.url).toBe(
      `https://api.example.test/fleet/drivers/${DRIVER_ID}/attachments/${ATTACHMENT.id}/content`,
    )
    const forbidden = await createFixture(json({ error: { code: 'FORBIDDEN' } }, 403))
      .client.reveal({ attachmentId: ATTACHMENT.id, driverId: DRIVER_ID })
      .catch((caught: unknown) => caught)
    expect((forbidden as Error).message).toBe('FORBIDDEN')
  })

  it('o teto de envio acompanha o da API (1,5 MiB)', () => {
    expect(DRIVER_ATTACHMENT_MAX_BYTES).toBe(1_572_864)
  })
})

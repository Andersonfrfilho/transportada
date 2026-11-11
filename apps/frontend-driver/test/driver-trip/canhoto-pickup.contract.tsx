/* Copyright (c) 2026 Ada Technology. MIT License. */
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, describe, expect, test } from 'bun:test'

import { i18n } from '@/modules/shared/i18n/i18n.service'
import { DriverCanhotoPickupList } from '@/modules/driver-trip/components/DriverCanhotoPickupList.component'
import { createDriverTripClient } from '@/modules/driver-trip/shared/driverTripClient.service'
import { isStopResolved } from '@/modules/driver-trip/shared/driverTripProgress.service'
import {
  readCanhotoPickups,
  toDriverTripSnapshot,
} from '@/modules/driver-trip/shared/driverTripResponse.validation'

/**
 * Spec 321 T6 (D4b, RF4/RF6, CA04): a parada "Coletar canhoto" do motorista da viagem nova. A leitura é tolerante (API
 * anterior não manda o campo), o cartão mostra a nota de origem e a explicação escrita, e a foto vai para a rota da coleta
 * como `kind=photo`.
 */
function textOf(html: string): string {
  return html
    .replaceAll(/<svg[\s\S]*?<\/svg>/gu, '')
    .replaceAll(/<[^>]+>/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim()
}

afterAll(async () => {
  await i18n.changeLanguage('pt-BR')
})

const PICKUP = {
  documentNumber: '106187',
  documentSeries: '1',
  id: '00000000-0000-4000-8000-000000000321',
  photoSentAt: null,
  recipientDisplayName: 'Mercado Central',
} as const

describe('a coleta de canhoto no snapshot (spec 321 T6)', () => {
  test('a leitura tolera ausente, malformado e item sem id', () => {
    expect(readCanhotoPickups(undefined)).toEqual([])
    expect(readCanhotoPickups('x')).toEqual([])
    expect(readCanhotoPickups([{ documentNumber: '1' }, 7, null])).toEqual([])
    expect(readCanhotoPickups([PICKUP])).toEqual([PICKUP])
    expect(readCanhotoPickups([{ id: 'p1', photoSentAt: 5 }])).toEqual([
      {
        documentNumber: '',
        documentSeries: '',
        id: 'p1',
        photoSentAt: null,
        recipientDisplayName: '',
      },
    ])
  })

  test('a parada só de coleta chega ao app com a coleta e sem nota', () => {
    const snapshot = toDriverTripSnapshot({
      data: {
        isRegisteredDriver: true,
        pendingProofs: [],
        score: null,
        trips: [
          {
            createdAt: '2026-11-11T10:00:00.000Z',
            id: 'trip-1',
            manifest: null,
            status: 'dispatched',
            stops: [
              {
                arrivedAt: null,
                canhotoPickups: [PICKUP],
                completedAt: null,
                documents: [],
                id: 'stop-1',
                label: 'Cliente',
                latitude: null,
                longitude: null,
                schedule: null,
                sequence: 1,
              },
            ],
            vehiclePlate: 'ABC1D23',
          },
        ],
      },
    })
    const stop = snapshot.trips[0]?.stops[0]
    expect(stop?.documents).toEqual([])
    expect(stop?.canhotoPickups).toEqual([PICKUP])
  })
})

describe('o cartão da coleta (spec 321 T6)', () => {
  const noopSend = () => Promise.resolve('sent' as const)

  test('sem coleta não renderiza nada', () => {
    expect(
      renderToStaticMarkup(
        <DriverCanhotoPickupList isReadOnly={false} onSend={noopSend} pickups={undefined} />,
      ),
    ).toBe('')
    expect(
      renderToStaticMarkup(
        <DriverCanhotoPickupList isReadOnly={false} onSend={noopSend} pickups={[]} />,
      ),
    ).toBe('')
  })

  test('com coleta mostra a nota, o cliente, a explicação escrita e o envio — nos dois idiomas', async () => {
    await i18n.changeLanguage('pt-BR')
    const pt = textOf(
      renderToStaticMarkup(
        <DriverCanhotoPickupList isReadOnly={false} onSend={noopSend} pickups={[PICKUP]} />,
      ),
    )
    expect(pt).toContain('Coletar canhoto')
    expect(pt).toContain('NF 106187')
    expect(pt).toContain('Mercado Central')
    expect(pt).toContain('só busca o canhoto')
    expect(pt).toContain('Enviar canhoto')
    await i18n.changeLanguage('en')
    const en = textOf(
      renderToStaticMarkup(
        <DriverCanhotoPickupList isReadOnly={false} onSend={noopSend} pickups={[PICKUP]} />,
      ),
    )
    expect(en).toContain('Pick up receipt')
    expect(en).toContain('Send receipt')
  })

  test('foto já enviada espera a conferência e não oferece novo envio', async () => {
    await i18n.changeLanguage('pt-BR')
    const html = renderToStaticMarkup(
      <DriverCanhotoPickupList
        isReadOnly={false}
        onSend={noopSend}
        pickups={[{ ...PICKUP, photoSentAt: '2026-11-11T11:00:00.000Z' }]}
      />,
    )
    expect(textOf(html)).toContain('O escritório confere o canhoto')
    expect(html).not.toContain('Enviar canhoto')
    expect(html).not.toContain('type="file"')
  })

  test('o ajudante acompanha: vê a coleta, sem câmera nem envio', async () => {
    await i18n.changeLanguage('pt-BR')
    const html = renderToStaticMarkup(
      <DriverCanhotoPickupList isReadOnly onSend={noopSend} pickups={[PICKUP]} />,
    )
    expect(textOf(html)).toContain('Coletar canhoto')
    expect(html).not.toContain('Enviar canhoto')
    expect(html).not.toContain('type="file"')
  })
})

describe('o envio da foto da coleta (spec 321 T6, CA04)', () => {
  test('vai para a rota da coleta como photo, com o relógio, e devolve o fechamento', async () => {
    const seen: { form: FormData; method: string; url: string }[] = []
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: async (request) => {
        const req = request as Request
        seen.push({ form: await req.formData(), method: req.method, url: req.url })
        return new Response(
          JSON.stringify({ data: { id: 'p1', stopClosed: true, tripCompleted: false } }),
          { headers: { 'content-type': 'application/json' }, status: 201 },
        )
      },
      getAccessToken: () => Promise.resolve('token'),
    })
    const result = await client.sendCanhotoPickupPhoto({
      capturedAt: '2026-11-11T11:00:00.000Z',
      clockOffsetMs: 120,
      file: new File([new Uint8Array(8)], 'c.jpg', { type: 'image/jpeg' }),
      pickupId: PICKUP.id,
    })
    expect(result).toEqual({ stopClosed: true, tripCompleted: false })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.method).toBe('POST')
    expect(seen[0]?.url).toBe(
      `https://api.test/me/trips/current/canhoto-pickups/${PICKUP.id}/proof`,
    )
    expect(seen[0]?.form.get('kind')).toBe('photo')
    expect(seen[0]?.form.get('capturedAt')).toBe('2026-11-11T11:00:00.000Z')
    expect(seen[0]?.form.get('clockOffsetMs')).toBe('120')
    expect(seen[0]?.form.get('file')).toBeInstanceOf(File)
  })

  test('a recusa do servidor volta como erro, para a tela mandar de novo', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'CANHOTO_PICKUP_NOT_FOUND', message: 'x' } }),
            {
              headers: { 'content-type': 'application/json' },
              status: 404,
            },
          ),
        ),
      getAccessToken: () => Promise.resolve('token'),
    })
    const failure = await client
      .sendCanhotoPickupPhoto({
        file: new File([new Uint8Array(8)], 'c.jpg', { type: 'image/jpeg' }),
        pickupId: PICKUP.id,
      })
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    expect(failure).toMatchObject({ code: 'CANHOTO_PICKUP_NOT_FOUND', isOffline: false })
  })
})

describe('a parada só de coleta não está resolvida sem a foto (spec 321 T6)', () => {
  const stop = (photoSentAt: string | null) =>
    ({
      arrivedAt: null,
      canhotoPickups: [{ ...PICKUP, photoSentAt }],
      completedAt: null,
      deliveryProof: null,
      deliveryWindowEnd: null,
      deliveryWindowStart: null,
      documents: [],
      id: 'stop-2',
      label: 'Cliente',
      latitude: null,
      longitude: null,
      schedule: null,
      sequence: 2,
    }) as const

  test('sem foto pesa na barra; com a foto enviada resolve', () => {
    expect(isStopResolved(stop(null))).toBe(false)
    expect(isStopResolved(stop('2026-11-11T11:00:00.000Z'))).toBe(true)
  })
})

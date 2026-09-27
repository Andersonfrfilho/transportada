/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'
import { sumReportPhotoBytes } from '../../src/modules/driver-trip/shared/offlineQueue.service'
import {
  buildStopOccurrenceReports,
  fitStopOccurrenceReports,
} from '../../src/modules/driver-trip/shared/stopOccurrencePhoto.service'

/**
 * Spec 209, no legado `/minha-viagem` (ainda em produção enquanto `VITE_DRIVER_APP_URL` do painel
 * estiver desligada): a foto do "Deu problema" era mandada como **canhoto** da primeira nota aberta
 * da parada. Agora ela é anexo da ocorrência de parada, pela mesma rota da app do motorista.
 */
const STOP_ID = '00000000-0000-4000-8000-0000000000b1'
const UPLOAD_ID = '00000000-0000-4000-8000-0000000000a1'
const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PHOTO = { blob: new Blob([PHOTO_BYTES], { type: 'image/jpeg' }), fileName: 'doca.jpg' }

function buildReports(): readonly DriverFieldReport[] {
  let counter = 0
  return buildStopOccurrenceReports({
    createKey: () => {
      counter += 1
      return `chave-${counter}`
    },
    description: '',
    kind: 'long_wait',
    photo: PHOTO,
    stopId: STOP_ID,
  })
}

function buildClient() {
  const seen: Request[] = []
  const client = createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => {
      const request = input as Request
      seen.push(request.clone())
      const url = new URL(request.url)
      if (url.origin === 'https://storage.test') {
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      if (url.pathname.endsWith('/occurrence-uploads')) {
        return Promise.resolve(
          Response.json(
            { data: { id: UPLOAD_ID, uploadUrl: 'https://storage.test/bucket/objeto' } },
            { status: 201 },
          ),
        )
      }
      if (url.pathname.endsWith('/confirm')) {
        return Promise.resolve(Response.json({ data: { id: UPLOAD_ID } }))
      }
      return Promise.resolve(Response.json({ data: { id: 'occurrence-1' } }, { status: 201 }))
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
  return { client, seen }
}

describe('legado: a foto do "Deu problema" é da ocorrência (spec 209)', () => {
  it('sobe pela rota da parada e completa a ocorrência pela chave dela', async () => {
    const { client, seen } = buildClient()
    const [occurrence, photo] = buildReports()

    await client.send(occurrence as DriverFieldReport)
    await client.send(photo as DriverFieldReport)

    expect(seen.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      `POST /me/trips/current/stops/${STOP_ID}/occurrences`,
      `POST /me/trips/current/stops/${STOP_ID}/occurrence-uploads`,
      'PUT /bucket/objeto',
      `POST /me/trips/current/stops/${STOP_ID}/occurrence-uploads/${UPLOAD_ID}/confirm`,
      `POST /me/trips/current/stops/${STOP_ID}/occurrences`,
    ])
    expect(seen[2]?.headers.get('authorization')).toBeNull()
    expect(seen[4]?.headers.get('idempotency-key')).toBe('chave-1')
    expect(await seen[4]?.json()).toEqual({
      attachmentObjectId: UPLOAD_ID,
      description: '',
      documentId: null,
      kind: 'long_wait',
    })
  })

  it('fila cheia derruba a foto, nunca o relato', () => {
    const reports = buildReports()

    expect(sumReportPhotoBytes(reports)).toBe(PHOTO_BYTES.length)
    const fitted = fitStopOccurrenceReports({ maxBytes: 10, reports, usedBytes: 9 })
    expect(fitted.isPhotoDropped).toBe(true)
    expect(fitted.reports.map((report) => report.kind)).toEqual(['occurrence'])
  })

  it('a tela não manda mais a foto para o comprovante da nota', () => {
    const card = readFileSync(
      new URL(
        '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    const page = readFileSync(
      new URL('../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx', import.meta.url),
      'utf8',
    )

    expect(card).not.toInclude('onOccurrencePhoto')
    expect(page).not.toInclude('onOccurrencePhoto')
    expect(page).not.toInclude('ocorrencia-')
    expect(page).toInclude('prepareStopOccurrencePhoto')
  })
})

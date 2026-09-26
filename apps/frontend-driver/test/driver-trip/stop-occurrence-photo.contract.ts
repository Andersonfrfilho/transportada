/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

import { createDriverTripClient } from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type { DriverFieldReport } from '../../src/modules/driver-trip/shared/driverTrip.types'
import { buildEventQueueView } from '../../src/modules/driver-trip/shared/eventQueueView.service'
import { sumReportPhotoBytes } from '../../src/modules/driver-trip/shared/offlineQueue.service'
import {
  buildStopOccurrenceReports,
  fitStopOccurrenceReports,
} from '../../src/modules/driver-trip/shared/stopOccurrencePhoto.service'

/**
 * Spec 209: a foto do "Deu problema" é anexo da ocorrência de parada — nunca mais canhoto de
 * entrega de uma nota escolhida por posição. Ela sobe pelo mesmo upload da 179 (URL assinada,
 * `PUT` sem token, `confirm`), num item próprio da fila **atrás** da ocorrência: a ocorrência nunca
 * espera a foto (D2).
 */
const API = 'https://api.test'
const STOP_ID = '00000000-0000-4000-8000-0000000000b1'
const UPLOAD_ID = '00000000-0000-4000-8000-0000000000a1'
const UPLOAD_URL = 'https://storage.test/bucket/objeto?X-Amz-Signature=assinatura'
const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const PHOTO = { blob: new Blob([PHOTO_BYTES], { type: 'image/jpeg' }), fileName: 'doca.jpg' }

let keyCounter = 0
function nextKey(): string {
  keyCounter += 1
  return `chave-${keyCounter}`
}

function buildReports(photo: typeof PHOTO | undefined) {
  keyCounter = 0
  return buildStopOccurrenceReports({
    createKey: nextKey,
    description: 'Doca fechada até as 14h',
    kind: 'dock_closed',
    photo,
    stopId: STOP_ID,
  })
}

function buildClient() {
  const seen: Request[] = []
  const client = createDriverTripClient({
    apiUrl: API,
    fetch: (input) => {
      const request = input as Request
      seen.push(request.clone())
      const url = new URL(request.url)
      if (url.origin === 'https://storage.test') {
        return Promise.resolve(new Response(null, { status: 200 }))
      }
      if (url.pathname.endsWith('/occurrence-uploads')) {
        return Promise.resolve(
          Response.json({ data: { id: UPLOAD_ID, uploadUrl: UPLOAD_URL } }, { status: 201 }),
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

describe('os itens do "Deu problema" na fila (spec 209 D2)', () => {
  it('sem foto, só a ocorrência — como sempre foi', () => {
    const reports = buildReports(undefined)

    expect(reports).toEqual([
      {
        description: 'Doca fechada até as 14h',
        documentId: null,
        idempotencyKey: 'chave-1',
        kind: 'occurrence',
        occurrenceKind: 'dock_closed',
        stopId: STOP_ID,
      },
    ])
  })

  it('com foto, a ocorrência primeiro e a foto atrás, amarrada pela chave da ocorrência', () => {
    const [occurrence, photo] = buildReports(PHOTO)

    expect(occurrence?.kind).toBe('occurrence')
    expect(photo).toEqual({
      description: 'Doca fechada até as 14h',
      documentId: null,
      idempotencyKey: 'chave-2',
      kind: 'stopOccurrencePhoto',
      occurrenceKey: 'chave-1',
      occurrenceKind: 'dock_closed',
      photo: PHOTO,
      stopId: STOP_ID,
    })
  })

  it('a foto conta no teto de bytes dos anexos', () => {
    expect(sumReportPhotoBytes(buildReports(PHOTO))).toBe(PHOTO_BYTES.length)
    expect(sumReportPhotoBytes(buildReports(undefined))).toBe(0)
  })
})

describe('fila cheia derruba a foto, nunca o relato (spec 209 D3)', () => {
  it('cabe: entram os dois', () => {
    const reports = buildReports(PHOTO)

    expect(fitStopOccurrenceReports({ maxBytes: 100, reports, usedBytes: 0 })).toEqual({
      isPhotoDropped: false,
      reports,
    })
  })

  it('não cabe: entra só a ocorrência, e a tela é avisada', () => {
    const reports = buildReports(PHOTO)

    const fitted = fitStopOccurrenceReports({ maxBytes: 100, reports, usedBytes: 99 })

    expect(fitted.isPhotoDropped).toBe(true)
    expect(fitted.reports.map((report) => report.kind)).toEqual(['occurrence'])
  })

  it('sem foto nunca há o que derrubar', () => {
    const reports = buildReports(undefined)

    expect(fitStopOccurrenceReports({ maxBytes: 0, reports, usedBytes: 10 })).toEqual({
      isPhotoDropped: false,
      reports,
    })
  })
})

describe('a foto sobe pela rota da parada e completa a ocorrência (spec 209 RF1-RF3)', () => {
  it('a ocorrência sai sem anexo, com a chave dela', async () => {
    const { client, seen } = buildClient()
    const [occurrence] = buildReports(PHOTO)

    await client.send(occurrence as DriverFieldReport)

    expect(seen.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      `POST /me/trips/current/stops/${STOP_ID}/occurrences`,
    ])
    expect(await seen[0]?.json()).toEqual({
      description: 'Doca fechada até as 14h',
      documentId: null,
      kind: 'dock_closed',
    })
  })

  it('a foto pede a URL da parada, sobe sem token, confirma e reenvia a ocorrência com o anexo', async () => {
    const { client, seen } = buildClient()
    const [, photo] = buildReports(PHOTO)

    await client.send(photo as DriverFieldReport)

    expect(seen.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
      `POST /me/trips/current/stops/${STOP_ID}/occurrence-uploads`,
      'PUT /bucket/objeto',
      `POST /me/trips/current/stops/${STOP_ID}/occurrence-uploads/${UPLOAD_ID}/confirm`,
      `POST /me/trips/current/stops/${STOP_ID}/occurrences`,
    ])
    expect(seen[1]?.headers.get('authorization')).toBeNull()
    expect(seen[3]?.headers.get('idempotency-key')).toBe('chave-1')
    expect(await seen[3]?.json()).toEqual({
      attachmentObjectId: UPLOAD_ID,
      description: 'Doca fechada até as 14h',
      documentId: null,
      kind: 'dock_closed',
    })
  })

  it('nada do "Deu problema" passa pela rota de comprovante da nota', async () => {
    const { client, seen } = buildClient()

    for (const report of buildReports(PHOTO)) await client.send(report)

    expect(seen.some((request) => request.url.includes('/proof'))).toBe(false)
    expect(seen.some((request) => request.url.includes('/documents/'))).toBe(false)
  })
})

describe('a foto pendente fica à vista na fila (spec 209 RF5)', () => {
  it('o item da foto aparece com o anexo contado', () => {
    const [occurrence, photo] = buildReports(PHOTO)
    const view = buildEventQueueView({
      attachments: [],
      queued: [
        { attempts: 0, createdAt: '2026-09-25T12:00:00.000Z', report: occurrence! },
        {
          attempts: 0,
          createdAt: '2026-09-25T12:00:00.000Z',
          rejectionCause: '413 PAYLOAD',
          report: photo!,
        },
      ],
    })

    expect(view.map((item) => [item.kind, item.attachmentCount, item.status.state])).toEqual([
      ['occurrence', 0, 'queued'],
      ['stopOccurrencePhoto', 1, 'rejected'],
    ])
  })
})

describe('a tela do "Deu problema" (spec 209 RF4)', () => {
  const card = readFileSync(
    new URL(
      '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  const form = readFileSync(
    new URL(
      '../../src/modules/driver-trip/components/DriverStopOccurrenceForm.component.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  const formHook = readFileSync(
    new URL('../../src/modules/driver-trip/hooks/useStopOccurrenceForm.hook.ts', import.meta.url),
    'utf8',
  )
  const page = readFileSync(
    new URL('../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx', import.meta.url),
    'utf8',
  )

  it('o cartão não manda mais foto de ocorrência para o comprovante da nota', () => {
    expect(card).not.toInclude('onOccurrencePhoto')
    expect(page).not.toInclude('onOccurrencePhoto')
    expect(page).not.toInclude('ocorrencia-')
  })

  it('a foto é reduzida no aparelho, até 512 KiB, como a da 179', () => {
    expect(formHook).toInclude('reduceOccurrencePhotoToJpeg')
    expect(formHook).toInclude('isOccurrencePhotoWithinLimit')
  })

  it('uma foto por ocorrência, com câmera, galeria e "Refazer" (D1)', () => {
    expect(form).toInclude('FilePickerButton')
    expect(form).toInclude('capture="environment"')
    expect(form).toInclude('proofCapture.retake')
    expect(form).not.toInclude('<FileField')
  })

  it('a página grava pelo hook que derruba a foto quando a fila está cheia', () => {
    expect(page).toInclude('reportStopOccurrence')
    expect(page).toInclude('occurrencePhotoDropped')
  })
})

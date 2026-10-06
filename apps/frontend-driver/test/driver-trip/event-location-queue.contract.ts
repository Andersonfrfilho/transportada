/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  reportBody,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import type {
  DriverFieldReport,
  DriverReportedLocation,
} from '../../src/modules/driver-trip/shared/driverTrip.types'
import { buildNotDeliveredReports } from '../../src/modules/driver-trip/shared/notDelivered.service'
import {
  applyReportLocation,
  completeReportLocations,
  listLocatedReportKeys,
  withLegacyLocation,
  type QueuedReport,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'
import { buildStopOccurrenceReports } from '../../src/modules/driver-trip/shared/stopOccurrencePhoto.service'
import { sliceFunction } from './function-slice.support'

const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)
const PAGE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)
const NOW = '2026-10-03T12:00:00.000Z'
const LOCATION: DriverReportedLocation = {
  accuracyMeters: 18,
  capturedAt: NOW,
  latitude: -23.55,
  longitude: -46.63,
}

function queued(report: DriverFieldReport): QueuedReport {
  return { attempts: 0, createdAt: NOW, report }
}

function buildClient() {
  const seen: Request[] = []
  const client = createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => {
      seen.push((input as Request).clone())
      return Promise.resolve(Response.json({ data: {} }, { status: 201 }))
    },
    getAccessToken: () => Promise.resolve('token-de-mentira'),
  })
  return { client, seen }
}

/**
 * Spec 196 (Fase 5, RF6/RF7): todo toque de campo leva o ponto — inclusive a ocorrência da parada, a
 * ocorrência da nota e o despacho. O item nasce com `location: null` e a posição o completa pela chave.
 */
describe('o corpo de cada toque leva o ponto (196 T5.1)', () => {
  it('occurrence, dispatch e documentOccurrence mandam `location`', async () => {
    const occurrence = reportBody({
      report: {
        description: 'doca fechada',
        documentId: null,
        idempotencyKey: 'chave-1',
        kind: 'occurrence',
        location: LOCATION,
        occurrenceTypeId: 'type-1',
        stopId: 'stop-1',
      },
      stamp: undefined,
    })
    const dispatch = reportBody({
      report: {
        idempotencyKey: 'chave-2',
        kind: 'dispatch',
        location: LOCATION,
        tripId: 'trip-1',
      },
      stamp: undefined,
    })
    const { client, seen } = buildClient()
    await client.send({
      report: {
        documentId: 'document-1',
        idempotencyKey: 'chave-3',
        kind: 'documentOccurrence',
        location: LOCATION,
        note: 'sem número',
        occurrenceTypeId: 'type-1',
        occurrenceTypeName: 'Endereço',
        photo: null,
        productCode: '',
      },
      stamp: undefined,
    })

    expect(JSON.parse(occurrence)).toMatchObject({ location: LOCATION })
    expect(JSON.parse(dispatch)).toEqual({ location: LOCATION, tripId: 'trip-1' })
    expect(await seen[0]?.json()).toMatchObject({ location: LOCATION })
  })

  it('sem ponto, o corpo manda `location: null` — chave presente', () => {
    const dispatch = reportBody({
      report: {
        idempotencyKey: 'chave-2',
        kind: 'dispatch',
        location: null,
        tripId: 'trip-1',
      },
      stamp: undefined,
    })

    expect(JSON.parse(dispatch)).toEqual({ location: null, tripId: 'trip-1' })
  })
})

describe('o item nasce sem ponto e a posição o completa pela chave (196 T5.1)', () => {
  const stopReports = buildStopOccurrenceReports({
    createKey: (() => {
      let counter = 0
      return () => `parada-${(counter += 1)}`
    })(),
    description: 'doca fechada',
    occurrenceTypeId: 'type-1',
    photo: { blob: new Blob(['x'], { type: 'image/jpeg' }), fileName: 'a.jpg' },
    stopId: 'stop-1',
  })

  it('a ocorrência da parada nasce `null`; a foto, que não é evento, não tem o campo', () => {
    expect(stopReports[0]).toMatchObject({ kind: 'occurrence', location: null })
    expect(stopReports[1]).not.toHaveProperty('location')
    expect(listLocatedReportKeys(stopReports)).toEqual(['parada-1'])
  })

  it('applyReportLocation completa a ocorrência — sem a exceção antiga', () => {
    const items = stopReports.map(queued)

    const next = applyReportLocation({ idempotencyKey: 'parada-1', items, location: LOCATION })

    expect(next[0]?.report).toMatchObject({ kind: 'occurrence', location: LOCATION })
    expect(next[1]).toEqual(items[1] as QueuedReport)
  })

  it('a ocorrência que já tem ponto não é sobrescrita', () => {
    const items = [
      queued({ ...(stopReports[0] as DriverFieldReport), location: LOCATION } as DriverFieldReport),
    ]
    const other = { ...LOCATION, latitude: 1 }

    const next = applyReportLocation({ idempotencyKey: 'parada-1', items, location: other })

    expect(next[0]?.report).toMatchObject({ location: LOCATION })
  })

  it('"Não entreguei" completa as duas chaves: a ocorrência e a devolução', () => {
    let counter = 0
    const reports = buildNotDeliveredReports({
      createIdempotencyKey: () => `nota-${(counter += 1)}`,
      documentId: 'document-1',
      draft: {
        note: 'recusou',
        occurrenceTypeId: 'type-1',
        photo: { blob: new Blob(['x'], { type: 'image/jpeg' }), fileName: 'a.jpg' },
        reason: 'recipient_refused',
      },
      occurrenceTypes: { status: 'loaded', types: [{ id: 'type-1', name: 'Recusa' }] },
    })

    expect(reports.map((report) => report.kind)).toEqual(['documentOccurrence', 'return'])
    expect([...listLocatedReportKeys(reports)].sort()).toEqual(['nota-1', 'nota-2'])
    expect(reports.every((report) => 'location' in report && report.location === null)).toBe(true)

    const next = completeReportLocations({
      items: reports.map(queued),
      keys: listLocatedReportKeys(reports),
      location: LOCATION,
    })

    expect(next.map((item) => 'location' in item.report && item.report.location)).toEqual([
      LOCATION,
      LOCATION,
    ])
  })
})

describe('item gravado por versão anterior, sem o campo, sai com `location: null` (196 RF7)', () => {
  const legacyOccurrence = {
    description: 'portão fechado',
    documentId: null,
    idempotencyKey: 'antigo-1',
    kind: 'occurrence',
    occurrenceKind: 'long_wait',
    stopId: 'stop-1',
  } as unknown as DriverFieldReport

  it('withLegacyLocation preenche `null` na ocorrência, na ocorrência de nota e no despacho', () => {
    const legacyDocument = {
      documentId: 'document-1',
      idempotencyKey: 'antigo-2',
      kind: 'documentOccurrence',
      note: '',
      occurrenceTypeId: 'type-1',
      occurrenceTypeName: 'Endereço',
      photo: null,
      productCode: '',
    } as unknown as DriverFieldReport
    const legacyDispatch = {
      idempotencyKey: 'antigo-3',
      kind: 'dispatch',
      tripId: 'trip-1',
    } as unknown as DriverFieldReport

    for (const legacy of [legacyOccurrence, legacyDocument, legacyDispatch]) {
      expect(withLegacyLocation(legacy)).toMatchObject({ location: null })
    }
  })

  it('o ponto já existente, e o item que nunca teve o campo (foto, recebedor), ficam como estão', () => {
    const located = { ...(legacyOccurrence as object), location: LOCATION } as DriverFieldReport
    const receiver: DriverFieldReport = {
      documentId: 'document-1',
      fields: {},
      idempotencyKey: 'antigo-4',
      kind: 'proofReceiver',
    }

    expect(withLegacyLocation(located)).toBe(located)
    expect(withLegacyLocation(receiver)).toBe(receiver)
  })

  it('o `send` do item antigo manda `location: null` no corpo', async () => {
    const { client, seen } = buildClient()

    await client.send({ report: legacyOccurrence, stamp: undefined })

    expect(await seen[0]?.json()).toMatchObject({ location: null })
  })
})

describe('a fiação do hook e da tela (196 T5.2)', () => {
  const hook = readFileSync(HOOK, 'utf8')
  const page = readFileSync(PAGE, 'utf8')
  const builder = readFileSync(
    new URL(
      '../../src/modules/driver-trip/shared/documentOccurrenceReport.service.ts',
      import.meta.url,
    ),
    'utf8',
  )

  it('"Não entreguei" e a ocorrência da parada leem a posição uma vez e completam pelas chaves', () => {
    expect(sliceFunction(hook, 'reportNotDelivered')).toInclude('completeLocations(reports)')
    expect(sliceFunction(hook, 'reportStopOccurrence')).toInclude(
      'completeLocations(fitted.reports)',
    )
    const completion = sliceFunction(hook, 'completeLocations')
    expect(completion).toInclude('listLocatedReportKeys(reports)')
    expect(completion).toInclude('completeReportLocations({ items, keys, location })')
    expect(completion.match(/readCurrentLocation\(\)/gu)).toHaveLength(1)
  })

  it('o despacho e a ocorrência de nota passam por quem completa a posição', () => {
    expect(page).toMatch(/kind: 'dispatch',\s*location,/u)
    expect(page).toInclude('buildDocumentOccurrenceReport(')
    expect(builder).toMatch(/kind: 'documentOccurrence',\s*location: null,/u)
  })

  it('a coordenada nunca vai para log, console ou telemetria', () => {
    const files = [
      '../../src/modules/driver-trip/shared/offlineQueue.service.ts',
      '../../src/modules/driver-trip/shared/driverLocation.service.ts',
      '../../src/modules/driver-trip/shared/driverTripClient.service.ts',
      '../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts',
    ]
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8')
      expect(source).not.toMatch(/console\.\w+\(/u)
    }
  })
})

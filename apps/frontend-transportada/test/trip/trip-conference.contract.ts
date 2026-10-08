/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  buildTripConference,
  extractCityFromStopLabel,
} from '@/modules/trip/shared/tripConference.service'
import { findTripCreatorName } from '@/modules/trip/shared/tripCreator.service'
import {
  buildTripConferencePdf,
  packCitiesIntoLines,
} from '@/modules/trip/shared/tripConferencePdf.service'
import { buildTripConferenceSheetLabels } from '@/modules/trip/shared/tripConferenceLabels.service'
import {
  buildTripConferenceFileName,
  buildTripConferenceSheet,
  ROUTE_SEPARATOR,
} from '@/modules/trip/shared/tripConferenceSheet.service'
import type {
  TripDocumentDetail,
  TripStopDetail,
  TripTimelineItem,
  TripTimelinePage,
} from '@/modules/trip/shared/trip.types'

function document(overrides: Partial<TripDocumentDetail>): TripDocumentDetail {
  return {
    cteAuthorized: false,
    createdAt: '2026-10-08T10:00:00Z',
    deliveredAt: null,
    destinationOrigin: null,
    fiscalStatus: 'pending',
    freightCalculationId: null,
    id: 'document-1',
    loadedAt: null,
    nfeDocumentId: null,
    releasedAt: null,
    returnReason: null,
    returnedAt: null,
    separatedAt: null,
    separationStatus: 'pending',
    stopId: null,
    tripId: 'trip-1',
    updatedAt: '2026-10-08T10:00:00Z',
    ...overrides,
  }
}

function stop(overrides: Partial<TripStopDetail>): TripStopDetail {
  return {
    addressKey: 'key',
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: 'stop-1',
    label: 'RUA A, 10, PORTO FERREIRA, SP',
    sequence: 1,
    ...overrides,
  }
}

describe('buildTripConference', () => {
  it('soma notas, valor e volumes sem passar por float', () => {
    const first = document({ id: 'a', nfeNumber: '100', nfeTotalValue: '0.10', volumeCount: 2 })
    const second = document({ id: 'b', nfeNumber: '101', nfeTotalValue: '0.20', volumeCount: 3 })
    const conference = buildTripConference({
      documents: [first, second],
      stops: [stop({ documents: [first, second] })],
    })

    expect(conference.summary.noteCount).toBe(2)
    expect(conference.summary.totalValue).toBe('0.30')
    expect(conference.summary.totalVolumes).toBe(5)
    expect(conference.summary.stopCount).toBe(1)
  })

  it('leva cliente, número, série e destino para a linha, na ordem das paradas', () => {
    const late = document({
      contact: { contractorName: null, name: 'Mercado Zeta', phone: null, taxId: '1' },
      id: 'late',
      nfeNumber: '9',
      nfeSeries: '1',
    })
    const early = document({ id: 'early', nfeNumber: '8' })
    const conference = buildTripConference({
      documents: [late, early],
      stops: [
        stop({ documents: [late], id: 's2', label: 'RUA B, 2, PIRASSUNUNGA, SP', sequence: 2 }),
        stop({ documents: [early], id: 's1', sequence: 1 }),
      ],
    })

    expect(conference.rows.map((row) => row.documentId)).toEqual(['early', 'late'])
    expect(conference.rows[1]).toMatchObject({
      clientName: 'Mercado Zeta',
      destinationLabel: 'RUA B, 2, PIRASSUNUNGA, SP',
      noteNumber: '9',
      noteSeries: '1',
    })
  })

  it('nota sem valor não vira R$ 0,00: é contada à parte', () => {
    const withValue = document({ id: 'a', nfeTotalValue: '50.00' })
    const withoutValue = document({ id: 'b' })
    const conference = buildTripConference({
      documents: [withValue, withoutValue],
      stops: [],
    })

    expect(conference.summary.totalValue).toBe('50.00')
    expect(conference.summary.notesWithoutValue).toBe(1)
    expect(conference.rows[1]?.totalValue).toBeNull()
  })

  it('nota sem parada entra no fim, sem destino', () => {
    const assigned = document({ id: 'a' })
    const loose = document({ id: 'b' })
    const conference = buildTripConference({
      documents: [assigned, loose],
      stops: [stop({ documents: [assigned] })],
    })

    expect(conference.rows.map((row) => row.documentId)).toEqual(['a', 'b'])
    expect(conference.rows[1]?.destinationLabel).toBe('')
    expect(conference.summary.stopCount).toBe(1)
  })
})

describe('extractCityFromStopLabel', () => {
  it('lê a cidade do fim do endereço, antes da UF', () => {
    expect(extractCityFromStopLabel('RUA JOSE BONIFACIO, 1519, PIRASSUNUNGA, SP')).toBe(
      'PIRASSUNUNGA',
    )
  })

  it('sem UF no fim, devolve vazio em vez de inventar uma cidade', () => {
    expect(extractCityFromStopLabel('Centro, 100')).toBe('')
    expect(extractCityFromStopLabel('')).toBe('')
  })
})

describe('data da fatura', () => {
  it('leva a emissão da nota para a linha', () => {
    const issued = document({ id: 'a', nfeIssuedAt: '2026-10-02T13:00:00Z' })
    const conference = buildTripConference({ documents: [issued], stops: [] })

    expect(conference.rows[0]?.issuedAt).toBe('2026-10-02T13:00:00Z')
  })
})

describe('findTripCreatorName', () => {
  const page = (items: readonly Partial<TripTimelineItem>[]): TripTimelinePage => ({
    items: items as readonly TripTimelineItem[],
    nextCursor: null,
  })

  it('lê o autor do evento de criação, mesmo em página mais antiga', () => {
    const pages = [
      page([{ actorName: 'Outra', kind: 'trip.status_changed' }]),
      page([{ actorName: 'Maria Souza', kind: 'trip.created' }]),
    ]

    expect(findTripCreatorName(pages)).toBe('Maria Souza')
  })

  it('criação ainda não carregada é undefined; sem ator humano é null', () => {
    expect(findTripCreatorName([page([{ actorName: 'X', kind: 'trip.status_changed' }])])).toBe(
      undefined,
    )
    expect(findTripCreatorName([page([{ actorName: null, kind: 'trip.created' }])])).toBeNull()
  })
})

describe('buildTripConferenceSheet', () => {
  const labels = buildTripConferenceSheetLabels((key) => key)
  const base = {
    labels,
    printedOn: new Date('2026-10-08T18:00:00Z'),
    tripCode: 'f7ab43be',
  }

  it('só leva campos com valor e a criação em maiúsculas', () => {
    const doc = document({ id: 'a', nfeNumber: '1', nfeTotalValue: '10.00', volumeCount: 2 })
    const conference = buildTripConference({ documents: [doc], stops: [] })
    const sheet = buildTripConferenceSheet({
      ...base,
      conference,
      creatorName: 'Maria Souza',
      drivers: [],
      vehiclePlate: null,
    })
    const labelsShown = sheet.fields.map((field) => field.label)

    expect(labelsShown).toContain('conference.sheetCreatedBy')
    expect(labelsShown).not.toContain('conference.sheetVehicle')
    expect(sheet.fields.find((field) => field.label === 'conference.sheetCreatedBy')?.value).toBe(
      'MARIA SOUZA',
    )
    expect(sheet.rows).toHaveLength(1)
    expect(sheet.totalsRow[2]).toContain('10,00')
  })

  it('autor ainda desconhecido não vira campo vazio', () => {
    const conference = buildTripConference({ documents: [], stops: [] })
    const sheet = buildTripConferenceSheet({
      ...base,
      conference,
      creatorName: undefined,
      drivers: [],
      vehiclePlate: 'RTE6K89',
    })

    expect(sheet.fields.map((field) => field.label)).not.toContain('conference.sheetCreatedBy')
  })
})

describe('buildTripConferencePdf', () => {
  it('gera um PDF de verdade, com a página em paisagem', async () => {
    const doc = document({
      contact: { contractorName: null, name: 'Mercado Zeta', phone: null, taxId: '1' },
      id: 'a',
      nfeNumber: '879925',
      nfeTotalValue: '3311.87',
      volumeCount: 18,
    })
    const conference = buildTripConference({ documents: [doc], stops: [] })
    const labels = buildTripConferenceSheetLabels((key) => key)
    const sheet = buildTripConferenceSheet({
      conference,
      creatorName: 'Maria Souza',
      drivers: [],
      labels,
      printedOn: new Date('2026-10-08T18:00:00Z'),
      tripCode: 'f7ab43be',
      vehiclePlate: 'RTE6K89',
    })
    const blob = await buildTripConferencePdf({
      brandName: 'AFR Fernandes',
      labels,
      logoDataUrl: null,
      sheet,
    })
    const text = new TextDecoder('latin1').decode(await blob.arrayBuffer())

    expect(blob.type).toBe('application/pdf')
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(text).toMatch(/\/MediaBox \[0 0 841\.8\d+ 595\.2\d+\]/u)
  })
})

describe('cidades da rota na folha', () => {
  it('vai em linha própria e com separador que a fonte do PDF desenha', () => {
    const only = document({ id: 'a' })
    const conference = buildTripConference({
      documents: [only],
      stops: [stop({ documents: [only], label: 'RUA A, 1, AGUAI, SP', sequence: 1 })],
    })
    const sheet = buildTripConferenceSheet({
      conference,
      creatorName: null,
      drivers: [],
      labels: buildTripConferenceSheetLabels((key) => key),
      printedOn: new Date('2026-10-08T18:00:00Z'),
      tripCode: 'x',
      vehiclePlate: null,
    })

    expect(sheet.routeCities).toBe('AGUAI')
    expect(sheet.fields.map((field) => field.label)).not.toContain('conference.routeCities')
    expect(ROUTE_SEPARATOR).not.toContain('→')
  })
})

describe('cidades da rota', () => {
  it('lista as cidades na ordem das paradas, sem repetir', () => {
    const first = document({ id: 'a' })
    const second = document({ id: 'b' })
    const third = document({ id: 'c' })
    const conference = buildTripConference({
      documents: [first, second, third],
      stops: [
        stop({ documents: [third], id: 's3', label: 'RUA C, 3, AGUAI, SP', sequence: 3 }),
        stop({ documents: [first], id: 's1', label: 'RUA A, 1, AGUAI, SP', sequence: 1 }),
        stop({ documents: [second], id: 's2', label: 'RUA B, 2, ALTINOPOLIS, SP', sequence: 2 }),
      ],
    })

    expect(conference.summary.cities).toEqual(['AGUAI', 'ALTINOPOLIS'])
  })

  it('parada sem nota e endereço sem UF não entram na rota', () => {
    const only = document({ id: 'a' })
    const conference = buildTripConference({
      documents: [only],
      stops: [
        stop({ documents: [only], id: 's1', label: 'Centro, 100', sequence: 1 }),
        stop({ documents: [], id: 's2', label: 'RUA X, 9, PIRASSUNUNGA, SP', sequence: 2 }),
      ],
    })

    expect(conference.summary.cities).toEqual([])
  })
})

describe('buildTripConferenceFileName', () => {
  it('leva data e hora de São Paulo no nome do arquivo', () => {
    const name = buildTripConferenceFileName({
      at: new Date('2026-10-08T18:05:00Z'),
      tripCode: 'f7ab43be',
    })

    expect(name).toBe('conferencia-f7ab43be-20261008-1505.pdf')
  })

  it('virada do dia respeita o fuso, não o UTC', () => {
    const name = buildTripConferenceFileName({
      at: new Date('2026-10-09T01:30:00Z'),
      tripCode: 'abc',
    })

    expect(name).toBe('conferencia-abc-20261008-2230.pdf')
  })
})

describe('packCitiesIntoLines', () => {
  const measure = (text: string): number => text.length

  it('quebra entre cidades, nunca no meio de um nome', () => {
    const lines = packCitiesIntoLines({
      cities: ['AGUAI', 'SANTA RITA DO PASSA QUATRO', 'MATAO'],
      maxWidth: 30,
      measure,
    })

    expect(lines).toEqual(['AGUAI ›', 'SANTA RITA DO PASSA QUATRO ›', 'MATAO'])
  })

  it('cabendo tudo numa linha, não quebra', () => {
    const lines = packCitiesIntoLines({ cities: ['A', 'B', 'C'], maxWidth: 100, measure })

    expect(lines).toEqual(['A › B › C'])
  })

  it('cidade maior que a linha fica sozinha em vez de sumir', () => {
    const lines = packCitiesIntoLines({ cities: ['CIDADE ENORME'], maxWidth: 3, measure })

    expect(lines).toEqual(['CIDADE ENORME'])
  })
})

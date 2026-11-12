/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import enLocale from '@/modules/driver-trip/locales/driverTrip.en.locale.json'
import ptLocale from '@/modules/driver-trip/locales/driverTrip.locale.json'
import { resolveRejectionCauseLabelKey } from '@/modules/driver-trip/shared/rejectionCauseLabel.service'
import {
  formatDocumentNumbers,
  listUnloadedDocumentNumbers,
  resolveRejectedDocumentNumbers,
} from '@/modules/driver-trip/shared/unloadedDocuments.service'

import { buildDriverTripDocument, buildDriverTripStop } from '../fixtures/driverTrip.fixture'

const WORKSPACE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)

const stops = [
  buildDriverTripStop({
    documents: [
      buildDriverTripDocument({ id: 'D1', number: '899875', separationStatus: 'pending' }),
      buildDriverTripDocument({ id: 'D2', number: '899876', separationStatus: 'loaded' }),
    ],
    id: 'S1',
  }),
  buildDriverTripStop({
    documents: [
      buildDriverTripDocument({ id: 'D3', number: '899877', separationStatus: 'separated' }),
      buildDriverTripDocument({ id: 'D4', number: '899878', separationStatus: 'delivered' }),
      buildDriverTripDocument({ id: 'D5', number: '899879', separationStatus: 'returned' }),
    ],
    id: 'S2',
    sequence: 2,
  }),
]

/**
 * "Iniciar viagem" com nota não carregada: a API recusa com `409 TRIP_HAS_UNLOADED_DOCUMENTS` e só o
 * escritório destrava (despacho forçado e assinado). O motorista via o código cru e um "toque de novo".
 */
describe('despacho com nota não carregada: o app diz quais notas e quem destrava', () => {
  it('antes do toque: lista as notas que não estão carregadas (entregue e devolvida não contam)', () => {
    expect(listUnloadedDocumentNumbers(stops)).toEqual(['899875', '899877'])
    expect(listUnloadedDocumentNumbers([buildDriverTripStop()])).toEqual([])
  })

  it('depois da recusa: os ids que o servidor devolve viram os números das notas', () => {
    expect(
      resolveRejectedDocumentNumbers({
        details: [
          { field: 'documentId', message: 'D3' },
          { field: 'documentId', message: 'id-fora-do-snapshot' },
        ],
        stops,
      }),
    ).toEqual(['899877'])
    expect(resolveRejectedDocumentNumbers({ details: undefined, stops })).toEqual([])
  })

  it('as notas saem como "NF 1, NF 2"', () => {
    expect(formatDocumentNumbers(['899875'])).toBe('NF 899875')
    expect(formatDocumentNumbers(['899875', '899877'])).toBe('NF 899875, NF 899877')
  })

  it('a fila troca o código cru por texto humano, nos dois idiomas', () => {
    expect(resolveRejectionCauseLabelKey('409 TRIP_HAS_UNLOADED_DOCUMENTS')).toBe(
      'eventQueue.cause.unloadedDocuments',
    )
    expect(resolveRejectionCauseLabelKey('409 TRIP_HAS_UNSCHEDULED_STOPS')).toBe(
      'eventQueue.cause.unscheduledStops',
    )
    for (const locale of [ptLocale, enLocale]) {
      const cause = locale.eventQueue.cause
      expect(cause.unloadedDocuments).not.toContain('TRIP_')
      expect(cause.unloadedDocumentsNamed_one).toContain('{{notes}}')
      expect(cause.unloadedDocumentsNamed_other).toContain('{{notes}}')
      expect(cause.unscheduledStops).not.toBe('')
      expect(locale.dispatch.unloaded_one).toContain('{{notes}}')
      expect(locale.dispatch.unloaded_other).toContain('{{notes}}')
      expect(locale.dispatch.failedUnloaded).not.toBe('')
    }
    expect(ptLocale.dispatch.unloaded_other).toBe(
      'As notas {{notes}} ainda não foram marcadas como carregadas. A viagem só começa depois que o escritório conferir o carregamento ou liberar a saída.',
    )
  })

  it('a tela da viagem mostra o aviso junto do botão e não manda "tocar de novo" nessa recusa', () => {
    const workspace = readFileSync(WORKSPACE, 'utf8')
    expect(workspace).toContain("t('dispatch.unloaded'")
    expect(workspace).toContain("'dispatch.failedUnloaded'")
  })
})

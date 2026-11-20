/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import driverTripEn from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'
import driverTrip from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import { toFieldReportNotice } from '../../src/modules/driver-trip/shared/fieldReportNotice.service'
import { parseFieldReportResponse } from '../../src/modules/driver-trip/shared/fieldReportResponse.service'

/** A API devolve a ocorrência que já estava aberta (spec 276 T4); o motorista precisa ser avisado, não enganado. */
describe('a ocorrência que já estava aberta avisa o motorista', () => {
  it('lê a marca da API e a transforma em aviso da ocorrência', () => {
    const response = parseFieldReportResponse({ data: { alreadyOpen: true, id: 'occ-1' } })
    expect(response?.alreadyOpen).toBe(true)
    expect(toFieldReportNotice({ key: 'k1', kind: 'documentOccurrence', response })).toMatchObject({
      alreadyOpen: true,
      key: 'k1',
      kind: 'documentOccurrence',
    })
  })

  it('sem a marca (API antiga ou ocorrência nova) não há aviso', () => {
    const response = parseFieldReportResponse({ data: { id: 'occ-1' } })
    expect(response?.alreadyOpen).toBeUndefined()
    expect(toFieldReportNotice({ key: 'k2', kind: 'documentOccurrence', response })).toBeUndefined()
  })

  it('o texto existe nos dois idiomas', () => {
    expect(driverTrip.occurrenceAlreadyOpen.notice.length).toBeGreaterThan(0)
    expect(driverTripEn.occurrenceAlreadyOpen.notice.length).toBeGreaterThan(0)
  })
})

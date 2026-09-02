/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  resolveManifestCities,
  type ManifestCityRow,
} from '../../src/mdfe-manifests/domain/manifest-cities.policy.js'

const DOCUMENT_ID = 'doc-1'

function row(overrides: Partial<ManifestCityRow>): ManifestCityRow {
  return {
    city: 'Santa Barbara d Oeste',
    cityCode: '3549102',
    documentId: DOCUMENT_ID,
    number: '400',
    postalCode: '13872400',
    role: 'recipient',
    state: 'SP',
    ...overrides,
  }
}

const ORIGEM = row({
  city: 'Sao Paulo',
  cityCode: '3550308',
  postalCode: '01001000',
  role: 'emitter',
})

const ENTREGA = row({
  city: 'Campinas',
  cityCode: '3509502',
  number: '4500',
  postalCode: '13052000',
  role: 'delivery',
})

describe('manifest discharge city (spec 073 RF6/CA5)', () => {
  /**
   * O `cMunDescarga` do MDF-e é o município **da descarga** — e quando a nota traz `<entrega>`,
   * a descarga é lá. Este é o único consumidor da spec cujo erro atravessa a fronteira da SEFAZ:
   * o município errado sai no XML transmitido, não numa tela que alguém confere.
   */
  it('discharges at the delivery city when the note carries one', () => {
    const cities = resolveManifestCities([ORIGEM, row({}), ENTREGA])

    expect(cities.get(DOCUMENT_ID)?.discharge.cityCode).toBe('3509502')
    expect(cities.get(DOCUMENT_ID)?.discharge.cityName).toBe('Campinas')
  })

  /** Sem `<entrega>` — 345 de 345 notas reais medidas — o manifesto não muda em nada. */
  it('discharges at the recipient city when there is no delivery address', () => {
    const cities = resolveManifestCities([ORIGEM, row({})])

    expect(cities.get(DOCUMENT_ID)?.discharge.cityCode).toBe('3549102')
  })

  /** A origem é sempre o emitente: `<entrega>` não tem nada a dizer sobre de onde a carga sai. */
  it('never lets the delivery address touch the origin city', () => {
    const cities = resolveManifestCities([ORIGEM, row({}), ENTREGA])

    expect(cities.get(DOCUMENT_ID)?.origin.cityCode).toBe('3550308')
  })

  /** RF2: entrega com CEP que não monta chave cai para o destinatário, como em todo o resto. */
  it('discharges at the recipient when the delivery address is incomplete', () => {
    const cities = resolveManifestCities([ORIGEM, row({}), row({ ...ENTREGA, postalCode: '130' })])

    expect(cities.get(DOCUMENT_ID)?.discharge.cityCode).toBe('3549102')
  })

  /** Papel que não é origem nem destino não entra no manifesto — transportadora, retirada. */
  it('ignores parties that are neither origin nor destination', () => {
    const cities = resolveManifestCities([ORIGEM, row({}), row({ ...ENTREGA, role: 'carrier' })])

    expect(cities.get(DOCUMENT_ID)?.discharge.cityCode).toBe('3549102')
  })
})

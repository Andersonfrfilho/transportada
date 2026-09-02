/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  resolvePhysicalDestination,
  type PhysicalDestinationCandidate,
} from '../../src/nfe-documents/domain/physical-destination.policy.js'
import { pickPhysicalDestinationByDocument } from '../../src/nfe-documents/infrastructure/physical-destination.join.js'

/** Onde o cliente está cadastrado. */
const RECIPIENT: PhysicalDestinationCandidate = {
  components: { cityCode: '3549102', number: '400', postalCode: '13872400' },
  origin: 'recipient',
}

/** Onde a carga tem de ser deixada — outro município, outro CEP, outro número. */
const DELIVERY: PhysicalDestinationCandidate = {
  components: { cityCode: '3509502', number: '4500', postalCode: '13052000' },
  origin: 'delivery',
}

describe('resolve physical destination (spec 073 RF1/RF2)', () => {
  /**
   * A NF-e só emite `<entrega>` quando ele difere do cadastro do cliente. Quando ele vem, é ele
   * que diz onde o caminhão para — o `<enderDest>` diz quem é o cliente, que é outra pergunta.
   */
  it('prefers the delivery address over the recipient', () => {
    expect(resolvePhysicalDestination([RECIPIENT, DELIVERY])).toEqual(DELIVERY)
  })

  /** O caso de 345 em 345 notas reais medidas: sem `<entrega>`, nada muda. */
  it('falls back to the recipient when there is no delivery address', () => {
    expect(resolvePhysicalDestination([RECIPIENT])).toEqual(RECIPIENT)
  })

  /**
   * RF2: meio endereço é pior que o endereço do cadastro. O critério de "utilizável" é o mesmo
   * que a parada já usa — `buildStopAddressKey` conseguir montar chave.
   */
  it('falls back to the recipient when the delivery address has no usable postal code', () => {
    const truncado: PhysicalDestinationCandidate = {
      components: { cityCode: '3509502', number: '4500', postalCode: '1305' },
      origin: 'delivery',
    }

    expect(resolvePhysicalDestination([RECIPIENT, truncado])).toEqual(RECIPIENT)
  })

  /**
   * Endereço sem número é `S/N`, um lugar tão válido quanto outro qualquer — quem decide isso é
   * `normalizeAddressNumber`, e o seam não pode inventar um segundo critério ao lado dele.
   */
  it('accepts a delivery address without a number', () => {
    const semNumero: PhysicalDestinationCandidate = {
      components: { cityCode: '3509502', number: null, postalCode: '13052000' },
      origin: 'delivery',
    }

    expect(resolvePhysicalDestination([RECIPIENT, semNumero])).toEqual(semNumero)
  })

  /**
   * Quando nenhum dos dois monta chave, vence o destinatário — e o chamador segue tratando a nota
   * como `SEM ENDEREÇO`, exatamente como hoje. O seam não pode transformar um caso conhecido de
   * parada sem endereço num caso novo.
   */
  it('keeps the recipient when neither address is usable', () => {
    const recipienteRuim: PhysicalDestinationCandidate = {
      components: { cityCode: '3549102', number: '400', postalCode: '' },
      origin: 'recipient',
    }
    const entregaRuim: PhysicalDestinationCandidate = {
      components: { cityCode: '3509502', number: '4500', postalCode: 'abc' },
      origin: 'delivery',
    }

    expect(resolvePhysicalDestination([recipienteRuim, entregaRuim])).toEqual(recipienteRuim)
  })

  /** Nota que não resolve a participante nenhum continua sendo `null`, não erro. */
  it('returns null when the note has no destination party at all', () => {
    expect(resolvePhysicalDestination([])).toBeNull()
  })

  /**
   * RF4: quem consulta a parada precisa saber de onde o endereço veio. Sem isso, "o roteiro está
   * errado" é indepurável — e a origem é o rótulo, nunca o endereço (RNF1).
   */
  it('carries the origin of the address it chose', () => {
    expect(resolvePhysicalDestination([RECIPIENT, DELIVERY])?.origin).toBe('delivery')
    expect(resolvePhysicalDestination([RECIPIENT])?.origin).toBe('recipient')
  })
})

describe('pick physical destination by document (spec 073 RF3)', () => {
  const row = (documentId: string, candidate: PhysicalDestinationCandidate) => ({
    ...candidate,
    documentId,
  })

  /** Duas linhas por nota entram, uma sai — e a que sai é a da entrega. */
  it('collapses the two destination rows of a note into the delivery one', () => {
    const chosen = pickPhysicalDestinationByDocument([
      row('doc-a', RECIPIENT),
      row('doc-a', DELIVERY),
    ])

    expect(chosen.size).toBe(1)
    expect(chosen.get('doc-a')?.origin).toBe('delivery')
  })

  /** Notas diferentes não se contaminam: uma com entrega, outra sem, viram dois destinos. */
  it('keeps each note on its own address', () => {
    const chosen = pickPhysicalDestinationByDocument([
      row('com-entrega', RECIPIENT),
      row('com-entrega', DELIVERY),
      row('sem-entrega', RECIPIENT),
    ])

    expect(chosen.get('com-entrega')?.components.postalCode).toBe('13052000')
    expect(chosen.get('sem-entrega')?.components.postalCode).toBe('13872400')
  })

  /** Nota sem linha de destino é ausência no mapa, como antes desta spec — nunca erro. */
  it('leaves a note with no destination row out of the map', () => {
    expect(pickPhysicalDestinationByDocument([]).size).toBe(0)
  })
})

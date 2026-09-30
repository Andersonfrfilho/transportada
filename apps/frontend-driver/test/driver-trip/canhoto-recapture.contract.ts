/**
 * Spec 220 RF29: a nota volta para "Fotos pendentes" quando a conferência recusa o canhoto, e o
 * motorista precisa **ver o motivo** — sem ele a nota reaparece sem explicação e ele refaz a mesma
 * foto torta.
 *
 * O parser é a fronteira: `toPendingProof` recusa o item inteiro quando o essencial falta, mas o
 * motivo é acessório — item com motivo desconhecido continua na fila, só sem a explicação.
 */
import { describe, expect, it } from 'bun:test'

import { CANHOTO_REJECTION_REASONS } from '../../src/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '../../src/modules/driver-trip/shared/driverTripResponse.validation'
import driverTripLocale from '../../src/modules/driver-trip/locales/driverTrip.locale.json'
import driverTripEnglishLocale from '../../src/modules/driver-trip/locales/driverTrip.en.locale.json'

function snapshotWithPendingProof(pendingProof: Record<string, unknown>) {
  return toDriverTripSnapshot({
    data: {
      isRegisteredDriver: true,
      pendingProofs: [{ documentId: 'document-1', tripId: 'trip-1', ...pendingProof }],
      trips: [],
    },
  })
}

describe('o motivo da recusa chega ao motorista (RF29)', () => {
  it('sem recusa o campo é nulo — a fila antiga continua igual', () => {
    expect(snapshotWithPendingProof({}).pendingProofs[0]?.canhotoRejection).toBeNull()
  })

  it('motivo da lista fechada atravessa a fronteira', () => {
    expect(
      snapshotWithPendingProof({ canhotoRejection: { reason: 'illegible' } }).pendingProofs[0]
        ?.canhotoRejection,
    ).toEqual({ note: null, reason: 'illegible' })
  })

  it('`other` traz o texto livre junto', () => {
    expect(
      snapshotWithPendingProof({
        canhotoRejection: { note: 'refazer com a nota inteira no enquadramento', reason: 'other' },
      }).pendingProofs[0]?.canhotoRejection,
    ).toEqual({ note: 'refazer com a nota inteira no enquadramento', reason: 'other' })
  })

  /** API mais nova com um motivo que este app não conhece: a nota fica, a explicação não. */
  it('motivo fora da lista some sem derrubar a pendência', () => {
    const [pendingProof] = snapshotWithPendingProof({
      canhotoRejection: { reason: 'coffee_stain' },
    }).pendingProofs

    expect(pendingProof?.documentId).toBe('document-1')
    expect(pendingProof?.canhotoRejection).toBeNull()
  })

  it('recusa malformada não derruba a tela', () => {
    expect(
      snapshotWithPendingProof({ canhotoRejection: 'ilegível' }).pendingProofs[0],
    ).toBeDefined()
    expect(
      snapshotWithPendingProof({ canhotoRejection: { note: 'sem motivo' } }).pendingProofs[0]
        ?.canhotoRejection,
    ).toBeNull()
  })
})

describe('todo motivo tem texto nos dois idiomas', () => {
  const locales = {
    en: driverTripEnglishLocale,
    'pt-BR': driverTripLocale,
  } as const

  for (const [language, locale] of Object.entries(locales)) {
    it(`${language} nomeia os quatro motivos e o título da recusa`, () => {
      const rejection = (locale as { pendingProofs: { canhotoRejection: Record<string, string> } })
        .pendingProofs.canhotoRejection

      expect(Object.keys(rejection).sort()).toEqual([...CANHOTO_REJECTION_REASONS, 'title'].sort())
      for (const text of Object.values(rejection)) expect(text.length).toBeGreaterThan(0)
    })
  }
})

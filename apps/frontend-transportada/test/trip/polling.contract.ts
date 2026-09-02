/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'
import { resolveTripRefetchInterval } from '../../src/modules/trip/shared/tripPolling.service'

const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

function nota(separationStatus: string) {
  return { separationStatus }
}

/**
 * Spec 079. O `refetchInterval` já existia desde a spec 057 P2, mas olhava **só o estado da
 * viagem**: uma viagem despachada com tudo entregue seguia batendo no servidor de meio em meio
 * minuto, para sempre, até alguém fechar a aba.
 */
describe('quando a tela se atualiza sozinha (spec 079)', () => {
  it('repete enquanto há entrega pendente na rua', () => {
    expect(
      resolveTripRefetchInterval({
        documents: [nota('loaded'), nota('delivered')],
        status: 'dispatched',
      }),
    ).toBeGreaterThan(0)
  })

  /**
   * ⚠️ **Tudo entregue não é mais "na rua" para efeito de consulta.** O estado da viagem ainda pode
   * ser `dispatched` — ele só vira `completed` quando alguém fecha —, mas não há nada que possa
   * mudar sozinho, e repetir é bater no servidor por nada.
   */
  it('para quando não há mais o que entregar', () => {
    expect(
      resolveTripRefetchInterval({
        documents: [nota('delivered'), nota('returned')],
        status: 'dispatched',
      }),
    ).toBe(false)
  })

  /** Fora da rua, quem muda a viagem é quem está olhando a tela — e ele já vê o que fez. */
  it('não repete no galpão', () => {
    expect(resolveTripRefetchInterval({ documents: [nota('pending')], status: 'separating' })).toBe(
      false,
    )
    expect(resolveTripRefetchInterval({ documents: [nota('pending')], status: 'draft' })).toBe(
      false,
    )
  })

  /**
   * O botão existe **ao lado** do automático, não no lugar dele: quem está no galpão esperando a
   * baixa não espera meio minuto, e quem só acompanha não deve apertar nada.
   */
  it('a tela oferece a atualização rápida', () => {
    const source = readFileSync(DETAIL, 'utf8')

    expect(source).toInclude('refetch')
    expect(trip.detail.refreshNow).toBeString()
  })
})

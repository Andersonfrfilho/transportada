/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { resolveTripProgress } from '../../src/modules/trip/shared/tripProgress.service'

const AGORA = '2026-09-02T15:00:00.000Z'

function parada(sequence: number, arrivedAt: null | string, completedAt: null | string) {
  return { arrivedAt, completedAt, sequence }
}

describe('progresso e previsão da viagem (spec 079 T010)', () => {
  /**
   * ⚠️ Viagem em rascunho **não tem progresso nem previsão**: ela não tem roteiro, e um percentual
   * ali seria número sobre um trabalho que ainda não começou. `null` é a resposta, não zero.
   */
  it('rascunho não tem progresso', () => {
    expect(
      resolveTripProgress({ now: AGORA, status: 'draft', stops: [parada(1, null, null)] }),
    ).toBeNull()
  })

  it('sem parada nenhuma não há progresso', () => {
    expect(resolveTripProgress({ now: AGORA, status: 'dispatched', stops: [] })).toBeNull()
  })

  it('conta as paradas concluídas', () => {
    const progress = resolveTripProgress({
      now: AGORA,
      status: 'in_transit',
      stops: [
        parada(1, '2026-09-02T13:00:00.000Z', '2026-09-02T13:20:00.000Z'),
        parada(2, '2026-09-02T14:00:00.000Z', '2026-09-02T14:20:00.000Z'),
        parada(3, null, null),
        parada(4, null, null),
      ],
    })

    expect(progress?.completedStops).toBe(2)
    expect(progress?.totalStops).toBe(4)
    expect(progress?.percent).toBe(50)
  })

  /**
   * ⚠️ **Uma parada concluída não dá ritmo.** Com um único ponto não há intervalo para medir, e
   * dividir o tempo decorrido por 1 produziria uma previsão com cara de conta — que é pior que
   * ausência, porque parece medida.
   */
  it('não estima com menos de duas paradas concluídas', () => {
    const progress = resolveTripProgress({
      now: AGORA,
      status: 'in_transit',
      stops: [
        parada(1, '2026-09-02T14:00:00.000Z', '2026-09-02T14:20:00.000Z'),
        parada(2, null, null),
      ],
    })

    expect(progress?.percent).toBe(50)
    expect(progress?.estimatedCompletionAt).toBeNull()
  })

  /** Com ritmo medido, a previsão é o que resta vezes o intervalo médio entre conclusões. */
  it('estima pelo ritmo medido entre as conclusões', () => {
    const progress = resolveTripProgress({
      now: AGORA,
      status: 'in_transit',
      stops: [
        parada(1, null, '2026-09-02T13:00:00.000Z'),
        parada(2, null, '2026-09-02T14:00:00.000Z'),
        parada(3, null, null),
        parada(4, null, null),
      ],
    })

    // Uma hora por parada, duas restantes: 17:00.
    expect(progress?.estimatedCompletionAt).toBe('2026-09-02T17:00:00.000Z')
  })

  /** Viagem toda concluída não tem o que prever — e 100% não vira uma previsão para o passado. */
  it('viagem concluída não estima', () => {
    const progress = resolveTripProgress({
      now: AGORA,
      status: 'completed',
      stops: [
        parada(1, null, '2026-09-02T13:00:00.000Z'),
        parada(2, null, '2026-09-02T14:00:00.000Z'),
      ],
    })

    expect(progress?.percent).toBe(100)
    expect(progress?.estimatedCompletionAt).toBeNull()
  })
})

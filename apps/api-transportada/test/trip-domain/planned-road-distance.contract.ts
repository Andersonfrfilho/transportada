/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 RF4/D5/D9 (absorve a 148 D2): quanto a viagem roda, quanto disso é a volta ao barracão, e
 * quanto tempo leva.
 *
 * A razão de isto ser um seam e não uma soma escrita na linha de quem precisa: **`0` e `null` são
 * coisas diferentes**, e a diferença não sobrevive a uma soma inline. `end_policy = 'last_stop'` é
 * volta zero — o caminhão não volta, e zero é a medida certa. Rota indisponível é volta
 * desconhecida, e um zero ali diria "não roda nada na volta" numa conta de combustível.
 */
import { describe, expect, it } from 'bun:test'

import {
  summarizeRoadDistance,
  type RoadLeg,
} from '../../src/trips/domain/planned-road-distance.policy.js'

/** Barracão → Orlândia → Ipuã → barracão: três trechos, o último é a volta. */
const IDA_E_VOLTA: readonly RoadLeg[] = [
  { distanceMetres: 57_000, durationSeconds: 2_820 },
  { distanceMetres: 48_300, durationSeconds: 2_340 },
  { distanceMetres: 103_000, durationSeconds: 4_740 },
]

describe('a distância planejada da rota (spec 153 RF4/D9)', () => {
  it('soma a rota inteira e separa a perna da volta', () => {
    const resumo = summarizeRoadDistance({ legs: IDA_E_VOLTA, trailingLegs: 1 })

    expect(resumo.distanceMeters).toBe(208_300)
    expect(resumo.durationSeconds).toBe(9_900)
    expect(resumo.returnDistanceMeters).toBe(103_000)
  })

  /**
   * ⚠️ Caso extremo da spec: `last_stop` é volta **`0`**, não `null`. O caminhão fecha o dia na
   * última entrega — não há perna de retorno, e isso é uma medida, não uma lacuna.
   */
  it('volta é zero, não desconhecida, quando a rota termina na última entrega', () => {
    const resumo = summarizeRoadDistance({
      legs: IDA_E_VOLTA.slice(0, 2),
      trailingLegs: 0,
    })

    expect(resumo.returnDistanceMeters).toBe(0)
    expect(resumo.distanceMeters).toBe(105_300)
    expect(resumo.durationSeconds).toBe(5_160)
  })

  /**
   * ⚠️ D5, na forma mais direta que existe: sem estrada nada é zero. Zero de distância viraria
   * combustível zero numa viagem que roda, e o número plausível e errado é pior que número nenhum.
   */
  it('sem estrada nenhuma tudo é desconhecido — nunca zero', () => {
    const resumo = summarizeRoadDistance({ legs: [], trailingLegs: 0 })

    expect(resumo.distanceMeters).toBeNull()
    expect(resumo.durationSeconds).toBeNull()
    expect(resumo.returnDistanceMeters).toBeNull()
  })

  /**
   * A estrada não casa com o plano do barracão — mais pernas de volta do que trechos existem. O
   * total continua medido; a volta vira desconhecida em vez de recortar trecho errado.
   */
  it('não recorta volta que a estrada não comporta', () => {
    const resumo = summarizeRoadDistance({
      legs: [{ distanceMetres: 48_300, durationSeconds: 2_340 }],
      trailingLegs: 2,
    })

    expect(resumo.distanceMeters).toBe(48_300)
    expect(resumo.returnDistanceMeters).toBeNull()
  })
})

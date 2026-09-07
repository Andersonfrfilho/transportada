/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T7: o pedágio da montagem, imediatamente abaixo do tempo do roteiro. Este é o
 * contrato **de tela**, no molde de `test/trip/occupancy.contract.ts` — a política que soma
 * (`resolveTollRouteCost`, T5) já é da API, e o que este teste guarda é que a interface não
 * imprime o número sem a marca de estimativa.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { formatTariffMonth } from '../../src/modules/trip/shared/assemblyToll.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)

describe('pedágio na montagem (spec 090 T7)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('imprime a marca de estimativa quando o eixo é estimado', () => {
    expect(source).toInclude("toll.axles.source === 'estimated'")
    expect(source).toInclude("t('assemblyMap.toll.estimated')")
  })

  /**
   * ⚠️ A marca não pode ser condicional a mais nada além da origem do eixo — a mesma trava de
   * `test/trip/occupancy.contract.ts`.
   */
  it('não esconde a marca atrás de segunda condição', () => {
    const marca = source.slice(source.indexOf("toll.axles.source === 'estimated' ?"))
    const trecho = marca.slice(0, marca.indexOf('\n', marca.indexOf('assemblyMap.toll.estimated')))

    expect(trecho).not.toInclude('&&')
  })

  /** Sem pedágio calculado (sem veículo, ou nós não anotados) o bloco inteiro fica de fora. */
  it('não imprime o bloco quando o pedágio não foi calculado', () => {
    const semToll = source.slice(source.indexOf('const toll ='), source.indexOf('toll === null'))

    expect(semToll).not.toInclude('assemblyToll')
  })

  /** A contagem de praças sem tarifa é obrigatória — o total sozinho seria número crível e falso. */
  it('conta as praças sem tarifa conhecida', () => {
    expect(source).toInclude('toll.boothsWithoutCharge')
    expect(trip.assemblyMap.toll.withoutCharge).toInclude('{{count}}')
  })

  it('está montado logo abaixo do tempo do roteiro', () => {
    const totalTimeIndex = source.indexOf('assemblyMap.totalTime')
    const tollIndex = source.indexOf('toll === null ? null : (')

    expect(totalTimeIndex).toBeGreaterThan(-1)
    expect(tollIndex).toBeGreaterThan(totalTimeIndex)
  })
})

describe('a data da tarifa (spec 090 T7)', () => {
  it('converte a data do extract em mês por extenso, sem passar por fuso', () => {
    expect(formatTariffMonth('2026-07-01')).toBe('julho/2026')
    expect(formatTariffMonth('2026-01-31')).toBe('janeiro/2026')
  })

  it('devolve o valor cru quando o formato é inesperado', () => {
    expect(formatTariffMonth('não é uma data')).toBe('não é uma data')
  })
})

/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T8: as praças do pedágio, na ordem de passagem, com nome e operador — para quem
 * confere saber **por onde** o custo entrou. `resolveTollRouteCost` (T5) já devolve `booths` na
 * ordem certa; este contrato guarda só a tela.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)

describe('as praças do pedágio na descrição do roteiro (spec 090 T8)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('lista as praças na ordem de passagem, com nome e operador', () => {
    expect(source).toInclude('toll.booths')
    expect(source).toInclude("t('assemblyMap.toll.booth'")
    expect(trip.assemblyMap.toll.booth).toInclude('{{name}}')
    expect(trip.assemblyMap.toll.booth).toInclude('{{operator}}')
  })

  /** Rota sem praça nunca é lista vazia — ela diz que não há pedágio. */
  it('rota sem praça imprime que não há pedágio, nunca uma lista vazia', () => {
    expect(source).toInclude('toll.booths.length === 0')
    expect(source).toInclude("t('assemblyMap.toll.none')")
  })

  /** Praça sem nome ou operador conhecido pela API ainda entra na lista, com rótulo próprio. */
  it('não descarta praça sem nome ou operador conhecido', () => {
    expect(source).toInclude("t('assemblyMap.toll.boothUnnamed')")
    expect(source).toInclude("t('assemblyMap.toll.operatorUnknown')")
  })
})

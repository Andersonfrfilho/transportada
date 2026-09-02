/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import routing from '../../src/modules/routing/locales/routing.locale.json'
import {
  isProposalReordered,
  reorderProposedStops,
} from '../../src/modules/routing/shared/proposalOrder.service'

const PARADAS = [
  { addressKey: 'a', sequence: 1 },
  { addressKey: 'b', sequence: 2 },
  { addressKey: 'c', sequence: 3 },
]

const PANEL = new URL(
  '../../src/modules/routing/components/RouteSuggestionPanel.component.tsx',
  import.meta.url,
)

/**
 * Spec 079 T024. ⚠️ **Não é o arraste de `TripStopList`**, que reordena a viagem — aqui se reordena
 * a **proposta**, antes de existir viagem alguma com essa ordem.
 */
describe('reordenar a proposta (spec 079 T024)', () => {
  it('move a parada e renumera a sequência', () => {
    const reordenado = reorderProposedStops({ from: 0, stops: PARADAS, to: 2 })

    expect(reordenado.map((stop) => stop.addressKey)).toEqual(['b', 'c', 'a'])
    expect(reordenado.map((stop) => stop.sequence)).toEqual([1, 2, 3])
  })

  it('mover para o mesmo lugar não muda nada', () => {
    expect(reorderProposedStops({ from: 1, stops: PARADAS, to: 1 })).toEqual([...PARADAS])
  })

  it('índice fora da lista devolve a ordem intacta', () => {
    expect(reorderProposedStops({ from: 9, stops: PARADAS, to: 0 })).toEqual([...PARADAS])
  })

  /**
   * ⚠️ **O coração da decisão desta task.** Publicar a distância velha ao lado da ordem nova é a
   * mentira barata que a spec nomeia; **esconder sem dizer** é a versão silenciosa dela — quem viu
   * 51 km e depois não vê nada conclui que a tela quebrou.
   *
   * Recalcular exigiria a matriz do OSRM, que roda no worker (ADR-0044 §7). Então a distância sai,
   * e o lugar dela é ocupado pela frase que explica.
   */
  it('a distância não sobrevive à reordenação, e a tela diz por quê', () => {
    const source = readFileSync(PANEL, 'utf8')

    // ⚠️ A afirmação é sobre a **chamada**, não sobre o identificador: `toInclude('isReordered')`
    // passa com `const isReordered = false`, e foi o que a mutação revelou na primeira escrita.
    expect(source).toInclude('isProposalReordered({')
    expect(routing.panel.reorderedEstimates.toLowerCase()).toInclude('recalculada')
  })

  /** A regra que a tela consome, provada onde ela vive. */
  it('reconhece a ordem alterada', () => {
    expect(isProposalReordered({ current: PARADAS, original: PARADAS })).toBe(false)
    expect(
      isProposalReordered({
        current: reorderProposedStops({ from: 0, stops: PARADAS, to: 2 }),
        original: PARADAS,
      }),
    ).toBe(true)
  })
})

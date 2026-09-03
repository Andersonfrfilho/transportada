/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)

/**
 * Spec 079 T021. **A ordem é o que a task entrega**, e ela se prova lendo o JSX — não há DOM no
 * teste desta app, e um contrato que só afirmasse "o bloco existe" passaria com ele no rodapé.
 *
 * O motivo da ordem: numa viagem com doze paradas, "Vincular nota" e "Ações da viagem" ficavam
 * abaixo de toda a lista. Quem abria a tela para despachar rolava a viagem inteira para achar o
 * botão — e é a mesma família do painel que nascia duas telas abaixo do clique
 * (`docs/frontend/panels.md`).
 */
describe('a ordem do detalhe da viagem (spec 079 T021)', () => {
  const source = readFileSync(DETAIL, 'utf8')

  function posicaoDe(marcador: string): number {
    const posicao = source.indexOf(marcador)
    expect(posicao).toBeGreaterThan(-1)
    return posicao
  }

  it('vincular nota e ações da viagem vêm antes da lista de paradas', () => {
    const paradas = posicaoDe('<TripStopList')

    expect(posicaoDe("t('detail.linkDocumentTitle')")).toBeLessThan(paradas)
    expect(posicaoDe('<TripStateActions')).toBeLessThan(paradas)
  })

  /**
   * O progresso e a ocupação continuam **acima** dos dois: eles são o que se lê antes de decidir o
   * que fazer, e empurrá-los para baixo dos botões trocaria um problema de ordem por outro.
   */
  it('o que se lê vem antes do que se aperta', () => {
    const acoes = posicaoDe('<TripStateActions')

    expect(posicaoDe('<TripProcessFlow')).toBeLessThan(acoes)
    expect(posicaoDe('<TripOccupancyPanel')).toBeLessThan(acoes)
  })
})

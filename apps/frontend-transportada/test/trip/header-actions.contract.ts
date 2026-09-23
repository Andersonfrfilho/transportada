/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 170: as ações de **estado** da viagem sobem para o cabeçalho, junto do status. Elas ficavam
 * numa seção no meio da página — depois do progresso, da ocupação e do mapa —, e quem abria a tela
 * para decidir o que fazer com a viagem rolava para achar o botão. A prontidão fiscal, que diz o
 * que **barra** o próximo passo, morava em outro bloco ainda mais abaixo: a mesma decisão, partida
 * em três lugares por acaso de implementação.
 *
 * ⚠️ As ações em **lote** (sobre o maço selecionado) continuam onde estão: elas pertencem à
 * seleção, não ao estado da viagem. Subir as duas coisas juntas trocaria um problema de ordem por
 * outro — é o mesmo raciocínio que a spec 079 T021 registrou ao descer os botões do topo.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const DETALHE = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const CABECALHO = new URL(
  '../../src/modules/trip/components/TripHeaderActions.component.tsx',
  import.meta.url,
)
const LOTE = new URL(
  '../../src/modules/trip/components/TripStateActions.component.tsx',
  import.meta.url,
)

describe('ações de estado no cabeçalho da viagem (spec 170)', () => {
  const detalhe = readFileSync(DETALHE, 'utf8')
  const cabecalho = readFileSync(CABECALHO, 'utf8')
  const lote = readFileSync(LOTE, 'utf8')

  function posicaoNoDetalhe(marcador: string): number {
    const posicao = detalhe.indexOf(marcador)
    expect(posicao).toBeGreaterThan(-1)
    return posicao
  }

  it('o cabeçalho hospeda as ações de estado, antes de tudo o que se lê', () => {
    const acoes = posicaoNoDetalhe('<TripHeaderActions')

    expect(acoes).toBeLessThan(posicaoNoDetalhe('<TripProcessFlow'))
    expect(acoes).toBeLessThan(posicaoNoDetalhe('<TripStateActions'))
  })

  it('liberar, despachar e cancelar moram no cabeçalho', () => {
    expect(cabecalho).toContain("t('stateActions.planRoute')")
    expect(cabecalho).toContain("t('stateActions.dispatch')")
    expect(cabecalho).toContain("t('stateActions.cancel')")
  })

  /** Duas casas para a mesma ação é a divergência que esta spec existe para não criar. */
  it('a seção antiga não guarda mais as ações de estado', () => {
    expect(lote).not.toContain("t('stateActions.planRoute')")
    expect(lote).not.toContain("t('stateActions.dispatch')")
    expect(lote).not.toContain("t('stateActions.cancel')")
  })

  it('as ações em lote continuam na seção do maço selecionado', () => {
    expect(lote).toContain('selection.selectedIds')
    expect(cabecalho).not.toContain('selection.selectedIds')
  })

  /** A destrutiva é a última e tem tratamento próprio (revisão de design de 23/09). */
  it('cancelar é a última e usa a classe da destrutiva', () => {
    expect(cabecalho).toContain('actionDestructive')
    expect(cabecalho.indexOf("t('stateActions.cancel')")).toBeGreaterThan(
      cabecalho.indexOf("t('stateActions.planRoute')"),
    )
  })

  /** RF2: o que barra o próximo passo aparece junto de quem libera, resumido. */
  it('o cabeçalho resume a prontidão fiscal', () => {
    expect(cabecalho).toContain('fiscalReadiness')
    expect(cabecalho).toContain("t('stateActions.readinessSummary'")
  })
})

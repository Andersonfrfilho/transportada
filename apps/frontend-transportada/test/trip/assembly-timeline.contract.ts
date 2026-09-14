/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const MAPA = 'src/modules/trip/components/TripAssemblyMap.component.tsx'
const DIALOGO = 'src/modules/trip/components/TripQuickCreateDialog.component.tsx'
const CSS = 'src/modules/trip/styles/trip.module.css'
const LOCALE = 'src/modules/trip/locales/trip.locale.json'

function fonte(caminho: string): string {
  return readFileSync(new URL(`../../${caminho}`, import.meta.url), 'utf8')
}

/**
 * ⚠️ **O roteiro é uma sequência, e o barracão é o começo dela.** A saída e o retorno viviam como
 * dois parágrafos soltos em volta da lista: quem lia via três entregas numeradas e, fora delas, duas
 * frases que pareciam rodapé. O disco põe as cinco coisas na mesma coluna, e o traço diz que uma
 * leva à outra.
 */
describe('a linha do tempo do roteiro', () => {
  it('o barracão ganha o mesmo disco da parada, com o glifo da organização', () => {
    const source = fonte(MAPA)

    expect(source).toContain('assemblyBulletDepot')
    expect(source).toContain('<Icon name="organization" />')
  })

  /**
   * ⚠️ A forma é o que separa origem de entrega — nunca a cor, que não sobrevive ao daltonismo nem
   * ao mapa impresso. Por isso o disco do barracão não recebe número: ele não está na sequência de
   * entregas e não recebe carga.
   */
  it('o disco do barracão e o da praça não carregam número', () => {
    const source = fonte(MAPA)
    const inicio = source.indexOf('assemblyBulletDepot')
    const trecho = source.slice(inicio, inicio + 400)

    expect(trecho).not.toContain('point.sequence')
  })

  it('a saída e o retorno são linhas da lista, não parágrafos ao redor dela', () => {
    const source = fonte(MAPA)

    expect(source).toContain('assemblyMilestone')
    /** O bloco solto de antes não pode voltar: ele duplicaria o barracão na tela. */
    expect(source).not.toContain('assemblyDepotCard')
    expect(source).not.toContain('assemblyDepotLeg')
  })

  /**
   * ⚠️ **Disco cheio, não contorno vazado.** O barracão nasceu com `background: var(--color-asphalt)`
   * — o mesmo tom do fundo — e a praça com `--color-amber`, que **não existe em token nenhum**: os
   * dois círculos apareciam vazios na tela. Contorno colorido sobre fundo igual não é disco.
   */
  it('os discos do barracão e da praça são preenchidos, com token que existe', () => {
    const css = fonte(CSS)
    const tokens = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8')
    const inicio = css.indexOf('.assemblyBulletDepot {')
    const trecho = css.slice(inicio, css.indexOf('.assemblyTollBooth'))

    for (const token of trecho.match(/--color-[a-z-]+/g) ?? []) {
      expect(tokens).toContain(`${token}:`)
    }
    expect(trecho).not.toContain('var(--color-asphalt)')
  })

  /**
   * ⚠️ O traço vive na **linha**, não na lista: um pseudo-elemento único no `ul` teria de adivinhar
   * onde o primeiro e o último disco caem, e as alturas variam — barracão com endereço, praça com
   * uma linha, parada com seis notas.
   */
  it('o traço liga os discos e para no primeiro e no último', () => {
    const css = fonte(CSS)

    expect(css).toContain('.assemblyOrder li::before')
    expect(css).toContain('.assemblyOrder li:first-child::before')
    expect(css).toContain('.assemblyOrder li:last-child::before')
  })
})

/**
 * ⚠️ **Quem diz em que trecho a praça cai é a API, e o campo é `legIndex`.** A primeira tentativa
 * casava a coordenada da praça com a polilinha da rota, e ela não tinha como funcionar: a polilinha
 * publicada é simplificada, e num roteiro que fecha no barracão a ida e a volta correm sobre a mesma
 * rodovia — o par de cancelas gêmeas caía inteiro no mesmo trecho, antes da primeira entrega, e a
 * volta ficava sem pedágio nenhum. A anotação de nós do OSRM, agrupada por trecho, responde exato.
 */
describe('a praça entre as paradas certas', () => {
  it('a linha usa o trecho que a API publica, e não uma conta de geometria', () => {
    const source = fonte(MAPA)

    expect(source).toContain('booth.legIndex')
    expect(source).not.toContain('placeTollBooths')
  })

  /**
   * ⚠️ Praça sem trecho conhecido **não vira trecho zero**: ela fica fora da sequência e continua no
   * extrato completo, que é onde ela sempre esteve. Pendurá-la na saída do barracão por falta de
   * dado poria um custo ao pé do caminho errado, sem ninguém perceber.
   */
  it('sem trecho conhecido a praça não entra na sequência', () => {
    const source = fonte(MAPA)

    expect(source).toContain('(booth.legIndex ?? null) === legIndex')
  })
})

/**
 * ⚠️ Tirar a parada tira **todas as notas** que param nela: a parada é o endereço, e deixar uma nota
 * para trás recriaria a mesma parada na linha seguinte, com o operador achando que o clique não
 * pegou.
 */
describe('remover a parada', () => {
  it('o botão fica ao lado dos de prioridade e nomeia a parada', () => {
    const source = fonte(MAPA)

    expect(source).toContain('assemblyMap.removeStop')
    expect(source).toContain('<Icon name="trash" />')
    expect(source).toContain('point.notes.map((note) => note.id)')
  })

  /** Botão que não faz nada é pior que botão ausente. */
  it('sem quem receba a remoção, o botão não é desenhado', () => {
    expect(fonte(MAPA)).toContain('onStopRemove === undefined ? null')
  })

  it('o diálogo traduz id de nota para a chave que a fila conhece', () => {
    const source = fonte(DIALOGO)

    expect(source).toContain('onStopRemove=')
    expect(source).toContain('quickCreate.removeEntry(document.accessKey)')
  })

  it('tem rótulo acessível para o botão', () => {
    const locale = JSON.parse(fonte(LOCALE)) as {
      assemblyMap: Record<string, string>
    }

    expect(locale.assemblyMap.removeStop).toContain('{{label}}')
  })
})

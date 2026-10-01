/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: o título "Linha do tempo" media 18,72px contra 15,2px dos seis blocos irmãos da mesma
 * página — "Carga da viagem", "O que falta medir", "Mapa do roteiro", "Ações da viagem", "Cargas da
 * viagem", "Prontidão fiscal". Não era uma escolha: `.head h3` zerava a margem e não declarava
 * tamanho nenhum, então caía no padrão do agente (1.17em). O maior título da página passou a ser o
 * da linha do tempo por omissão.
 *
 * O valor dos irmãos vem de `.panel h3` no `trip.module.css`, e é um literal — **não existe família
 * `--font-size-*` definida neste projeto**: os `var(--font-size-xs, 0.75rem)` espalhados pelo
 * `trip.module.css` citam um nome que ninguém declara e sempre caem no fallback. Enquanto o token
 * não existir, igualar é citar o mesmo literal; é isso que este caso trava, junto da referência
 * cruzada que impede os dois de divergirem em silêncio outra vez.
 */
import { describe, expect, it } from 'bun:test'

const TIMELINE_STYLES_PATH = new URL(
  '../../src/modules/trip/styles/tripTimeline.module.css',
  import.meta.url,
)

const PANEL_STYLES_PATH = new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url)

const timelineStyles = await Bun.file(TIMELINE_STYLES_PATH).text()
const panelStyles = await Bun.file(PANEL_STYLES_PATH).text()

function readRuleBlock(styles: string, selector: string): string {
  const start = styles.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`regra ausente: ${selector}`)
  const end = styles.indexOf('}', start)
  if (end === -1) throw new Error(`regra sem fechamento: ${selector}`)
  return styles.slice(start, end)
}

function readFontSize(styles: string, selector: string): string {
  const declaration = /font-size:\s*([^;]+);/u.exec(readRuleBlock(styles, selector))
  if (declaration === null) throw new Error(`regra sem font-size: ${selector}`)
  return (declaration[1] ?? '').trim()
}

describe('escala do título da linha do tempo (spec 196)', () => {
  it('o título declara o próprio tamanho, em vez de herdar o padrão do agente', () => {
    expect(readRuleBlock(timelineStyles, '.head h3')).toMatch(/font-size:/u)
  })

  it('e o tamanho é o mesmo dos blocos irmãos da página, lido do arquivo deles', () => {
    expect(readFontSize(timelineStyles, '.head h3')).toBe(readFontSize(panelStyles, '.panel h3'))
  })
})

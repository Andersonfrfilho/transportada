/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TOOLTIP_COMPONENT_PATH = 'src/components/ui/tooltip.tsx'
const TOOLTIP_STYLES_PATH = 'src/components/ui/tooltip.module.css'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** Lê um bloco de regra pelo seletor, para conferir o que ela declara sem parser de CSS. */
function readRuleBlock(styles: string, selector: string): null | string {
  const start = styles.indexOf(`${selector} {`)
  if (start === -1) return null
  const end = styles.indexOf('}', start)
  return end === -1 ? null : styles.slice(start, end)
}

describe('design system tooltip contract', () => {
  test('publica um tooltip só, em vez de um por módulo', async () => {
    const component = await readApplicationFile(TOOLTIP_COMPONENT_PATH)

    expect(component).toContain('export function Tooltip(')
    expect(component).toContain('label: string')
  })

  /**
   * O `title` nativo espera cerca de um segundo, e foi por isso que ele deixou de servir: nesse
   * tempo quem passou o mouse já concluiu que não há dica nenhuma. Um atraso que voltasse a essa
   * ordem de grandeza devolveria o defeito que este componente existe para consertar.
   */
  test('abre bem antes do title nativo', async () => {
    const component = await readApplicationFile(TOOLTIP_COMPONENT_PATH)
    const delay = /TOOLTIP_OPEN_DELAY_MS = (\d+)/u.exec(component)?.[1]

    expect(delay).toBeDefined()
    expect(Number(delay)).toBeGreaterThan(0)
    expect(Number(delay)).toBeLessThanOrEqual(300)
  })

  /** Dica que só existe para quem tem mouse é informação que some para quem navega por Tab. */
  test('abre no foco de teclado, não só no ponteiro', async () => {
    const component = await readApplicationFile(TOOLTIP_COMPONENT_PATH)

    expect(component).toContain('onFocus')
    expect(component).toContain('onBlur')
    expect(component).toContain('onMouseEnter')
    expect(component).toContain('onMouseLeave')
  })

  /**
   * A dica é **descrição**, nunca o nome acessível: botão só de ícone continua precisando do
   * `aria-label` nele mesmo, porque leitor de tela não aponta o mouse para lugar nenhum.
   */
  test('entra como aria-describedby, e some junto com a camada', async () => {
    const component = await readApplicationFile(TOOLTIP_COMPONENT_PATH)

    expect(component).toContain('aria-describedby')
    expect(component).toContain('isOpen ? describedById : undefined')
    /** O atributo **escrito**, não a palavra: o comentário acima explica justamente por que ela não entra. */
    expect(component).not.toContain('aria-label=')
  })

  /**
   * Dentro de modal ou de tabela rolável o `position: absolute` seria recortado pelo `overflow` do
   * ancestral — a mesma razão que pôs a lista do select em portal.
   */
  test('renderiza em portal e se posiciona pela camada flutuante', async () => {
    const component = await readApplicationFile(TOOLTIP_COMPONENT_PATH)

    expect(component).toContain('createPortal')
    expect(component).toContain('document.body')
    expect(component).toContain('useFloatingLayer')
  })

  /**
   * ⚠️ `display: contents` não gera caixa, e `getBoundingClientRect()` devolveria zeros — a dica
   * nasceria no canto da tela. O invólucro precisa de caixa própria.
   */
  test('o gatilho tem caixa, senão a dica não acha o âncora', async () => {
    const styles = await readApplicationFile(TOOLTIP_STYLES_PATH)
    const trigger = readRuleBlock(styles, '.trigger')

    expect(trigger).not.toBeNull()
    expect(trigger).toContain('inline-flex')
    expect(trigger).not.toContain('display: contents')
  })

  /** Sob o cursor a camada dispararia o `mouseleave` do próprio gatilho, e a dica piscaria. */
  test('a camada não recebe o ponteiro', async () => {
    const styles = await readApplicationFile(TOOLTIP_STYLES_PATH)
    const layer = readRuleBlock(styles, '.layer')

    expect(layer).not.toBeNull()
    expect(layer).toContain('pointer-events: none')
    expect(layer).toContain('position: fixed')
  })

  /** Dois tooltips com caras diferentes no mesmo produto é a inconsistência que o web.md §9 reprova. */
  test('veste os tokens, nunca cor literal', async () => {
    const styles = await readApplicationFile(TOOLTIP_STYLES_PATH)
    const layer = readRuleBlock(styles, '.layer') ?? ''

    expect(layer).toContain('var(--color-graphite)')
    expect(layer).toContain('var(--color-fog)')
    expect(/#[0-9a-f]{3,8}\b/iu.test(layer)).toBe(false)
  })
})

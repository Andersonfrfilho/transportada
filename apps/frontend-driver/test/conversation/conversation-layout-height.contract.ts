import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'

const conversationCss = readFileSync(
  new URL('../../src/modules/conversation/styles/conversation.module.css', import.meta.url),
  'utf8',
)
const tripCss = readFileSync(
  new URL('../../src/modules/driver-trip/styles/driverTrip.module.css', import.meta.url),
  'utf8',
)
const indexCss = readFileSync(new URL('../../src/styles/index.css', import.meta.url), 'utf8')

function extractRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`)
  return start === -1 ? '' : css.slice(start, css.indexOf('}', start))
}

// Prova fraca: a geometria (textarea.bottom <= nav.top) é do smoke Playwright.
describe('altura da conversa acima da barra inferior', () => {
  it('a casca ocupa a janela até o topo da barra e organiza a coluna', () => {
    const shell = extractRule(conversationCss, '.conversationShell')
    expect(shell).toContain('position: fixed')
    expect(shell).toContain('bottom: var(--driver-bottom-bar-height)')
    expect(shell).toContain('flex-direction: column')
    expect(shell).toContain('min-height: 0')
  })

  it('o filho do pacote preenche o contêiner sem estourar', () => {
    const root = extractRule(conversationCss, '.conversationMain > :global(.cv-p-root)')
    expect(root).toContain('flex: 1')
    expect(root).toContain('min-height: 0')
  })

  it('a altura da barra é uma variável compartilhada com a área segura', () => {
    expect(indexCss).toContain('--driver-bottom-bar-height: calc(')
    expect(indexCss).toContain('safe-area-inset-bottom')
    expect(extractRule(tripCss, '.bottomBar')).toContain(
      'min-height: var(--driver-bottom-bar-height)',
    )
  })
})

describe('selo de não lidas na barra inferior', () => {
  it('fica dentro da aba, deslocado do ícone e com folga da borda superior', () => {
    const badge = extractRule(conversationCss, '.unreadBadge')
    expect(badge).toContain('top: var(--space-1)')
    expect(badge).toContain('inset-inline-start: calc(50% + var(--space-2))')
    expect(badge).not.toMatch(/top:\s*calc\(/u)
    expect(badge).not.toMatch(/(?:^|\s)right:/u)
  })

  it('o item da aba mantém o alvo de toque de 44px', () => {
    expect(extractRule(tripCss, '.bottomBarItem')).toContain('min-height: 2.75rem')
  })
})

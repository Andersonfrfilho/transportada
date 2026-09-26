import { describe, expect, test } from 'bun:test'

/**
 * A barra de navegação não quebrava linha: em 390px o "Sair" terminava fora da tela e o documento
 * inteiro ganhava rolagem horizontal (`scrollWidth` 424, medido em 25/09/2026 na primeira tela).
 * Esta app não tem teste de tela, então o que se prende é o CSS que impede a volta do defeito.
 */

const STYLESHEET_PATH = new URL('../../src/styles/index.css', import.meta.url).pathname
const MAIN_PATH = new URL('../../src/main.tsx', import.meta.url).pathname

function readRule(stylesheet: string, selector: string): string {
  const ruleStart = stylesheet.indexOf(`${selector} {`)
  if (ruleStart === -1) return ''
  return stylesheet.slice(ruleStart, stylesheet.indexOf('}', ruleStart))
}

describe('navegação do portal no celular', () => {
  test('a barra quebra linha em vez de empurrar o "Sair" para fora da tela', async () => {
    const stylesheet = await Bun.file(STYLESHEET_PATH).text()
    const rule = readRule(stylesheet, '.nav')

    expect(rule).toContain('display: flex')
    expect(rule).toContain('flex-wrap: wrap')
  })

  test('o "Sair" se afasta das abas pela margem, sem esconder item nenhum', async () => {
    const [stylesheet, main] = await Promise.all([
      Bun.file(STYLESHEET_PATH).text(),
      Bun.file(MAIN_PATH).text(),
    ])

    expect(readRule(stylesheet, '.nav__logout')).toContain('margin-inline-start: auto')
    expect(main).toContain('className="secondary nav__logout"')
    expect(stylesheet).not.toMatch(/\.nav[\w-]*\s*\{[^}]*display:\s*none/u)
  })

  test('responsividade só acrescenta por min-width, nunca remove por max-width', async () => {
    const stylesheet = await Bun.file(STYLESHEET_PATH).text()

    expect(stylesheet).not.toMatch(/@media[^{]*max-width/u)
  })
})

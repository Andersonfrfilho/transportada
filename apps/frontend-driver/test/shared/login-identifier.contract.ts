/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readRule(stylesheet: string, selector: string): string {
  const start = stylesheet.indexOf(`${selector} {`)
  if (start === -1) throw new Error(`RULE_NOT_FOUND: ${selector}`)
  return stylesheet.slice(start, stylesheet.indexOf('}', start))
}

/**
 * A entrada é a primeira metade do login, e a segunda é o tema do Keycloak
 * (`deploy/keycloak/theme/login`): a pessoa passa de uma para a outra sem sentir a troca. Campo de
 * canto reto, a marca da transportadora no alto e os textos centralizados, como lá.
 */
describe('a tela de entrada segue o tema do Keycloak', () => {
  test('mostra a marca da transportadora (logo e nome)', async () => {
    const page = await readApplicationFile('src/modules/shared/LoginIdentifier.page.tsx')

    expect(page).toContain('useInstallationBrandView()')
    expect(page).toContain('<InstallationBrandMark')
  })

  /**
   * A marca vem de `useInstallationBrandView`, que é TanStack Query: fora do `QueryClientProvider`
   * a tela lança no render e o campo nunca aparece. Derrubou o smoke do service worker na CI.
   */
  test('a tela de entrada é montada dentro do QueryClientProvider', async () => {
    const main = await readApplicationFile('src/main.tsx')
    const renderScreen = main.slice(
      main.indexOf('function renderScreen('),
      main.indexOf('\n}\n', main.indexOf('function renderScreen(')),
    )

    expect(renderScreen).toContain('<QueryClientProvider client={queryClient}>')
  })

  test('o campo tem canto reto, como o `.field-input` do tema', async () => {
    const stylesheet = await readApplicationFile('src/styles/index.css')

    expect(readRule(stylesheet, '.login__input')).toContain('border-radius: 0')
  })

  test('marca, título e textos ficam centralizados', async () => {
    const stylesheet = await readApplicationFile('src/styles/index.css')

    for (const selector of ['.login__brand', '.login__title', '.login__subtitle', '.login__hint']) {
      expect(readRule(stylesheet, selector)).toContain('text-align: center')
    }
  })
})
